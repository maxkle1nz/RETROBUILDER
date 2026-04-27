#!/usr/bin/env tsx
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = (process.env.RETROBUILDER_TEST_BASE || 'http://127.0.0.1:7777').replace(/\/+$/, '');

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

async function http(method: string, path: string, payload?: unknown) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} failed (${response.status}): ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
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
  const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()));
  proc.kill('SIGTERM');
  await Promise.race([
    exited,
    delay(3000).then(() => {
      if (proc.exitCode === null && !proc.signalCode) proc.kill('SIGKILL');
    }),
  ]);
  await Promise.race([exited, delay(1000)]);
}

async function withBrowser<T>(run: (cdp: CdpClient) => Promise<T>) {
  const userDataDir = await mkdtemp(join(tmpdir(), 'retrobuilder-buttons-cdp-'));
  const downloadDir = join(userDataDir, 'downloads');
  const port = await freePort();
  let proc: ChildProcess | null = null;
  let cdp: CdpClient | null = null;

  try {
    await mkdir(downloadDir, { recursive: true });
    proc = spawn(chromiumBinary(), [
      `--remote-debugging-port=${port}`,
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1440,900',
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ], { stdio: 'ignore' });

    const wsUrl = await waitForCdpTarget(port);
    cdp = await CdpClient.connect(wsUrl);
    await cdp.call('Page.enable');
    await cdp.call('Runtime.enable');
    await cdp.call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
    await cdp.call('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        window.__retrobuilderButtonSmokeErrors = [];
        window.addEventListener('error', (event) => {
          window.__retrobuilderButtonSmokeErrors.push(String(event.message || event.error || 'window error'));
        });
        window.addEventListener('unhandledrejection', (event) => {
          window.__retrobuilderButtonSmokeErrors.push(String(event.reason || 'unhandled rejection'));
        });
        const __rbConsoleError = console.error.bind(console);
        console.error = (...args) => {
          window.__retrobuilderButtonSmokeErrors.push(args.map((arg) => {
            if (arg instanceof Error) return arg.stack || arg.message;
            if (typeof arg === 'object') {
              try { return JSON.stringify(arg); } catch { return String(arg); }
            }
            return String(arg);
          }).join(' '));
          __rbConsoleError(...args);
        };
      `,
    });
    await cdp.call('Page.navigate', { url: BASE });
    return await run(cdp);
  } finally {
    cdp?.close();
    if (proc) await stopChromium(proc);
    await rm(userDataDir, { recursive: true, force: true });
  }
}

async function bodyText(cdp: CdpClient) {
  return await cdp.evaluate<string>('document.body ? document.body.innerText : ""');
}

async function waitForBody(cdp: CdpClient, predicate: (body: string) => boolean, message: string, attempts = 40) {
  let body = '';
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    body = await bodyText(cdp);
    if (predicate(body)) return body;
    await delay(250);
  }
  throw new Error(`${message}\n${body.slice(0, 2500)}`);
}

async function clickButtonByText(cdp: CdpClient, text: string) {
  const result = await cdp.evaluate<string>(`(() => {
    const needle = ${JSON.stringify(text.toLowerCase())};
    const button = [...document.querySelectorAll('button')].find((entry) => ((entry.textContent || '').toLowerCase()).includes(needle));
    if (!button) return 'missing';
    if (button.disabled) return 'disabled';
    button.click();
    return 'clicked';
  })()`);
  expect(result === 'clicked', `Expected button containing "${text}" to be clickable, got ${result}.`);
}

async function clickButtonByTitle(cdp: CdpClient, title: string) {
  const result = await cdp.evaluate<string>(`(() => {
    const title = ${JSON.stringify(title)};
    const button = [...document.querySelectorAll('button')].find((entry) => entry.title === title || entry.getAttribute('aria-label') === title);
    if (!button) return 'missing';
    if (button.disabled) return 'disabled';
    button.click();
    return 'clicked';
  })()`);
  expect(result === 'clicked', `Expected button titled "${title}" to be clickable, got ${result}.`);
}

async function clickStatusDisclosure(cdp: CdpClient) {
  const result = await cdp.evaluate<string>(`(() => {
    const summary = [...document.querySelectorAll('summary')].find((entry) => (entry.textContent || '').toLowerCase().includes('status'));
    if (!summary) return 'missing';
    summary.click();
    return 'clicked';
  })()`);
  expect(result === 'clicked', `Expected STATUS disclosure to be clickable, got ${result}.`);
}

function withGraphStore(script: string) {
  return `(async () => {
    const resource = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((name) => name.includes('/src/store/useGraphStore.ts'));
    const moduleUrl = resource || '/src/store/useGraphStore.ts';
    const { useGraphStore } = await import(moduleUrl);
    ${script}
  })()`;
}

async function expectNoConsoleErrors(cdp: CdpClient, context: string) {
  await delay(200);
  const errors = await cdp.evaluate<string[]>('window.__retrobuilderButtonSmokeErrors || []');
  const filtered = errors.filter((entry) => !entry.includes('ResizeObserver loop completed'));
  expect(filtered.length === 0, `${context} produced console/runtime errors:\n${filtered.join('\n')}`);
}

function graph(label: string) {
  return {
    nodes: [
      {
        id: 'intake',
        label,
        description: 'Top-level button smoke frontend module.',
        type: 'frontend',
        status: 'pending',
        group: 1,
        priority: 1,
        data_contract: 'Input: { user: string } Output: { action: string }',
        acceptance_criteria: ['The toolbar remains usable.', 'Undo and redo mutate graph state.'],
        error_handling: ['Show a safe fallback when unavailable.'],
      },
      {
        id: 'api',
        label: 'Smoke API',
        description: 'Top-level button smoke API module.',
        type: 'backend',
        status: 'pending',
        group: 1,
        priority: 2,
        data_contract: 'Input: { requestId: string } Output: { ok: boolean }',
        acceptance_criteria: ['API supports the frontend surface.'],
        error_handling: ['Return structured errors.'],
      },
    ],
    links: [{ source: 'intake', target: 'api', label: 'calls' }],
  };
}

async function installSessionState(cdp: CdpClient, session: { id: string; name: string }) {
  await cdp.evaluate(withGraphStore(`
    const temporal = useGraphStore.temporal.getState();
    temporal.pause();
    useGraphStore.setState({
      activeSessionId: ${JSON.stringify(session.id)},
      activeSessionName: ${JSON.stringify(session.name)},
      activeSessionSource: 'manual',
      showSessionLauncher: false,
      showEnvConfigModal: false,
      appMode: 'architect',
      graphData: ${JSON.stringify(graph('Initial Button Node'))},
      manifesto: 'Button smoke manifesto',
      architecture: 'Button smoke architecture',
      projectContext: 'Button smoke project context',
      sessionSaveState: 'saved',
    });
    temporal.resume();
    temporal.clear();
    return true;
  `));
}

async function readGraphLabel(cdp: CdpClient) {
  return await cdp.evaluate<string>(withGraphStore(`
    return useGraphStore.getState().graphData.nodes[0]?.label || '';
  `));
}

async function setMobileViewport(cdp: CdpClient) {
  await cdp.call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await cdp.evaluate('window.dispatchEvent(new Event("resize")); true');
  await delay(300);
}

async function setCompactDesktopViewport(cdp: CdpClient) {
  await cdp.call('Emulation.setDeviceMetricsOverride', {
    width: 856,
    height: 842,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.evaluate('window.dispatchEvent(new Event("resize")); true');
  await delay(300);
}

async function expectMobileShellControls(cdp: CdpClient) {
  const result = await cdp.evaluate<string>(`(() => {
    const viewportWidth = window.innerWidth;
    const header = document.querySelector('header');
    if (!header) return 'missing header';
    const headerRect = header.getBoundingClientRect();
    if (headerRect.height > 140) return 'header too tall: ' + Math.round(headerRect.height);

    const labels = [
      'Open session launcher',
      'Open project keys and provider config',
      'Switch to Architect mode',
      'Switch to M1ND mode',
      'Switch to BU1LDER mode',
      'Toggle OMX Terminal',
      'Save active session',
    ];
    for (const label of labels) {
      const control = [...header.querySelectorAll('button')].find((button) => (button.getAttribute('aria-label') || '').startsWith(label));
      if (!control) return 'missing control: ' + label;
      const rect = control.getBoundingClientRect();
      if (rect.left < -1 || rect.right > viewportWidth + 1) return 'control outside viewport: ' + label;
    }

    const edgeHandles = [...document.querySelectorAll('button')].filter((button) => {
      const label = button.getAttribute('aria-label') || '';
      return label === 'Show Checklist' || label === 'Hide Checklist' || label === 'Show Sidebar' || label === 'Hide Sidebar';
    });
    if (edgeHandles.length < 2) return 'missing side handles';
    for (const handle of edgeHandles) {
      const rect = handle.getBoundingClientRect();
      if (rect.top < headerRect.bottom + 40) return 'side handle overlaps header';
    }

    return 'ok';
  })()`);
  expect(result === 'ok', `Mobile shell controls failed hardening check: ${result}.`);
}

async function expectCompactShellAndChatDock(cdp: CdpClient) {
  const result = await cdp.evaluate<string>(`(() => {
    const viewportWidth = window.innerWidth;
    const header = document.querySelector('header');
    const footer = document.querySelector('footer');
    const textarea = footer?.querySelector('textarea');
    const modelButton = footer ? [...footer.querySelectorAll('button')].find((button) => button.title === 'AI Model Settings') : null;
    if (!header || !footer || !textarea || !modelButton) return 'missing shell/chat elements';

    const headerRect = header.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const textareaRect = textarea.getBoundingClientRect();
    const modelRect = modelButton.getBoundingClientRect();

    if (headerRect.height > 118) return 'compact header too tall: ' + Math.round(headerRect.height);
    if (footerRect.height > 150) return 'compact footer too tall: ' + Math.round(footerRect.height);
    if (modelRect.top < footerRect.top || modelRect.bottom > textareaRect.top) return 'model selector is not docked in the chat command bar';
    if (modelRect.left < -1 || modelRect.right > viewportWidth + 1) return 'model selector outside viewport';
    if (textareaRect.top < modelRect.bottom - 1) return 'textarea overlaps command bar';

    for (const button of header.querySelectorAll('button')) {
      const rect = button.getBoundingClientRect();
      if (rect.left < -1 || rect.right > viewportWidth + 1) return 'header control outside viewport';
    }

    const footerText = footer.textContent?.toLowerCase() || '';
    if (!footerText.includes('mode')) return 'missing docked mode label';
    return 'ok';
  })()`);
  expect(result === 'ok', `Compact shell/chat dock failed responsive check: ${result}.`);
}

async function expectAccessibleDialog(cdp: CdpClient, expectedTitleId: string) {
  await delay(250);
  const result = await cdp.evaluate<string>(`(() => {
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!dialog) return 'missing dialog';
    if (dialog.getAttribute('aria-labelledby') !== ${JSON.stringify(expectedTitleId)}) return 'wrong labelledby';
    if (!document.getElementById(${JSON.stringify(expectedTitleId)})) return 'missing title target';
    const describedBy = dialog.getAttribute('aria-describedby');
    if (!describedBy || !document.getElementById(describedBy)) return 'missing description target';
    if (!dialog.contains(document.activeElement)) return 'focus outside dialog';
    const rect = dialog.getBoundingClientRect();
    if (rect.height > window.innerHeight + 1) return 'dialog clipped vertically';
    return 'ok';
  })()`);
  expect(result === 'ok', `Accessible dialog check failed: ${result}.`);
}

async function run() {
  const session = await http('POST', '/api/sessions', {
    name: `UI Buttons Smoke ${Date.now()}`,
    source: 'manual',
    manifesto: 'Button smoke manifesto',
    architecture: 'Button smoke architecture',
    projectContext: 'Button smoke project context',
    graph: graph('Initial Button Node'),
  }) as { id: string; name: string };

  try {
    await withBrowser(async (cdp) => {
      await waitForBody(cdp, (text) => text.includes('RETROBUILDER') || text.includes('Choose a session'), 'App shell did not render.');
      await installSessionState(cdp, session);
      await waitForBody(cdp, (text) => text.includes('Initial Button Node') && text.includes('ARCHITECT'), 'Smoke session did not render in Architect mode.');

      await clickButtonByText(cdp, 'M1ND');
      await waitForBody(cdp, (text) => text.toLowerCase().includes('m1nd mode'), 'M1ND mode button did not switch mode.');

      await clickButtonByText(cdp, 'BU1LDER');
      await waitForBody(cdp, (text) => text.includes('Build Mode') || text.toLowerCase().includes('bu1lder mode'), 'BU1LDER mode button did not switch mode.');

      await clickButtonByText(cdp, 'ARCHITECT');
      await waitForBody(cdp, (text) => {
        const body = text.toLowerCase();
        return body.includes('kreator mode') || body.includes('konstruktor mode');
      }, 'ARCHITECT mode button did not switch back.');

      await clickButtonByTitle(cdp, 'Show Checklist');
      await waitForBody(cdp, (text) => text.includes('PROJECT SKELETON') || text.includes('Project Skeleton'), 'Checklist panel did not open.');
      await clickButtonByTitle(cdp, 'Hide Checklist');

      await clickButtonByTitle(cdp, 'Show Sidebar');
      await waitForBody(cdp, (text) => {
        const body = text.toLowerCase();
        return body.includes('builder') && body.includes('manifesto') && body.includes('architecture');
      }, 'Sidebar panel did not open.');
      await clickButtonByTitle(cdp, 'Hide Sidebar');

      await clickButtonByTitle(cdp, 'Toggle OMX Terminal (⌘T)');
      await waitForBody(cdp, (text) => {
        const body = text.toLowerCase();
        return body.includes('omx terminal') || body.includes('build console');
      }, 'Terminal drawer did not open.');
      await clickButtonByTitle(cdp, 'Minimize');

      await clickStatusDisclosure(cdp);
      await waitForBody(cdp, (text) => {
        const body = text.toLowerCase();
        return body.includes('version') && body.includes('uptime');
      }, 'STATUS disclosure did not reveal details.');

      await clickButtonByText(cdp, 'SESSION');
      await waitForBody(cdp, (text) => {
        const body = text.toLowerCase();
        return body.includes('novo blueprint') || body.includes('abrir sessão') || body.includes('open session');
      }, 'Session launcher did not open.');
      await cdp.evaluate(withGraphStore(`
        useGraphStore.getState().closeSessionLauncher();
        return true;
      `));

      await clickButtonByText(cdp, 'KEYS');
      await waitForBody(cdp, (text) => text.toLowerCase().includes('project keys & provider config'), 'Keys modal did not open.');
      await cdp.evaluate(withGraphStore(`
        useGraphStore.getState().closeEnvConfigModal();
        return true;
      `));

      await clickButtonByTitle(cdp, 'AI Model Settings');
      await waitForBody(cdp, (text) => {
        const body = text.toLowerCase();
        return body.includes('ai configuration') || body.includes('loading providers');
      }, 'Model selector did not open.');
      await clickButtonByTitle(cdp, 'AI Model Settings');

      await clickButtonByTitle(cdp, 'Center graph');
      await clickButtonByTitle(cdp, 'Auto-organize graph');

      await cdp.evaluate(withGraphStore(`
        useGraphStore.getState().setGraphData(${JSON.stringify(graph('Updated Button Node'))});
        return true;
      `));
      await waitForBody(cdp, (text) => text.includes('Updated Button Node'), 'Graph edit did not render updated node.');

      await clickButtonByTitle(cdp, 'Undo');
      expect(await readGraphLabel(cdp) === 'Initial Button Node', 'Undo button did not restore the initial graph label.');
      await waitForBody(cdp, (text) => text.includes('Initial Button Node'), 'Undo result did not render.');

      await clickButtonByTitle(cdp, 'Redo');
      expect(await readGraphLabel(cdp) === 'Updated Button Node', 'Redo button did not restore the updated graph label.');
      await waitForBody(cdp, (text) => text.includes('Updated Button Node'), 'Redo result did not render.');

      await clickButtonByTitle(cdp, 'Export graph as JSON');
      await clickButtonByTitle(cdp, 'Import graph from JSON');

      await clickButtonByText(cdp, 'SAVED');
      await waitForBody(cdp, (text) => text.includes('SAVING') || text.includes('SAVED'), 'Manual save button did not react.');

      await setCompactDesktopViewport(cdp);
      await expectCompactShellAndChatDock(cdp);

      await setMobileViewport(cdp);
      await expectMobileShellControls(cdp);

      await clickButtonByText(cdp, 'SESSION');
      await expectAccessibleDialog(cdp, 'session-launcher-title');
      await cdp.evaluate(withGraphStore(`
        useGraphStore.getState().closeSessionLauncher();
        return true;
      `));

      await clickButtonByText(cdp, 'KEYS');
      await expectAccessibleDialog(cdp, 'env-config-dialog-title');
      await cdp.evaluate(withGraphStore(`
        useGraphStore.getState().closeEnvConfigModal();
        return true;
      `));

      await expectNoConsoleErrors(cdp, 'Top-level button smoke');
    });
  } finally {
    await http('DELETE', `/api/sessions/${session.id}`).catch(() => null);
  }

  console.log('PASS Chromium CDP: top-level buttons, side handles, toolbar controls, and undo/redo are clickable');
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
