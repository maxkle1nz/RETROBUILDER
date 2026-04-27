#!/usr/bin/env tsx
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const TARGET_URL = (process.env.RETROBUILDER_TEST_BASE || 'http://127.0.0.1:7777').replace(/\/+$/, '');

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to allocate a free port.'));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function chromiumBinary() {
  if (process.env.CHROMIUM_BIN) return process.env.CHROMIUM_BIN;
  const candidates = [
    '/opt/homebrew/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return candidates.find((candidate) => existsSync(candidate)) || 'chromium';
}

async function getPageWsUrl(port: number) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) throw new Error(`CDP target list failed: ${response.status}`);
  const targets = await response.json() as Array<{ type?: string; webSocketDebuggerUrl?: string }>;
  const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  if (!page?.webSocketDebuggerUrl) throw new Error('No page targets exposed by Chromium CDP.');
  return page.webSocketDebuggerUrl;
}

type CdpResponse = {
  id?: number;
  result?: { result?: { value?: unknown } };
  exceptionDetails?: unknown;
};

class CdpClient {
  private messageId = 0;
  private pending = new Map<number, { resolve: (value: CdpResponse) => void; reject: (error: Error) => void }>();

  constructor(private readonly ws: WebSocket) {
    this.ws.addEventListener('message', (event) => {
      const payload = typeof event.data === 'string' ? event.data : Buffer.from(event.data as ArrayBuffer).toString('utf8');
      const message = JSON.parse(payload) as CdpResponse;
      if (!message.id) return;
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      waiter.resolve(message);
    });
    this.ws.addEventListener('error', () => {
      for (const waiter of this.pending.values()) waiter.reject(new Error('Chromium CDP WebSocket failed.'));
      this.pending.clear();
    });
  }

  static async connect(url: string) {
    expect(globalThis.WebSocket, 'Node global WebSocket is required for this CDP test.');
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true });
      ws.addEventListener('error', () => reject(new Error('Failed to connect to Chromium CDP WebSocket.')), { once: true });
    });
    return new CdpClient(ws);
  }

  close() {
    this.ws.close();
  }

  async call(method: string, params: Record<string, unknown> = {}) {
    this.messageId += 1;
    const id = this.messageId;
    const response = new Promise<CdpResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.ws.send(JSON.stringify({ id, method, params }));
    return await response;
  }

  async evaluate<T>(expression: string): Promise<T> {
    const response = await this.call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (response.exceptionDetails) {
      throw new Error(`Runtime.evaluate failed: ${JSON.stringify(response.exceptionDetails).slice(0, 1200)}`);
    }
    return response.result?.result?.value as T;
  }
}

async function waitForCdpTarget(port: number) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      return await getPageWsUrl(port);
    } catch {
      await delay(250);
    }
  }
  throw new Error('Chromium CDP did not expose a page target.');
}

async function stopChromium(proc: ChildProcess) {
  if (proc.exitCode !== null || proc.signalCode) return;
  proc.kill('SIGTERM');
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (proc.exitCode !== null || proc.signalCode) return;
    await delay(100);
  }
  proc.kill('SIGKILL');
}

async function healthCheck() {
  try {
    const response = await fetch(`${TARGET_URL}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

function targetPort() {
  try {
    return new URL(TARGET_URL).port || '7777';
  } catch {
    return '7777';
  }
}

async function ensureRetrobuilderServer() {
  if (await healthCheck()) return null;

  const port = targetPort();
  const proc = spawn('npx', ['tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RETROBUILDER_PORT: port,
      PORT: port,
      DISABLE_HMR: 'true',
      THEBRIDGE_AUTO_START: process.env.THEBRIDGE_AUTO_START || '0',
    },
    stdio: 'ignore',
  });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await healthCheck()) return proc;
    await delay(500);
  }

  await stopChromium(proc);
  throw new Error(`Could not start Retrobuilder test server at ${TARGET_URL}.`);
}

async function run() {
  const serverProc = await ensureRetrobuilderServer();
  const userDataDir = await mkdtemp(join(tmpdir(), 'retrobuilder-ui-providers-'));
  const port = await freePort();
  const proc = spawn(chromiumBinary(), [
    `--remote-debugging-port=${port}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${userDataDir}`,
    TARGET_URL,
  ], { stdio: 'ignore' });

  let cdp: CdpClient | null = null;
  try {
    cdp = await CdpClient.connect(await waitForCdpTarget(port));
    await cdp.call('Page.enable');
    await cdp.call('Runtime.enable');
    await cdp.evaluate(`(() => {
      localStorage.setItem("retrobuilder-state", JSON.stringify({
        state: {
          appMode: "architect",
          activeProvider: "bridge",
          activeModel: null,
          activeAuthProfile: "github-copilot:github",
          showSessionLauncher: false,
          showEnvConfigModal: true
        },
        version: 0
      }));
      location.reload();
      return true;
    })()`);

    let body = '';
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await delay(500);
      body = await cdp.evaluate<string>('document.body ? document.body.innerText : ""') || '';
      if (body.includes('Project Keys & Provider Config') && body.includes('THE BRIDGE')) break;
    }

    const normalized = body.toUpperCase();
    expect(normalized.includes('PROJECT KEYS & PROVIDER CONFIG'), `Provider config modal did not render:\n${body.slice(0, 1600)}`);
    expect(normalized.includes('THE BRIDGE'), `Provider config modal did not render THE BRIDGE provider card:\n${body.slice(0, 2200)}`);

    const switchResult = await cdp.evaluate<string>(`(() => {
      const select = [...document.querySelectorAll('select')][0];
      if (!select) return 'missing-provider-select';
      select.value = 'bridge';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return 'switched-provider';
    })()`);
    expect(switchResult === 'switched-provider', `Could not switch provider select to bridge. Got: ${switchResult}`);

    let bridgeProfileVisible = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await delay(300);
      body = await cdp.evaluate<string>('document.body ? document.body.innerText : ""') || '';
      if (body.toUpperCase().includes('BRIDGE AUTH PROFILE')) {
        bridgeProfileVisible = true;
        break;
      }
    }
    expect(bridgeProfileVisible, `Bridge auth profile selector did not render after choosing bridge provider:\n${body.slice(0, 2200)}`);

    console.log('PASS Chromium CDP provider-config smoke: bridge card and auth profile selector rendered');
  } finally {
    cdp?.close();
    await stopChromium(proc);
    if (serverProc) await stopChromium(serverProc);
    await rm(userDataDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error('FAIL Chromium CDP provider-config smoke');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
