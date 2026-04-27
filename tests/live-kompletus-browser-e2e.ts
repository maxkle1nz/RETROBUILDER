#!/usr/bin/env tsx
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = (process.env.RETROBUILDER_TEST_BASE || 'http://127.0.0.1:7777').replace(/\/+$/, '');
const SHOULD_RUN = process.env.RETROBUILDER_RUN_LIVE_E2E === '1';
const BROWSER_ARTIFACT_DIR = process.env.RETROBUILDER_BROWSER_ARTIFACT_DIR?.trim();
const PROMPT = process.argv.slice(2).join(' ').trim() || process.env.RETROBUILDER_LIVE_E2E_PROMPT || [
  'Create a focused product-grade concept mechanic shop system with at most 7 modules:',
  'a public service booking landing page, appointment scheduling, CRM follow-up board,',
  'vehicle notes, and a small staff operations workspace.',
  'Avoid broad enterprise extras such as backup, observability, audit, compliance, or auth unless absolutely required.',
  'The user-facing surfaces must feel like polished 21st-inspired product UI, not generic dashboards.',
].join(' ');

type Graph = { nodes: Array<Record<string, unknown>>; links: Array<Record<string, unknown>> };

type SpecularArtifact = {
  nodeId: string;
  designProfile: '21st';
  referenceCandidates: unknown[];
  selectedReferenceIds: string[];
  variantCandidates: unknown[];
  selectedVariantId: string;
  previewArtifact: unknown;
  previewState: unknown;
  designVerdict: { status: 'pending' | 'passed' | 'failed'; score: number; findings: string[]; evidence: string[] };
};

type KompletusResult = {
  graph: Graph;
  manifesto: string;
  architecture: string;
  specularCreate: {
    designProfile: '21st';
    artifacts: SpecularArtifact[];
    gate: {
      designGateStatus: string;
      designScore: number;
      designFindings?: string[];
      designEvidence?: string[];
      affectedNodeIds: string[];
      failingNodeIds?: string[];
    };
  };
  qualityGate: { passed: boolean; remainingIssues: string[] };
};

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

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function parseBasePort() {
  const url = new URL(BASE);
  return Number(url.port || (url.protocol === 'https:' ? 443 : 80));
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
  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}): ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function healthCheck() {
  try {
    const response = await fetch(`${BASE}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await healthCheck()) {
    console.log(`==> using existing Retrobuilder server at ${BASE}`);
    return null;
  }

  const port = String(parseBasePort());
  console.log(`==> starting Retrobuilder server for live browser E2E at ${BASE}`);
  const proc = spawn('npx', ['tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, RETROBUILDER_PORT: port, PORT: port, DISABLE_HMR: 'true' },
    stdio: 'ignore',
  });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await healthCheck()) return proc;
    await delay(500);
  }

  proc.kill('SIGTERM');
  throw new Error(`Retrobuilder server did not become healthy at ${BASE}`);
}

async function stopProcess(proc: ChildProcess | null) {
  if (!proc || proc.exitCode !== null || proc.signalCode) return;
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
}

async function runKompletusLive(prompt: string): Promise<KompletusResult> {
  const response = await fetch(`${BASE}/api/ai/kompletus`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      model: process.env.RETROBUILDER_LIVE_E2E_MODEL || undefined,
    }),
  });
  if (!response.ok) {
    throw new Error(`KOMPLETUS live request failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  }

  const reader = response.body?.getReader();
  expect(reader, 'KOMPLETUS live response did not expose a readable body.');

  const decoder = new TextDecoder();
  let buffer = '';
  let eventType = '';
  let result: KompletusResult | null = null;
  let lastError = '';

  function processLines(text: string) {
    buffer += text;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.substring(7).trim();
      } else if (line.startsWith('data: ') && eventType) {
        const data = JSON.parse(line.substring(6));
        if (eventType === 'progress') {
          console.log(`  [${data.stage}] ${data.status}: ${data.message || ''}`);
        } else if (eventType === 'result') {
          result = data;
        } else if (eventType === 'error') {
          lastError = data.error || 'KOMPLETUS pipeline error';
        }
        eventType = '';
      } else if (line === '') {
        eventType = '';
      }
    }
  }

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    processLines(decoder.decode(chunk.value, { stream: true }));
  }
  if (buffer.trim()) {
    const remaining = buffer;
    buffer = '';
    processLines(`${remaining}\n`);
  }

  if (!result && lastError) throw new Error(lastError);
  expect(result, 'KOMPLETUS stream ended without a result event.');
  return result;
}

async function getPageWsUrl(port: number) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) {
    throw new Error(`CDP target list failed: ${response.status}`);
  }
  const targets = await response.json() as Array<{ type?: string; webSocketDebuggerUrl?: string }>;
  const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  expect(page?.webSocketDebuggerUrl, 'No page targets exposed by Chromium CDP.');
  return page.webSocketDebuggerUrl;
}

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

async function withBrowser<T>(targetUrl: string, run: (cdp: CdpClient) => Promise<T>) {
  const userDataDir = await mkdtemp(join(tmpdir(), 'retrobuilder-live-kompletus-cdp-'));
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
      `--user-data-dir=${userDataDir}`,
      targetUrl,
    ], { stdio: 'ignore' });

    const wsUrl = await waitForCdpTarget(port);
    cdp = await CdpClient.connect(wsUrl);
    await cdp.call('Page.enable');
    await cdp.call('Runtime.enable');
    await cdp.call('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir,
    });
    return await run(cdp);
  } finally {
    cdp?.close();
    await stopProcess(proc);
    await rm(userDataDir, { recursive: true, force: true });
  }
}

async function bodyText(cdp: CdpClient) {
  return await cdp.evaluate<string>('document.body ? document.body.innerText : ""');
}

async function waitForBody(cdp: CdpClient, predicate: (body: string) => boolean, message: string, attempts = 80) {
  let body = '';
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    body = await bodyText(cdp);
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
    captureBeyondViewport: true,
    fromSurface: true,
  });
  const data = screenshot.result?.data;
  expect(typeof data === 'string' && data.length > 0, `CDP screenshot capture failed for ${name}.`);
  const filePath = join(BROWSER_ARTIFACT_DIR, `${name}.png`);
  await writeFile(filePath, Buffer.from(data, 'base64'));
  console.log(`ARTIFACT browser screenshot: ${filePath}`);
}

async function navigateWithRetrobuilderState(cdp: CdpClient, state: Record<string, unknown>) {
  await cdp.call('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem("retrobuilder-state", ${JSON.stringify(JSON.stringify({ state, version: 0 }))});`,
  });
  await cdp.call('Page.navigate', { url: BASE });
}

async function clickButtonContaining(cdp: CdpClient, text: string) {
  return await cdp.evaluate<string>(`(() => {
    const needle = ${JSON.stringify(text.toLowerCase())};
    const button = [...document.querySelectorAll('button')].find((entry) => ((entry.textContent || '').toLowerCase()).includes(needle));
    if (!button) return 'missing';
    button.click();
    return 'clicked';
  })()`);
}

function applyLiveSpecularArtifacts(graph: Graph, artifacts: SpecularArtifact[]): Graph {
  const artifactByNodeId = new Map(artifacts.map((artifact) => [artifact.nodeId, artifact]));
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const artifact = artifactByNodeId.get(String(node.id || ''));
      if (!artifact) return node;
      return {
        ...node,
        designProfile: artifact.designProfile,
        referenceCandidates: artifact.referenceCandidates,
        selectedReferenceIds: artifact.selectedReferenceIds,
        variantCandidates: artifact.variantCandidates,
        selectedVariantId: artifact.selectedVariantId,
        previewArtifact: artifact.previewArtifact,
        previewState: artifact.previewState,
        designVerdict: artifact.designVerdict,
      };
    }),
  };
}

async function main() {
  if (!SHOULD_RUN) {
    console.log('SKIP live KOMPLETUS browser E2E: set RETROBUILDER_RUN_LIVE_E2E=1 to run the external-provider path.');
    return;
  }

  let serverProc: ChildProcess | null = null;
  let sessionId = '';
  let runtimeDir = '';

  try {
    serverProc = await ensureServer();

    console.log(`==> running live KOMPLETUS browser E2E against ${BASE}`);
    const result = await runKompletusLive(PROMPT);
    expect(result.graph?.nodes?.length > 0, 'Live KOMPLETUS returned no graph nodes.');
    expect(result.specularCreate?.artifacts?.length > 0, 'Live KOMPLETUS returned no SPECULAR CREATE artifacts.');
    expect(result.specularCreate.designProfile === '21st', `Live KOMPLETUS used unexpected design profile: ${result.specularCreate.designProfile}`);
    console.log(`==> live graph: ${result.graph.nodes.length} nodes, ${result.graph.links.length} links`);
    console.log(`==> live design gate: ${result.specularCreate.gate.designGateStatus} (${result.specularCreate.gate.designScore}%) across ${result.specularCreate.gate.affectedNodeIds.length} surfaces`);
    if (result.specularCreate.gate.failingNodeIds?.length) {
      console.log(`==> live design gate failing nodes: ${result.specularCreate.gate.failingNodeIds.join(', ')}`);
    }
    for (const finding of result.specularCreate.gate.designFindings?.slice(0, 12) || []) {
      console.log(`  gate finding: ${finding}`);
    }

    const graph = applyLiveSpecularArtifacts(result.graph, result.specularCreate.artifacts);
    const session = await http('POST', '/api/sessions', {
      name: 'Live KOMPLETUS Browser E2E',
      source: 'manual',
      manifesto: result.manifesto,
      architecture: result.architecture,
      projectContext: PROMPT,
      graph,
    }) as { id: string };
    sessionId = session.id;
    runtimeDir = join(process.cwd(), '.retrobuilder', 'runtime', sessionId);

    await withBrowser(`${BASE}/specular/showcase/${sessionId}`, async (cdp) => {
      await waitForBody(cdp, (text) => text.includes('Live KOMPLETUS Browser E2E'), 'Live SPECULAR showcase did not render the persisted KOMPLETUS session.');
      const truth = await cdp.evaluate<{ surfaceCount?: number; surfaces?: Array<{ designProfile?: string; gate?: string }> }>(`(() => {
        const node = document.querySelector('#rb-specular-truth');
        return node ? JSON.parse(node.textContent || '{}') : null;
      })()`);
      expect((truth.surfaceCount || 0) > 0, `Expected live SPECULAR showcase surfaces, got ${JSON.stringify(truth).slice(0, 500)}`);
      expect(
        truth.surfaces?.every((surface) => surface.designProfile === '21st'),
        `Expected live SPECULAR surfaces to stay anchored to 21st, got ${JSON.stringify(truth).slice(0, 500)}`,
      );
      await captureBrowserArtifact(cdp, 'live-kompletus-specular-showcase');
    });

    expect(
      result.specularCreate.gate.designGateStatus === 'passed',
      `Live SPECULAR design gate blocked OMX handoff: ${JSON.stringify({
        score: result.specularCreate.gate.designScore,
        failingNodeIds: result.specularCreate.gate.failingNodeIds || [],
        findings: (result.specularCreate.gate.designFindings || []).slice(0, 12),
      }).slice(0, 1200)}`,
    );

    await withBrowser('about:blank', async (cdp) => {
      await navigateWithRetrobuilderState(cdp, {
        appMode: 'architect',
        activeProvider: 'bridge',
        activeModel: null,
        activeSessionId: sessionId,
        showSessionLauncher: false,
        showEnvConfigModal: false,
      });

      await waitForBody(cdp, (text) => text.includes('Live KOMPLETUS Browser E2E'), 'Live KOMPLETUS session did not hydrate in workbench.');
      expect(await clickButtonContaining(cdp, 'm1nd') === 'clicked', 'Could not click m1nd mode button for live KOMPLETUS session.');
      await delay(1000);
      expect(await clickButtonContaining(cdp, 'build with omx') === 'clicked', 'Could not trigger Build with OMX for live KOMPLETUS session.');
      await waitForBody(cdp, (text) => (
        text.includes('BU1LDER // LIVE') ||
        text.includes('UIX Gate Blocked') ||
        text.includes('21st-powered live UIX preview') ||
        text.includes('Generate UIX')
      ), 'Live KOMPLETUS handoff did not reach BU1LDER or UIX gate feedback.', 240);
      const postHandoffBody = await bodyText(cdp);
      if (!postHandoffBody.includes('BU1LDER // LIVE')) {
        await captureBrowserArtifact(cdp, 'live-kompletus-uix-gate-blocked');
        throw new Error(`Live KOMPLETUS handoff was blocked by UIX feedback instead of entering BU1LDER: ${postHandoffBody.slice(0, 1200)}`);
      }
      await captureBrowserArtifact(cdp, 'live-kompletus-builder-handoff');
    });

    console.log('PASS live KOMPLETUS browser E2E: live pipeline, SPECULAR showcase, and OMX handoff verified');
  } finally {
    if (sessionId) {
      await http('DELETE', `/api/sessions/${sessionId}`).catch(() => null);
    }
    if (runtimeDir) {
      await rm(runtimeDir, { recursive: true, force: true });
    }
    await stopProcess(serverProc);
  }
}

main().catch((error) => {
  console.error('FAIL live KOMPLETUS browser E2E');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
