#!/usr/bin/env tsx
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = (process.env.RETROBUILDER_TEST_BASE || 'http://127.0.0.1:7777').replace(/\/+$/, '');
const BROWSER_ARTIFACT_DIR = process.env.RETROBUILDER_BROWSER_ARTIFACT_DIR?.trim();
const VIEWPORT = { width: 856, height: 842 };

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
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

async function api(method: string, path: string, payload?: unknown) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}): ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function getPageWsUrl(port: number) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) {
    throw new Error(`CDP target list failed: ${response.status}`);
  }
  const targets = await response.json() as Array<{ type?: string; webSocketDebuggerUrl?: string }>;
  const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  if (!page?.webSocketDebuggerUrl) {
    throw new Error('No page targets exposed by Chromium CDP.');
  }
  return page.webSocketDebuggerUrl;
}

type CdpResponse = {
  id?: number;
  result?: {
    data?: string;
    result?: {
      value?: unknown;
    };
  };
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
      for (const waiter of this.pending.values()) {
        waiter.reject(new Error('Chromium CDP WebSocket failed.'));
      }
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

  const exited = new Promise<void>((resolve) => {
    proc.once('exit', () => resolve());
  });

  proc.kill('SIGTERM');
  await Promise.race([
    exited,
    delay(3000).then(() => {
      if (proc.exitCode === null && !proc.signalCode) proc.kill('SIGKILL');
    }),
  ]);
  await Promise.race([exited, delay(1000)]);
}

async function withBrowser<T>(targetUrl: string, run: (cdp: CdpClient) => Promise<T>) {
  const userDataDir = await mkdtemp(join(tmpdir(), 'retrobuilder-knowledge-cdp-'));
  const port = await freePort();
  let proc: ChildProcess | null = null;
  let cdp: CdpClient | null = null;

  try {
    proc = spawn(chromiumBinary(), [
      `--remote-debugging-port=${port}`,
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      `--user-data-dir=${userDataDir}`,
      targetUrl,
    ], { stdio: 'ignore' });

    const wsUrl = await waitForCdpTarget(port);
    cdp = await CdpClient.connect(wsUrl);
    await cdp.call('Page.enable');
    await cdp.call('Runtime.enable');
    await cdp.call('Emulation.setDeviceMetricsOverride', {
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    return await run(cdp);
  } finally {
    cdp?.close();
    if (proc) await stopChromium(proc);
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

async function waitForBody(cdp: CdpClient, predicate: (body: string) => boolean, message: string, attempts = 40) {
  let body = '';
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    body = await cdp.evaluate<string>('document.body ? document.body.innerText : ""');
    if (predicate(body)) return body;
    await delay(500);
  }
  throw new Error(`${message}\n${body.slice(0, 2500)}`);
}

async function captureBrowserArtifact(cdp: CdpClient, name: string) {
  if (!BROWSER_ARTIFACT_DIR) return;

  await mkdir(BROWSER_ARTIFACT_DIR, { recursive: true });
  const screenshot = await cdp.call('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true,
  });
  const data = screenshot.result?.data;
  expect(typeof data === 'string' && data.length > 0, `CDP screenshot capture failed for ${name}.`);
  const filePath = join(BROWSER_ARTIFACT_DIR, `${name}.png`);
  await writeFile(filePath, Buffer.from(data, 'base64'));
  console.log(`ARTIFACT browser screenshot: ${filePath}`);
}

async function deleteSessionBestEffort(sessionId: string) {
  try {
    await api('DELETE', `/api/sessions/${sessionId}`);
  } catch {
    // Best-effort cleanup for test-created sessions.
  }
}

async function run() {
  const session = await api('POST', '/api/sessions', {
    name: 'UI Knowledge Bank Panel Smoke',
    source: 'manual',
    manifesto: 'Knowledge Bank UI smoke',
    architecture: 'Right panel Knowledge tab must stay contained in a tight viewport.',
    projectContext: 'knowledge bank viewport smoke',
    graph: { nodes: [], links: [] },
  }) as { id?: string };
  expect(typeof session.id === 'string' && session.id.length > 0, `Session create response did not include an id: ${JSON.stringify(session).slice(0, 500)}`);

  try {
    await withBrowser('about:blank', async (cdp) => {
      await cdp.call('Page.addScriptToEvaluateOnNewDocument', {
        source: `localStorage.setItem("retrobuilder-state", ${JSON.stringify(JSON.stringify({
          state: {
            appMode: 'm1nd',
            activeProvider: 'xai',
            activeModel: null,
            activeSessionId: session.id,
            showSessionLauncher: false,
            showEnvConfigModal: false,
            isRightPanelOpen: true,
          },
          version: 0,
        }))});`,
      });
      await cdp.call('Page.navigate', { url: BASE });

      await waitForBody(cdp, (text) => text.includes('M1ND COCKPIT') && text.includes('KNOWLEDGE'), 'M1ND cockpit did not expose the Knowledge tab.');
      const clicked = await cdp.evaluate<string>(`(() => {
        const button = [...document.querySelectorAll('button')].find((entry) => entry.innerText.trim() === 'KNOWLEDGE');
        if (!button) return 'missing';
        button.click();
        return 'clicked';
      })()`);
      expect(clicked === 'clicked', `Could not click Knowledge tab: ${clicked}`);

      await waitForBody(cdp, (text) => text.includes('KNOWLEDGE BANK') && text.includes('INGEST SOURCE'), 'Knowledge panel body did not render.');
      const state = await cdp.evaluate<{
        hasKnowledgeTab: boolean;
        hasPanelCopy: boolean;
        hasIngestButton: boolean;
        hasReviewedToggle: boolean;
        overflow: Array<{ tag: string; text: string; left: number; right: number; width: number }>;
      }>(`(() => {
        const body = document.body.innerText;
        const overflow = [...document.querySelectorAll('body *')]
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.width > 8 && r.height > 8 && (r.right > window.innerWidth + 2 || r.left < -2))
          .slice(0, 8)
          .map(({ el, r }) => ({
            tag: el.tagName.toLowerCase(),
            text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 80),
            left: Math.round(r.left),
            right: Math.round(r.right),
            width: Math.round(r.width),
          }));
        return {
          hasKnowledgeTab: body.includes('KNOWLEDGE'),
          hasPanelCopy: body.includes('KNOWLEDGE BANK'),
          hasIngestButton: body.includes('INGEST SOURCE'),
          hasReviewedToggle: body.includes('REVIEWED'),
          overflow,
        };
      })()`);

      expect(state.hasKnowledgeTab, `Knowledge tab missing: ${JSON.stringify(state)}`);
      expect(state.hasPanelCopy, `Knowledge panel copy missing: ${JSON.stringify(state)}`);
      expect(state.hasIngestButton, `Knowledge ingest action missing: ${JSON.stringify(state)}`);
      expect(state.hasReviewedToggle, `Knowledge reviewed toggle missing: ${JSON.stringify(state)}`);
      expect(state.overflow.length === 0, `Knowledge panel overflowed the ${VIEWPORT.width}px viewport: ${JSON.stringify(state.overflow)}`);

      await captureBrowserArtifact(cdp, 'knowledge-bank-panel-small-viewport');
    });
  } finally {
    await deleteSessionBestEffort(session.id);
  }

  console.log(`PASS Chromium CDP Knowledge Bank: tab renders and stays contained at ${VIEWPORT.width}x${VIEWPORT.height}`);
}

run().catch((error) => {
  console.error('FAIL Chromium CDP Knowledge Bank');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
