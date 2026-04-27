#!/usr/bin/env tsx
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = process.env.RETROBUILDER_TEST_BASE || 'http://127.0.0.1:7777';
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

async function createSession() {
  return await http('POST', '/api/sessions', {
    name: 'Specular Browser Truth Session',
    source: 'manual',
    manifesto: 'Browser-visible product QA must preserve backend truth.',
    architecture: 'SPECULAR showcase renders user-facing surfaces plus a machine-readable truth manifest.',
    projectContext: 'specular browser truth smoke',
    graph: {
      nodes: [
        {
          id: 'public-booking-site',
          label: 'Public Booking Site',
          description: 'A high-conversion public booking site for a concept auto shop with service packages, availability, and trust-building proof.',
          status: 'pending',
          type: 'frontend',
          group: 1,
          priority: 1,
          data_contract: 'Input: { services: Service[], slots: Slot[], heroOffer: string } Output: { selectedService: string, selectedSlot: string, lead: Contact }',
          acceptance_criteria: [
            'Customers can choose a service and see a clear next booking action.',
            'The surface feels like a finished product page, not a diagnostic dashboard.',
          ],
          error_handling: [
            'Render a friendly fallback when slot inventory is unavailable.',
          ],
        },
        {
          id: 'crm-service-board',
          label: 'CRM Service Board',
          description: 'A staff-facing CRM board for mechanics to triage leads, booked appointments, vehicle notes, and high-priority follow-ups.',
          status: 'pending',
          type: 'frontend',
          group: 1,
          priority: 2,
          data_contract: 'Input: { leads: Lead[], appointments: Appointment[], vehicles: Vehicle[] } Output: { prioritizedJobs: Job[], followUps: Task[] }',
          acceptance_criteria: [
            'Staff can identify the next best follow-up without scanning raw JSON.',
            'Appointments, customer context, and action controls are visible on mobile.',
          ],
          error_handling: [
            'Show stale-data state when CRM sync is delayed.',
          ],
        },
      ],
      links: [],
    },
  }) as { id: string };
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

function stopChromium(proc: ChildProcess) {
  proc.kill('SIGTERM');
  setTimeout(() => {
    if (!proc.killed) proc.kill('SIGKILL');
  }, 3000).unref();
}

async function run() {
  const session = await createSession();
  const userDataDir = await mkdtemp(join(tmpdir(), 'retrobuilder-specular-showcase-'));
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
      `--user-data-dir=${userDataDir}`,
      `${BASE}/specular/showcase/${session.id}`,
    ], { stdio: 'ignore' });

    const wsUrl = await waitForCdpTarget(port);
    cdp = await CdpClient.connect(wsUrl);
    await cdp.call('Page.enable');
    await cdp.call('Runtime.enable');

    let body = '';
    for (let attempt = 0; attempt < 40; attempt += 1) {
      body = await cdp.evaluate<string>('document.body ? document.body.innerText : ""');
      const normalizedBody = body.toLowerCase();
      if (normalizedBody.includes('retrobuilder specular showcase') && body.includes('Specular Browser Truth Session')) {
        break;
      }
      await delay(250);
    }

    expect(body.toLowerCase().includes('retrobuilder specular showcase'), `SPECULAR showcase did not render expected chrome. Body: ${body.slice(0, 1200)}`);

    const desktop = await cdp.evaluate<{
      manifest: {
        sessionId?: string;
        surfaceCount?: number;
        surfaces?: Array<{
          nodeId?: string;
          designProfile?: string;
          selectedReferenceIds?: string[];
          score?: number;
        }>;
      };
      surfaceIds: string[];
      hasHero: boolean;
      hasProductActions: boolean;
      leaksLegacyVisualTokens: boolean;
      leaksTechnicalNotes: boolean;
      overflow: number;
    }>(`(() => {
      const manifestEl = document.getElementById('rb-specular-truth');
      const manifest = manifestEl ? JSON.parse(manifestEl.textContent || '{}') : null;
      const surfaces = [...document.querySelectorAll('[data-specular-surface-id]')];
      const html = document.documentElement.innerHTML;
      return {
        manifest,
        surfaceIds: surfaces.map((surface) => surface.getAttribute('data-specular-surface-id')),
        hasHero: Boolean(document.querySelector('.rb-hero')),
        hasProductActions: Boolean(document.querySelector('.rb-actions')),
        leaksLegacyVisualTokens: /bg-black\\/30|bg-black\\/25|bg-white\\/5|text-slate-|radial-gradient\\(circle_at_top_left/.test(html),
        leaksTechnicalNotes: /deps:|stack adapters:|mobile:/.test(document.body.innerText || ''),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    })()`);

    const manifestSurfaces = desktop.manifest.surfaces || [];
    expect(desktop.manifest.sessionId === session.id, `Truth manifest did not preserve session id: ${JSON.stringify(desktop)}`);
    expect(desktop.manifest.surfaceCount === desktop.surfaceIds.length && desktop.manifest.surfaceCount >= 2, `DOM surface count does not match truth manifest: ${JSON.stringify(desktop)}`);
    expect(new Set(desktop.surfaceIds).size === manifestSurfaces.length, `DOM surface ids are not unique: ${JSON.stringify(desktop)}`);
    expect(desktop.surfaceIds.every((id) => manifestSurfaces.some((surface) => surface.nodeId === id)), `DOM surface ids do not match truth manifest node ids: ${JSON.stringify(desktop)}`);
    expect(manifestSurfaces.every((surface) => surface.designProfile === '21st'), `Truth manifest includes a non-21st design profile: ${JSON.stringify(desktop)}`);
    expect(manifestSurfaces.every((surface) => Array.isArray(surface.selectedReferenceIds) && surface.selectedReferenceIds.length > 0), `Truth manifest lacks selected 21st reference anchors: ${JSON.stringify(desktop)}`);
    expect(!desktop.leaksLegacyVisualTokens && !desktop.leaksTechnicalNotes, `Showcase leaked legacy visual tokens or technical notes: ${JSON.stringify(desktop)}`);
    expect(desktop.hasHero && desktop.hasProductActions, `Showcase lacks product-grade hero/actions: ${JSON.stringify(desktop)}`);
    await captureBrowserArtifact(cdp, 'specular-showcase-desktop');

    await cdp.call('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await delay(200);
    const mobile = await cdp.evaluate<{
      width: number;
      scrollWidth: number;
      overflow: number;
      surfaceCount: number;
    }>(`(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      surfaceCount: document.querySelectorAll('[data-specular-surface-id]').length,
    }))()`);

    expect(mobile.overflow <= 4, `Mobile viewport has horizontal overflow: ${JSON.stringify(mobile)}`);
    expect(mobile.surfaceCount === desktop.manifest.surfaceCount, `Mobile DOM dropped surfaces from the truth manifest: ${JSON.stringify(mobile)}`);
    await captureBrowserArtifact(cdp, 'specular-showcase-mobile');

    console.log('PASS Chromium CDP SPECULAR showcase: browser DOM, truth manifest, 21st anchors, and mobile containment verified');
  } finally {
    try {
      await http('DELETE', `/api/sessions/${session.id}`);
    } catch {
      // Best-effort cleanup for test-created sessions.
    }
    cdp?.close();
    if (proc) stopChromium(proc);
    await rm(userDataDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error('FAIL Chromium CDP SPECULAR showcase');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
