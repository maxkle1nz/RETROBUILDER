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
  const userDataDir = await mkdtemp(join(tmpdir(), 'retrobuilder-workbench-cdp-'));
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
    await delay(500);
  }
  throw new Error(`${message}\n${body.slice(0, 2500)}`);
}

function hasBuilderModeText(text: string) {
  const body = text.toLowerCase();
  return body.includes('build mode') || body.includes('bu1lder mode');
}

type SpecularTruthManifest = {
  surfaceCount?: number;
  surfaces?: Array<{ nodeId?: string; designProfile?: string; gate?: string }>;
};

async function waitForSpecularTruth(cdp: CdpClient, expectedSurfaceCount: number) {
  let truth: SpecularTruthManifest | null = null;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    truth = await cdp.evaluate<SpecularTruthManifest | null>(`(() => {
      const node = document.querySelector('#rb-specular-truth');
      if (!node?.textContent) return null;
      try {
        return JSON.parse(node.textContent);
      } catch {
        return null;
      }
    })()`);

    if (truth?.surfaceCount === expectedSurfaceCount) return truth;
    await delay(250);
  }

  throw new Error(`SPECULAR truth manifest did not settle. Last value: ${JSON.stringify(truth).slice(0, 500)}`);
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

async function createSession(payload: Record<string, unknown>) {
  const session = await http('POST', '/api/sessions', payload) as { id?: string; graph?: { nodes: Array<Record<string, unknown>>; links: unknown[] } };
  expect(typeof session.id === 'string' && session.id.length > 0, `Session create response did not include an id: ${JSON.stringify(session).slice(0, 500)}`);
  expect(session.graph && Array.isArray(session.graph.nodes), `Session create response did not include graph nodes: ${JSON.stringify(session).slice(0, 500)}`);
  return session as { id: string; graph: { nodes: Array<Record<string, unknown>>; links: unknown[] } };
}

async function deleteSessionBestEffort(sessionId: string) {
  try {
    await http('DELETE', `/api/sessions/${sessionId}`);
  } catch {
    // Best-effort cleanup for test-created sessions.
  }
}

async function smokeShellAndBuilderMode() {
  await withBrowser(BASE, async (cdp) => {
    const body = await waitForBody(
      cdp,
      (text) => text.includes('RETROBUILDER') || text.includes('Choose a session'),
      'App shell did not render expected text.',
    );
    expect(body.includes('RETROBUILDER') || body.includes('Choose a session'), 'App shell body predicate mismatch.');

    const clicked = await clickButtonContaining(cdp, 'BU1LDER');
    expect(clicked === 'clicked', 'Could not click BU1LDER mode button.');

    await waitForBody(cdp, hasBuilderModeText, 'Builder mode did not render expected header.');
  });
  console.log('PASS Chromium CDP workbench: shell rendered and BU1LDER mode activated');
}

async function smokeBlockedBuildRoutesToUixCorrection() {
  const session = await createSession({
    name: 'UI Blocked Gate Session',
    source: 'manual',
    manifesto: 'UI flow test',
    architecture: 'Frontend must pass design gate',
    projectContext: 'ui smoke',
    graph: {
      nodes: [{
        id: 'broken-frontend',
        label: 'Broken Frontend',
        description: 'A user-facing surface with missing contract but otherwise ready.',
        status: 'pending',
        type: 'frontend',
        group: 1,
        priority: 1,
        data_contract: '',
        acceptance_criteria: [
          'The surface shows a primary action.',
          'The surface explains the current state.',
        ],
        error_handling: ['Show fallback copy on failure.'],
      }],
      links: [],
    },
  });

  try {
    await withBrowser('about:blank', async (cdp) => {
      await navigateWithRetrobuilderState(cdp, {
        appMode: 'architect',
        activeProvider: 'xai',
        activeModel: null,
        activeSessionId: session.id,
        showSessionLauncher: false,
        showEnvConfigModal: false,
      });

      await waitForBody(cdp, (text) => text.includes('Broken Frontend') && text.toLowerCase().includes('kreator mode'), 'Blocked session did not hydrate in UI.');
      expect(await clickButtonContaining(cdp, 'm1nd') === 'clicked', 'Could not click m1nd mode button.');
      await delay(1000);
      expect(await clickButtonContaining(cdp, 'build with omx') === 'clicked', 'Could not trigger Build with OMX from UI.');

      await waitForBody(
        cdp,
        (text) => (
          text.includes('21st-powered live UIX preview') ||
          text.includes('Generate UIX') ||
          text.includes('UIX Gate Blocked') ||
          text.includes('UIX SURFACE')
        ),
        'Blocked build did not route back into the UIX correction surface.',
      );
    });
  } finally {
    await deleteSessionBestEffort(session.id);
  }

  console.log('PASS Chromium CDP workbench: design-gate block routed into UIX correction');
}

async function smokeHappyBuildEntersBuilderMode() {
  const session = await createSession({
    name: 'UI Happy Build Session',
    source: 'manual',
    manifesto: 'Happy-path UI build smoke test',
    architecture: 'Frontend passes design gate and enters builder mode.',
    projectContext: 'ui happy smoke',
    graph: {
      nodes: [{
        id: 'ops-dashboard',
        label: 'Ops Dashboard',
        description: 'A control surface for operators to inspect status and intervene safely.',
        status: 'pending',
        type: 'frontend',
        group: 1,
        priority: 1,
        data_contract: 'Input: { status: string, incidents: number, owner: string } Output: { panels: string[], actions: string[] }',
        acceptance_criteria: [
          'Operators can see live status in one glance.',
          'Operators can trigger the main corrective action without searching.',
        ],
        error_handling: ['Render degraded-state copy when incident feeds fail.'],
      }],
      links: [],
    },
  });

  try {
    const specular = await http('POST', '/api/specular/generate', {
      sessionId: session.id,
      nodeId: 'ops-dashboard',
    }) as Record<string, unknown>;

    const nodePatch = {
      designProfile: specular.designProfile,
      referenceCandidates: specular.referenceCandidates,
      selectedReferenceIds: specular.selectedReferenceIds,
      variantCandidates: specular.variantCandidates,
      selectedVariantId: specular.selectedVariantId,
      previewArtifact: specular.previewArtifact,
      previewState: specular.previewState,
      designVerdict: specular.designVerdict,
    };

    await http('PUT', `/api/sessions/${session.id}`, {
      graph: {
        ...session.graph,
        nodes: [{ ...session.graph.nodes[0], ...nodePatch }],
      },
    });

    await withBrowser('about:blank', async (cdp) => {
      await navigateWithRetrobuilderState(cdp, {
        appMode: 'architect',
        activeProvider: 'xai',
        activeModel: null,
        activeSessionId: session.id,
        showSessionLauncher: false,
        showEnvConfigModal: false,
      });

      await waitForBody(cdp, (text) => text.includes('Ops Dashboard') && text.toLowerCase().includes('kreator mode'), 'Happy session did not hydrate in UI.');
      expect(await clickButtonContaining(cdp, 'm1nd') === 'clicked', 'Could not click m1nd mode button.');
      await delay(1000);
      expect(await clickButtonContaining(cdp, 'build with omx') === 'clicked', 'Could not trigger Build with OMX from happy UI.');

      await waitForBody(cdp, hasBuilderModeText, 'Happy-path build did not enter BU1LDER mode.', 50);
    });
  } finally {
    await deleteSessionBestEffort(session.id);
  }

  console.log('PASS Chromium CDP workbench: valid UIX session entered BU1LDER mode');
}

function seededPreviewNode() {
  return {
    id: 'ops-dashboard',
    label: 'Ops Dashboard',
    description: 'Resume-aware surface.',
    status: 'pending',
    type: 'frontend',
    group: 1,
    priority: 1,
    data_contract: 'Input: { status: string } Output: { panels: string[] }',
    acceptance_criteria: ['Shows state.', 'Shows action.'],
    error_handling: ['Fallback copy.'],
    designProfile: '21st',
    referenceCandidates: [],
    selectedReferenceIds: [],
    variantCandidates: [],
    selectedVariantId: 'seeded',
    previewArtifact: {
      kind: 'tsx',
      componentName: 'OpsDashboardPreview',
      screenType: 'dashboard',
      summary: 'seeded preview',
      blocks: [
        { id: 'hero', kind: 'hero', title: 'Ops Dashboard' },
        { id: 'metrics', kind: 'metrics', title: 'Metrics', items: ['status'] },
        { id: 'cta', kind: 'cta', title: 'Continue' },
      ],
      tsx: 'export const OpsDashboardPreview = () => null;',
    },
    previewState: { density: 'compact', emphasis: 'dashboard' },
    designVerdict: { status: 'passed', score: 90, findings: [], evidence: ['seeded'] },
  };
}

async function seedRuntimeStatus(sessionId: string, buildId: string, moduleId: string, designScore: number) {
  const runtimeDir = join(process.cwd(), '.retrobuilder', 'runtime', sessionId);
  const workspacePath = join(runtimeDir, `build-${buildId}`);
  await mkdir(join(workspacePath, 'modules', moduleId), { recursive: true });
  await writeFile(join(workspacePath, 'modules', moduleId, 'module.spec.json'), '{}', 'utf8');
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(join(runtimeDir, 'omx-status.json'), JSON.stringify({
    sessionId,
    buildId,
    status: 'stopped',
    workspacePath,
    transport: { kind: 'codex-cli', command: 'codex exec --json --skip-git-repo-check --sandbox workspace-write', available: true },
    source: 'persisted-session',
    totalNodes: 1,
    completedNodes: 0,
    buildProgress: 0,
    activeNodeId: null,
    nodeStates: { [moduleId]: 'queued' },
    designProfile: '21st',
    designGateStatus: 'passed',
    designScore,
    designFindings: [],
    designEvidence: designScore === 100 ? ['No user-facing nodes required UIX gate approval for this build.'] : ['seeded'],
    terminalMessage: 'BUILD STOPPED — seed',
  }, null, 2), 'utf8');
  return runtimeDir;
}

async function generateAndPersistSpecular(session: { id: string; graph: { nodes: Array<Record<string, unknown>>; links: unknown[] } }, nodeId: string) {
  const specular = await http('POST', '/api/specular/generate', {
    sessionId: session.id,
    nodeId,
  }) as Record<string, unknown>;

  const nodePatch = {
    designProfile: specular.designProfile,
    referenceCandidates: specular.referenceCandidates,
    selectedReferenceIds: specular.selectedReferenceIds,
    variantCandidates: specular.variantCandidates,
    selectedVariantId: specular.selectedVariantId,
    previewArtifact: specular.previewArtifact,
    previewState: specular.previewState,
    designVerdict: specular.designVerdict,
  };

  const graph = {
    ...session.graph,
    nodes: session.graph.nodes.map((node) => (
      node.id === nodeId ? { ...node, ...nodePatch } : node
    )),
  };

  await http('PUT', `/api/sessions/${session.id}`, { graph });
  session.graph = graph;
  return specular;
}

async function smokeDeterministicFullJourney() {
  const session = await createSession({
    name: 'Full Journey Mechanic CRM',
    source: 'manual',
    manifesto: 'A concept mechanic shop needs a public booking site, appointment CRM, and staff follow-up surface.',
    architecture: 'Public booking feeds CRM follow-up. CRM schedules jobs and preserves vehicle context for staff handoff.',
    projectContext: 'deterministic full journey browser smoke',
    graph: {
      nodes: [
        {
          id: 'public-booking-site',
          label: 'Public Booking Site',
          description: 'A product-grade public landing and booking surface for a mechanic shop with service packages, urgency cues, and clear appointment capture.',
          status: 'pending',
          type: 'frontend',
          group: 1,
          priority: 1,
          data_contract: 'Input: { services: Service[], slots: Slot[], trustSignals: Proof[] } Output: { selectedService: string, selectedSlot: string, lead: Contact }',
          acceptance_criteria: [
            'Customers can choose a service and see a clear booking action.',
            'The page looks like a finished product surface, not a diagnostic dashboard.',
          ],
          error_handling: ['Show friendly fallback copy when slots cannot load.'],
        },
        {
          id: 'appointment-crm',
          label: 'Appointment CRM',
          description: 'A staff-facing CRM board for service advisors to triage leads, booked jobs, vehicle notes, and next follow-up actions.',
          status: 'pending',
          type: 'frontend',
          group: 1,
          priority: 2,
          data_contract: 'Input: { leads: Lead[], appointments: Appointment[], vehicles: Vehicle[] } Output: { prioritizedJobs: Job[], followUps: Task[] }',
          acceptance_criteria: [
            'Staff can identify the next best follow-up without scanning raw data.',
            'Appointments, customer context, and action controls remain visible on mobile.',
          ],
          error_handling: ['Show stale-data state when CRM sync is delayed.'],
        },
        {
          id: 'scheduling-api',
          label: 'Scheduling API',
          description: 'Backend scheduling and lead intake API.',
          status: 'pending',
          type: 'backend',
          group: 2,
          priority: 3,
          data_contract: 'Input: booking request. Output: appointment confirmation and CRM task.',
          acceptance_criteria: ['Creates appointments.', 'Creates follow-up tasks.'],
          error_handling: ['Returns structured booking errors.'],
        },
      ],
      links: [
        { source: 'public-booking-site', target: 'scheduling-api', label: 'books' },
        { source: 'scheduling-api', target: 'appointment-crm', label: 'hydrates' },
      ],
    },
  });
  const runtimeDir = join(process.cwd(), '.retrobuilder', 'runtime', session.id);

  try {
    await generateAndPersistSpecular(session, 'public-booking-site');
    await generateAndPersistSpecular(session, 'appointment-crm');

    const readiness = await http('POST', `/api/sessions/${session.id}/readiness`, {}) as { status?: string };
    expect(
      readiness.status === 'ready' || readiness.status === 'needs_review',
      `Full journey readiness returned unexpected status: ${JSON.stringify(readiness).slice(0, 500)}`,
    );

    await withBrowser(`${BASE}/specular/showcase/${session.id}`, async (cdp) => {
      await waitForBody(cdp, (text) => text.includes('Full Journey Mechanic CRM'), 'SPECULAR showcase did not render full journey session.');
      const truth = await waitForSpecularTruth(cdp, 2);
      expect(
        truth.surfaces?.every((surface) => surface.designProfile === '21st' && surface.gate === 'passed'),
        `Expected 21st passed surfaces in truth manifest, got ${JSON.stringify(truth).slice(0, 500)}`,
      );
      await captureBrowserArtifact(cdp, 'full-journey-specular-showcase');
    });

    await withBrowser('about:blank', async (cdp) => {
      await navigateWithRetrobuilderState(cdp, {
        appMode: 'architect',
        activeProvider: 'xai',
        activeModel: null,
        activeSessionId: session.id,
        showSessionLauncher: false,
        showEnvConfigModal: false,
      });

      await waitForBody(cdp, (text) => text.includes('Public Booking Site') && text.includes('Appointment CRM'), 'Full journey session did not hydrate in UI.');
      expect(await clickButtonContaining(cdp, 'm1nd') === 'clicked', 'Could not click m1nd mode button in full journey.');
      await delay(1000);
      expect(await clickButtonContaining(cdp, 'build with omx') === 'clicked', 'Could not trigger Build with OMX in full journey.');

        await waitForBody(cdp, hasBuilderModeText, 'Full journey handoff did not enter BU1LDER mode.', 50);
        await captureBrowserArtifact(cdp, 'full-journey-builder-handoff');

      const status = await http('GET', `/api/omx/status/${session.id}`) as { designGateStatus?: string; buildId?: string; status?: string };
      expect(status.designGateStatus === 'passed', `Expected passed design gate in OMX status, got ${JSON.stringify(status).slice(0, 500)}`);
      expect(typeof status.buildId === 'string' && status.buildId.length > 0, `Expected remote OMX build id, got ${JSON.stringify(status).slice(0, 500)}`);

        await cdp.call('Page.reload');
        const reloadBody = await waitForBody(cdp, (text) => text.includes('Public Booking Site') && text.includes('Appointment CRM'), 'Full journey reload did not preserve session hydration.', 50);
        if (!hasBuilderModeText(reloadBody)) {
          expect(
            await clickButtonContaining(cdp, 'BU1LDER') === 'clicked',
            `Could not reenter BU1LDER mode after full journey reload.\n${reloadBody.slice(0, 2500)}`,
        );
      }
        await waitForBody(
          cdp,
          (text) => hasBuilderModeText(text) && (text.includes('Build') || text.includes('OMX') || text.includes('LIVE')),
          'Full journey reload did not preserve BU1LDER reentry truth.',
          50,
        );
      await captureBrowserArtifact(cdp, 'full-journey-builder-reentry');
    });
  } finally {
    await deleteSessionBestEffort(session.id);
    await rm(runtimeDir, { recursive: true, force: true });
  }

  console.log('PASS Chromium CDP workbench: deterministic full journey preserved SPECULAR, OMX handoff, and reload truth');
}

async function smokeResumeHint() {
  const session = await createSession({
    name: 'UI Resume Hint Session',
    source: 'manual',
    manifesto: 'Resume hint smoke test',
    architecture: 'Builder should suggest resume when a stopped OMX build exists.',
    projectContext: 'ui resume hint',
    graph: {
      nodes: [seededPreviewNode()],
      links: [],
    },
  });
  const runtimeDir = await seedRuntimeStatus(session.id, 'resume-hint', 'ops-dashboard', 90);

  try {
    await withBrowser('about:blank', async (cdp) => {
      await navigateWithRetrobuilderState(cdp, {
        appMode: 'builder',
        activeProvider: 'xai',
        activeModel: null,
        activeSessionId: session.id,
        showSessionLauncher: false,
        showEnvConfigModal: false,
      });

      await waitForBody(
        cdp,
        (text) => {
          const normalized = text.toLowerCase();
          return normalized.includes('resume available:') && normalized.includes('resume stopped');
        },
        'Builder chat did not surface resume hint automatically.',
      );
    });
  } finally {
    await deleteSessionBestEffort(session.id);
    await rm(runtimeDir, { recursive: true, force: true });
  }

  console.log('PASS Chromium CDP workbench: builder chat surfaced resume availability');
}

async function smokeResumeChat() {
  const session = await createSession({
    name: 'UI Resume Chat Session',
    source: 'manual',
    manifesto: 'Resume chat smoke test',
    architecture: 'Builder chat should resume from a stopped OMX build.',
    projectContext: 'ui resume chat',
    graph: {
      nodes: [{
        id: 'artist-registry',
        label: 'Artist Registry',
        description: 'Persist artist records.',
        status: 'pending',
        type: 'backend',
        group: 1,
        priority: 1,
        data_contract: 'Input: artist payload. Output: persisted artist record.',
        acceptance_criteria: ['Stores artist data.', 'Exposes lookup.'],
        error_handling: ['Returns structured errors.'],
      }],
      links: [],
    },
  });
  const runtimeDir = await seedRuntimeStatus(session.id, 'resume-chat', 'artist-registry', 100);

  try {
    await withBrowser('about:blank', async (cdp) => {
      await navigateWithRetrobuilderState(cdp, {
        appMode: 'builder',
        activeProvider: 'xai',
        activeModel: null,
        activeSessionId: session.id,
        showSessionLauncher: false,
        showEnvConfigModal: false,
      });

      await waitForBody(cdp, (text) => text.includes('Resume available:'), 'Builder chat did not surface resume hint automatically.');
      const sent = await cdp.evaluate<string>(`(() => {
        const textarea = document.querySelector('textarea');
        if (!textarea) return 'missing-textarea';
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (!setter) return 'missing-setter';
        setter.call(textarea, 'continue');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        return 'sent';
      })()`);
      expect(sent === 'sent', `Could not send continue command through builder chat: ${sent}`);

      await waitForBody(
        cdp,
        (text) => text.includes('Resuming OMX build') || text.includes('● LIVE') || text.includes('BUILD COMPLETE'),
        'Builder chat did not trigger a visible OMX resume.',
        50,
      );
    });
  } finally {
    await deleteSessionBestEffort(session.id);
    await rm(runtimeDir, { recursive: true, force: true });
  }

  console.log('PASS Chromium CDP workbench: builder chat resumed OMX execution');
}

const tests = [
  smokeShellAndBuilderMode,
  smokeBlockedBuildRoutesToUixCorrection,
  smokeHappyBuildEntersBuilderMode,
  smokeDeterministicFullJourney,
  smokeResumeHint,
  smokeResumeChat,
];

for (const test of tests) {
  await test();
}

console.log(`PASS Chromium CDP workbench matrix: ${tests.length}/${tests.length} scenarios verified against ${BASE}`);
