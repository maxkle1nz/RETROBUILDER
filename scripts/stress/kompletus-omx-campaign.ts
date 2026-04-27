#!/usr/bin/env tsx
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import process from 'node:process';

type MaybeRecord = Record<string, unknown>;

interface KompletusEvent {
  stage: string;
  status: 'running' | 'done' | 'error';
  message?: string;
  data?: MaybeRecord;
}

interface SpecularAuditResult {
  moments: Array<{ id: string; label: string; backendStages: string[]; userQuestion: string }>;
  coverage: Array<{ backendPhase: string; momentId: string; momentLabel: string; confidence: number }>;
  nodeScreenMap: Array<{
    nodeId: string;
    label: string;
    hasUserSurface: boolean;
    screenType?: string;
    userActions?: string[];
    dataDisplayed?: string[];
  }>;
  parityScore: number;
}

interface SpecularCreateResponse {
  nodeId: string;
  designProfile: '21st';
  referenceCandidates: Array<{ id: string; title: string; category: string; rationale: string; tags: string[]; source: '21st-local' }>;
  selectedReferenceIds: string[];
  variantCandidates: Array<{
    id: string;
    label: string;
    description: string;
    flavor: 'editorial' | 'control' | 'conversational';
    screenType: string;
    referenceIds: string[];
    previewArtifact: { kind: 'tsx'; componentName: string; screenType: string; summary: string; blocks: Array<{ id: string; kind: string; title: string }>; tsx: string };
    designVerdict: { status: 'pending' | 'passed' | 'failed'; score: number; findings: string[]; evidence: string[] };
  }>;
  selectedVariantId: string;
  previewArtifact: { kind: 'tsx'; componentName: string; screenType: string; summary: string; blocks: Array<{ id: string; kind: string; title: string }>; tsx: string };
  previewState: { density: 'comfortable' | 'compact'; emphasis: 'editorial' | 'product' | 'dashboard' };
  designVerdict: { status: 'pending' | 'passed' | 'failed'; score: number; findings: string[]; evidence: string[] };
}

interface KompletusResult {
  graph: {
    nodes: Array<{
      id: string;
      label: string;
      description?: string;
      type?: string;
      data_contract?: string;
      decision_rationale?: string;
      acceptance_criteria?: string[];
      error_handling?: string[];
      constructionNotes?: string;
      researchContext?: string;
    }>;
    links: Array<{ source: string; target: string; label?: string }>;
  };
  manifesto: string;
  architecture: string;
  explanation: string;
  research: Record<string, { report: string; meta: MaybeRecord }>;
  specular: SpecularAuditResult;
  specularCreate: {
    designProfile: '21st';
    artifacts: SpecularCreateResponse[];
    gate: {
      designProfile: '21st';
      designGateStatus: 'pending' | 'passed' | 'failed';
      designScore: number;
      designFindings: string[];
      designEvidence: string[];
      affectedNodeIds: string[];
      failingNodeIds?: string[];
    };
    warnings: string[];
  };
  l1ght: {
    expandedContracts: number;
    crossNodeIssues: number;
    artifacts: { routeMap?: string; envTemplate?: string; dbSchema?: string };
  };
  qualityGate: { passed: boolean; iterations: number; remainingIssues: string[] };
  meta: {
    totalTimeMs: number;
    stages: Record<string, { durationMs: number; details?: MaybeRecord }>;
  };
}

interface SessionDocument {
  id: string;
  name: string;
  source: 'manual' | 'imported_codebase';
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  manifesto: string;
  architecture: string;
  graph: KompletusResult['graph'];
  projectContext: string;
}

interface OmxBuildStartResponse {
  sessionId: string;
  buildId: string;
  status: 'queued' | 'running' | 'stopping' | 'stopped';
  workspacePath: string;
  streamUrl: string;
  statusUrl: string;
  stopUrl: string;
  transport: { kind: 'codex-cli'; command: string; available: boolean };
  source: 'persisted-session' | 'session-draft';
  designProfile?: '21st';
  designGateStatus?: 'pending' | 'passed' | 'failed';
  designScore?: number;
  designFindings?: string[];
  designEvidence?: string[];
}

interface OmxBuildStatus {
  sessionId: string;
  buildId?: string;
  status: 'idle' | 'queued' | 'running' | 'succeeded' | 'failed' | 'stopping' | 'stopped';
  workspacePath?: string;
  transport: { kind: 'codex-cli'; command: string; available: boolean };
  source: 'persisted-session' | 'session-draft';
  totalNodes?: number;
  completedNodes?: number;
  buildProgress?: number;
  activeNodeId?: string | null;
  nodeStates?: Record<string, 'dormant' | 'queued' | 'building' | 'complete' | 'error'>;
  result?: {
    totalFiles: number;
    totalLines: number;
    elapsedMs: number;
    systemVerify?: {
      status: 'pending' | 'passed' | 'failed' | 'not_available';
      command?: string;
      summary?: string;
    };
  };
  terminalMessage?: string;
  designProfile?: '21st';
  designGateStatus?: 'pending' | 'passed' | 'failed';
  designScore?: number;
  designFindings?: string[];
  designEvidence?: string[];
  resumeAvailable?: boolean;
  resumeReason?: 'interrupted' | 'stopped' | 'failed';
  wavesTotal?: number;
  wavesCompleted?: number;
  activeWaveId?: string | null;
  activeTasks?: string[];
  workerCount?: number;
  verifyPendingCount?: number;
  mergePendingCount?: number;
  ledgerVersion?: number;
  verifyReceipts?: Record<string, { taskId: string; passed: boolean; command: string; summary: string; verifiedAt: string }>;
  mergeReceipts?: Record<string, { taskId: string; applied: boolean; appliedPaths: string[]; rejectedPaths: string[]; reason?: string; ownerCandidates?: string[]; mergedAt: string }>;
}

interface ExportResponse {
  plan: string;
  agents: string;
  readiness: {
    status: 'ready' | 'blocked' | 'needs_review';
    exportAllowed: boolean;
    blockers: Array<{ code: string; message: string; nodeIds?: string[] }>;
    warnings: Array<{ code: string; message: string; nodeIds?: string[] }>;
    buildOrder: Array<{ id: string; label: string; priority: number }>;
    stats: {
      totalNodes: number;
      totalLinks: number;
      acceptanceCoverage: number;
      contractCoverage: number;
      errorHandlingCoverage: number;
      hasCycles: boolean;
      unresolvedLinkCount: number;
      groundingQuality: 'degraded' | 'medium' | 'high';
    };
    projection: {
      prepared: boolean;
      runtimeDir: string;
      preparedAt?: string;
    };
  };
  stats: {
    totalNodes: number;
    totalPhases: number;
    totalAcceptanceCriteria: number;
    buildOrder: Array<{ id: string; label: string; priority: number; waveId: string }>;
  };
}

interface PromptSpec {
  label: string;
  prompt: string;
}

interface IntakeCoverage {
  present: boolean;
  nodeIds: string[];
  sharedCoreNodeIds: string[];
  connected: boolean;
}

interface ScenarioSummary {
  label: string;
  prompt: string;
  pass: boolean;
  failures: string[];
  durationsMs: {
    kompletus?: number;
    session?: number;
    export?: number;
    build?: number;
    total: number;
  };
  kompletus?: {
    source: 'kompletus' | 'existing-session';
    nodeCount: number;
    linkCount: number;
    qualityGatePassed?: boolean;
    whatsapp: IntakeCoverage;
    mobileWeb: IntakeCoverage;
    specularParityScore: number;
    specularCreateArtifacts: number;
  };
  session?: { id: string; name: string };
  export?: {
    exportAllowed: boolean;
    readinessStatus: ExportResponse['readiness']['status'];
    totalNodes: number;
    totalLinks: number;
  };
  build?: {
    buildId: string;
    workspacePath: string;
    finalStatus: OmxBuildStatus['status'];
    systemVerifyStatus?: NonNullable<NonNullable<OmxBuildStatus['result']>['systemVerify']>['status'];
    historyCount: number;
    terminalMessage?: string;
  };
}

interface CampaignSummary {
  version: 1;
  startedAt: string;
  endedAt: string;
  baseUrl: string;
  bridgeUrl: string;
  promptCount: number;
  overallPass: boolean;
  preflight: {
    appHealth: boolean;
    bridgeHealth: boolean;
  };
  scenarios: ScenarioSummary[];
}

const DEFAULT_APP_URL = 'http://localhost:7777';
const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:7788';
const DEFAULT_PROMPT_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;

const DEFAULT_PROMPTS: PromptSpec[] = [
  {
    label: 'Bakery IT',
    prompt:
      'Italian bakery CRM with daily bread, cakes, sweets, monthly packages, personalized delivery frequency, WhatsApp order intake, and mobile-first web ordering.',
  },
  {
    label: 'CasaCare',
    prompt:
      'Home healthcare visit scheduler with patients, caregivers, recurring treatments, medication reminders, emergency escalation, privacy constraints, WhatsApp intake, and mobile-first booking.',
  },
  {
    label: 'FleetGelato',
    prompt:
      'Refrigerated gelato delivery fleet with live inventory, cold-chain routing, subscriptions, driver app, stock depletion risk, WhatsApp ordering, and mobile-first customer ordering.',
  },
  {
    label: 'StudioLegale',
    prompt:
      'Italian law-office CRM with client matters, appointments, document deadlines, retainer packages, GDPR-sensitive case notes, WhatsApp request intake, and mobile-first client portal.',
  },
  {
    label: 'MercatoLocale',
    prompt:
      'Neighborhood marketplace for recurring local grocery baskets, vendor onboarding, customer subscriptions, delivery windows, payments, refunds, WhatsApp ordering, and mobile-first web ordering.',
  },
];

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq >= 0) {
      out[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function parseCsv(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeBaseUrl(input: string) {
  return input.replace(/\/+$/, '');
}

function normalizeBridgeUrl(input: string) {
  return normalizeBaseUrl(input).replace(/\/v1$/, '');
}

function joinUrl(baseUrl: string, pathname: string) {
  return new URL(pathname, `${normalizeBaseUrl(baseUrl)}/`).toString();
}

function nowIso() {
  return new Date().toISOString();
}

function truncate(text: string, max = 180) {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function tryParseJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is MaybeRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function allNodeText(node: KompletusResult['graph']['nodes'][number]) {
  const parts = [
    node.label,
    node.description,
    node.data_contract,
    node.decision_rationale,
    node.constructionNotes,
    node.researchContext,
    ...(node.acceptance_criteria || []),
    ...(node.error_handling || []),
  ];
  return parts.filter((part): part is string => typeof part === 'string').join('\n');
}

function buildAdjacency(graph: KompletusResult['graph']) {
  const adjacency = new Map<string, Set<string>>();
  for (const node of graph.nodes) adjacency.set(node.id, new Set<string>());
  for (const link of graph.links) {
    if (!adjacency.has(link.source) || !adjacency.has(link.target)) continue;
    adjacency.get(link.source)!.add(link.target);
    adjacency.get(link.target)!.add(link.source);
  }
  return adjacency;
}

function reachableFrom(startId: string, adjacency: Map<string, Set<string>>) {
  const seen = new Set<string>();
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const neighbor of adjacency.get(current) || []) {
      if (!seen.has(neighbor)) queue.push(neighbor);
    }
  }
  return seen;
}

function detectIntakeCoverage(graph: KompletusResult['graph']) {
  const adjacency = buildAdjacency(graph);
  const matches = (regex: RegExp) =>
    graph.nodes.filter((node) => regex.test(allNodeText(node)));
  const coreNodes = graph.nodes.filter((node) => {
    const text = allNodeText(node);
    return /(order|subscription|booking|customer|client|patient|delivery|request|checkout|workflow|intake)/i.test(text);
  });
  const whatsappNodes = matches(/whatsapp/i);
  const mobileWebNodes = matches(/mobile[-\s]?first|mobile[-\s]?web|responsive mobile|web (ordering|booking|intake|portal|ordering)/i);

  const reachableFromGroup = (nodes: KompletusResult['graph']['nodes']) => {
    const seen = new Set<string>();
    for (const node of nodes) {
      for (const id of reachableFrom(node.id, adjacency)) seen.add(id);
    }
    return seen;
  };

  const whatsappReachable = reachableFromGroup(whatsappNodes);
  const mobileReachable = reachableFromGroup(mobileWebNodes);
  const sharedCoreNodeIds = coreNodes
    .map((node) => node.id)
    .filter((nodeId) => whatsappReachable.has(nodeId) && mobileReachable.has(nodeId));

  const makeCoverage = (nodes: KompletusResult['graph']['nodes']) => ({
    present: nodes.length > 0,
    nodeIds: nodes.map((node) => node.id),
    sharedCoreNodeIds,
    connected: nodes.length > 0 && sharedCoreNodeIds.length > 0,
  });

  return {
    whatsapp: makeCoverage(whatsappNodes),
    mobileWeb: makeCoverage(mobileWebNodes),
    sharedCoreNodeIds,
  };
}

async function fetchText(url: string, init?: RequestInit, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  return { res, text };
}

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): Promise<T> {
  const { res, text } = await fetchText(url, init, timeoutMs);
  const data = tryParseJson(text);
  if (!res.ok) {
    const detail = isRecord(data) && typeof data.error === 'string' ? data.error : text || `HTTP ${res.status}`;
    throw new Error(`${res.status} ${res.statusText}: ${detail}`);
  }
  if (data === null) {
    throw new Error(`Expected JSON from ${url}, got: ${truncate(text)}`);
  }
  return data as T;
}

async function checkHealth(url: string) {
  try {
    await fetchJson<MaybeRecord>(url, undefined, DEFAULT_REQUEST_TIMEOUT_MS);
    return true;
  } catch {
    return false;
  }
}

async function runKompletus(
  baseUrl: string,
  prompt: string,
  model: string | undefined,
  timeoutMs: number,
  onProgress: (event: KompletusEvent) => void,
): Promise<KompletusResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(joinUrl(baseUrl, '/api/ai/kompletus'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(model ? { prompt, model } : { prompt }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${truncate(body, 300)}`);
    }

    return await new Promise<KompletusResult>((resolve, reject) => {
      const reader = res.body?.getReader();
      if (!reader) {
        reject(new Error('No response body from KOMPLETUS stream'));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult: KompletusResult | null = null;
      let lastError: string | null = null;
      let eventType = '';

      function processLines(text: string) {
        buffer += text;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ') && eventType) {
            const raw = line.slice(6);
            try {
              const data = JSON.parse(raw) as unknown;
              if (eventType === 'progress') {
                onProgress(data as KompletusEvent);
              } else if (eventType === 'result') {
                finalResult = data as KompletusResult;
              } else if (eventType === 'error' && isRecord(data) && typeof data.error === 'string') {
                lastError = data.error;
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              if (eventType === 'result') {
                lastError = `Result JSON parse failed (${raw.length} chars): ${message}`;
              }
            }
            eventType = '';
          } else if (line === '') {
            eventType = '';
          }
        }
      }

      async function pump() {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            processLines(decoder.decode(value, { stream: true }));
          }
          if (buffer.trim()) {
            const remaining = buffer;
            buffer = '';
            processLines(`${remaining}\n`);
          }
          if (lastError && !finalResult) {
            reject(new Error(lastError));
          } else if (finalResult) {
            resolve(finalResult);
          } else {
            reject(new Error('Pipeline stream ended without result event'));
          }
        } catch (error) {
          reject(error);
        }
      }

      void pump();
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function createSession(baseUrl: string, payload: Omit<SessionDocument, 'id' | 'createdAt' | 'updatedAt' | 'archived'>) {
  return fetchJson<SessionDocument>(joinUrl(baseUrl, '/api/sessions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function fetchSession(baseUrl: string, sessionId: string) {
  return fetchJson<SessionDocument>(joinUrl(baseUrl, `/api/sessions/${encodeURIComponent(sessionId)}`));
}

async function exportSessionToOmx(baseUrl: string, sessionId: string) {
  return fetchJson<ExportResponse>(joinUrl(baseUrl, '/api/export/omx'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
}

async function startOmxBuild(baseUrl: string, sessionId: string) {
  return fetchJson<OmxBuildStartResponse>(joinUrl(baseUrl, '/api/omx/build'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
}

async function resumeOmxBuild(baseUrl: string, sessionId: string) {
  return fetchJson<OmxBuildStartResponse>(joinUrl(baseUrl, '/api/omx/resume'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
}

async function startOrResumeOmxBuild(baseUrl: string, sessionId: string, preferResume: boolean) {
  if (!preferResume) return startOmxBuild(baseUrl, sessionId);
  try {
    return await resumeOmxBuild(baseUrl, sessionId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/No resumable OMX build found/i.test(message)) {
      return startOmxBuild(baseUrl, sessionId);
    }
    throw error;
  }
}

async function fetchOmxStatus(baseUrl: string, sessionId: string) {
  return fetchJson<OmxBuildStatus>(joinUrl(baseUrl, `/api/omx/status/${sessionId}`));
}

async function fetchOmxHistory(baseUrl: string, sessionId: string, buildId?: string) {
  const suffix = buildId ? `?buildId=${encodeURIComponent(buildId)}` : '';
  const data = await fetchJson<{ events?: Record<string, unknown>[] }>(joinUrl(baseUrl, `/api/omx/history/${sessionId}${suffix}`));
  return Array.isArray(data.events) ? data.events : [];
}

async function waitForTerminalStatus(baseUrl: string, sessionId: string, deadlineMs: number, pollIntervalMs: number) {
  const terminalStatuses = new Set<OmxBuildStatus['status']>(['succeeded', 'failed', 'stopped']);
  let latest: OmxBuildStatus | null = null;

  while (performance.now() < deadlineMs) {
    latest = await fetchOmxStatus(baseUrl, sessionId);
    if (terminalStatuses.has(latest.status)) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Timed out waiting for OMX terminal status. Last status: ${latest?.status || 'unknown'}`);
}

async function promptCatalogFromFile(filePath: string): Promise<PromptSpec[]> {
  const text = await readFile(filePath, 'utf8');
  return (() => {
    const parsed = tryParseJson(text);
    if (Array.isArray(parsed)) {
      return parsed.map((entry, index) => {
        if (typeof entry === 'string') {
          return { label: `Prompt ${index + 1}`, prompt: entry } satisfies PromptSpec;
        }
        if (isRecord(entry) && typeof entry.prompt === 'string') {
          return {
            label: typeof entry.label === 'string' ? entry.label : `Prompt ${index + 1}`,
            prompt: entry.prompt,
          } satisfies PromptSpec;
        }
        throw new Error(`Unsupported prompt entry at index ${index}`);
      });
    }
    if (isRecord(parsed) && Array.isArray(parsed.prompts)) {
      return parsed.prompts.map((entry: unknown, index: number) => {
        if (typeof entry === 'string') {
          return { label: `Prompt ${index + 1}`, prompt: entry } satisfies PromptSpec;
        }
        if (isRecord(entry) && typeof entry.prompt === 'string') {
          return {
            label: typeof entry.label === 'string' ? entry.label : `Prompt ${index + 1}`,
            prompt: entry.prompt,
          } satisfies PromptSpec;
        }
        throw new Error(`Unsupported prompt entry at index ${index}`);
      });
    }
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((prompt, index) => ({ label: `Prompt ${index + 1}`, prompt }));
  })();
}

function createPromptFailure(failures: string[], prefix: string, message: string) {
  failures.push(`${prefix}: ${message}`);
}

async function runScenario(
  baseUrl: string,
  promptSpec: PromptSpec,
  model: string | undefined,
  promptTimeoutMs: number,
  pollIntervalMs: number,
  existingSessionId?: string,
) {
  const startedAt = performance.now();
  const failures: string[] = [];

  console.log(`\n[${promptSpec.label}] ${truncate(promptSpec.prompt, 120)}`);

  let kompletusResult: KompletusResult | null = null;
  let session: SessionDocument | null = null;
  let exportResult: ExportResponse | null = null;
  let buildStart: OmxBuildStartResponse | null = null;
  let finalStatus: OmxBuildStatus | null = null;
  let history: Record<string, unknown>[] = [];

  const scenario: ScenarioSummary = {
    label: promptSpec.label,
    prompt: promptSpec.prompt,
    pass: false,
    failures,
    durationsMs: { total: 0 },
  };

  try {
    if (existingSessionId) {
      const sessionStarted = performance.now();
      session = await fetchSession(baseUrl, existingSessionId);
      scenario.durationsMs.session = Math.round(performance.now() - sessionStarted);
      scenario.session = { id: session.id, name: session.name };

      const graph = session.graph;
      const intake = detectIntakeCoverage(graph);
      const whatsappCoverage = intake.whatsapp;
      const mobileWebCoverage = intake.mobileWeb;

      scenario.kompletus = {
        source: 'existing-session',
        nodeCount: graph.nodes.length,
        linkCount: graph.links.length,
        whatsapp: whatsappCoverage,
        mobileWeb: mobileWebCoverage,
        specularParityScore: 0,
        specularCreateArtifacts: 0,
      };

      if (graph.nodes.length === 0) createPromptFailure(failures, 'Session', 'graph has no nodes');
      if (graph.links.length === 0) createPromptFailure(failures, 'Session', 'graph has no links');
      if (!whatsappCoverage.present) createPromptFailure(failures, 'Intake', 'WhatsApp intake was not detected');
      if (!whatsappCoverage.connected) createPromptFailure(failures, 'Intake', 'WhatsApp intake is not connected to a shared core flow');
      if (!mobileWebCoverage.present) createPromptFailure(failures, 'Intake', 'mobile-first web intake was not detected');
      if (!mobileWebCoverage.connected) createPromptFailure(failures, 'Intake', 'mobile-first web intake is not connected to a shared core flow');
    } else {
      const kompletusStarted = performance.now();
      kompletusResult = await runKompletus(baseUrl, promptSpec.prompt, model, promptTimeoutMs, (event) => {
        const icon = event.status === 'done' ? 'done' : event.status === 'error' ? 'error' : 'run';
        if (event.stage === 'quality_gate' || event.status !== 'running') {
          console.log(`  [kompletus:${icon}] ${event.stage} ${event.message || ''}`.trim());
        }
      });
      scenario.durationsMs.kompletus = Math.round(performance.now() - kompletusStarted);

      const graph = kompletusResult.graph;
      const intake = detectIntakeCoverage(graph);
      const qualityGatePassed = Boolean(kompletusResult.qualityGate?.passed);
      const whatsappCoverage = intake.whatsapp;
      const mobileWebCoverage = intake.mobileWeb;

      scenario.kompletus = {
        source: 'kompletus',
        nodeCount: graph.nodes.length,
        linkCount: graph.links.length,
        qualityGatePassed,
        whatsapp: whatsappCoverage,
        mobileWeb: mobileWebCoverage,
        specularParityScore: kompletusResult.specular?.parityScore ?? 0,
        specularCreateArtifacts: kompletusResult.specularCreate?.artifacts?.length ?? 0,
      };

      if (!qualityGatePassed) createPromptFailure(failures, 'KOMPLETUS', 'quality gate did not pass');
      if (graph.nodes.length === 0) createPromptFailure(failures, 'KOMPLETUS', 'graph has no nodes');
      if (graph.links.length === 0) createPromptFailure(failures, 'KOMPLETUS', 'graph has no links');
      if (!kompletusResult.specular?.moments?.length) createPromptFailure(failures, 'KOMPLETUS', 'missing SPECULAR moments');
      if (!kompletusResult.specularCreate?.artifacts?.length) createPromptFailure(failures, 'KOMPLETUS', 'missing SPECULAR CREATE artifacts');

      if (!whatsappCoverage.present) createPromptFailure(failures, 'Intake', 'WhatsApp intake was not detected');
      if (!whatsappCoverage.connected) createPromptFailure(failures, 'Intake', 'WhatsApp intake is not connected to a shared core flow');
      if (!mobileWebCoverage.present) createPromptFailure(failures, 'Intake', 'mobile-first web intake was not detected');
      if (!mobileWebCoverage.connected) createPromptFailure(failures, 'Intake', 'mobile-first web intake is not connected to a shared core flow');
      if (whatsappCoverage.sharedCoreNodeIds.length === 0 || mobileWebCoverage.sharedCoreNodeIds.length === 0) {
        createPromptFailure(failures, 'Intake', 'no shared core node was found between WhatsApp and mobile web intake');
      }

      if (failures.length === 0) {
        const sessionStarted = performance.now();
        session = await createSession(baseUrl, {
          name: `${promptSpec.label} stress ${Date.now()}`,
          source: 'manual',
          manifesto: kompletusResult.manifesto,
          architecture: kompletusResult.architecture,
          graph,
          projectContext: kompletusResult.explanation,
        });
        scenario.durationsMs.session = Math.round(performance.now() - sessionStarted);
        scenario.session = { id: session.id, name: session.name };
      }
    }

    if (failures.length === 0 && session) {
      const exportStarted = performance.now();
      exportResult = await exportSessionToOmx(baseUrl, session.id);
      scenario.durationsMs.export = Math.round(performance.now() - exportStarted);
      scenario.export = {
        exportAllowed: exportResult.readiness.exportAllowed,
        readinessStatus: exportResult.readiness.status,
        totalNodes: exportResult.stats.totalNodes,
        totalLinks: exportResult.readiness.stats.totalLinks,
      };

      if (!exportResult.readiness.exportAllowed) {
        createPromptFailure(failures, 'Export', 'readiness blocked export to OMX');
      }
      if (typeof exportResult.plan !== 'string' || exportResult.plan.length === 0) {
        createPromptFailure(failures, 'Export', 'missing OMX plan');
      }
      if (typeof exportResult.agents !== 'string' || exportResult.agents.length === 0) {
        createPromptFailure(failures, 'Export', 'missing AGENTS.md content');
      }
    }

    if (failures.length === 0 && session) {
      const buildStarted = performance.now();
      buildStart = await startOrResumeOmxBuild(baseUrl, session.id, Boolean(existingSessionId));
      scenario.build = {
        buildId: buildStart.buildId,
        workspacePath: buildStart.workspacePath,
        finalStatus: buildStart.status,
        historyCount: 0,
      };

      if (!buildStart.buildId) createPromptFailure(failures, 'Build', 'missing buildId');
      if (!buildStart.statusUrl) createPromptFailure(failures, 'Build', 'missing statusUrl');
      if (buildStart.status !== 'queued' && buildStart.status !== 'running') {
        createPromptFailure(failures, 'Build', `unexpected start status ${buildStart.status}`);
      }

      if (buildStart.buildId) {
        finalStatus = await waitForTerminalStatus(
          baseUrl,
          session.id,
          performance.now() + promptTimeoutMs,
          pollIntervalMs,
        );
        history = await fetchOmxHistory(baseUrl, session.id, buildStart.buildId);
        scenario.durationsMs.build = Math.round(performance.now() - buildStarted);
        scenario.build = {
          buildId: buildStart.buildId,
          workspacePath: buildStart.workspacePath,
          finalStatus: finalStatus.status,
          systemVerifyStatus: finalStatus.result?.systemVerify?.status,
          historyCount: history.length,
          terminalMessage: finalStatus.terminalMessage,
        };

        if (finalStatus.status !== 'succeeded') {
          createPromptFailure(failures, 'Build', `final status was ${finalStatus.status}`);
        }
        if (finalStatus.result?.systemVerify?.status === 'failed') {
          createPromptFailure(failures, 'Build', 'system verify failed');
        }
        if (history.length === 0) {
          createPromptFailure(failures, 'History', 'no OMX history events were returned');
        }
      }
    }
  } catch (error) {
    failures.push(`Fatal: ${error instanceof Error ? error.message : String(error)}`);
  }

  scenario.pass = failures.length === 0;
  scenario.durationsMs.total = Math.round(performance.now() - startedAt);

  const statusLabel = scenario.pass ? 'PASS' : 'FAIL';
  const buildStatus = scenario.build?.finalStatus ? ` build=${scenario.build.finalStatus}` : '';
  console.log(`  ${statusLabel}${buildStatus} total=${scenario.durationsMs.total}ms`);
  if (failures.length > 0) {
    for (const failure of failures) {
      console.log(`  - ${failure}`);
    }
  }

  return scenario;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = normalizeBaseUrl(String(args['base-url'] || DEFAULT_APP_URL));
  const bridgeUrl = normalizeBridgeUrl(String(args['bridge-url'] || DEFAULT_BRIDGE_URL));
  const model = typeof args.model === 'string' ? args.model : undefined;
  const existingSessionId = typeof args['session-id'] === 'string' ? args['session-id'] : undefined;
  const dryRun = Boolean(args['dry-run']);
  const outputPath = typeof args.output === 'string' ? args.output : undefined;
  const promptTimeoutMs = Number(args['prompt-timeout-ms'] || args.timeout || DEFAULT_PROMPT_TIMEOUT_MS);
  const pollIntervalMs = Number(args['poll-interval-ms'] || DEFAULT_POLL_INTERVAL_MS);

  let prompts = args['prompt-file']
    ? await promptCatalogFromFile(String(args['prompt-file']))
    : DEFAULT_PROMPTS;
  if (existingSessionId) {
    const label = typeof args.label === 'string' ? args.label : `Session ${existingSessionId.slice(0, 8)}`;
    prompts = [{ label, prompt: `Existing Retrobuilder session ${existingSessionId}` }];
  } else if (typeof args.only === 'string') {
    const wanted = new Set(parseCsv(args.only).map((label) => label.toLowerCase()));
    prompts = prompts.filter((prompt) => wanted.has(prompt.label.toLowerCase()));
    if (prompts.length === 0) {
      throw new Error(`No prompts matched --only=${args.only}`);
    }
  }

  if (dryRun) {
    console.log(JSON.stringify({
      version: 1,
      dryRun: true,
      baseUrl,
      bridgeUrl,
      promptCount: prompts.length,
      prompts,
      promptTimeoutMs,
      pollIntervalMs,
      model: model || null,
      existingSessionId: existingSessionId || null,
    }, null, 2));
    return;
  }

  const startedAt = nowIso();
  const appHealthUrl = joinUrl(baseUrl, '/api/health');
  const bridgeHealthUrl = joinUrl(bridgeUrl, '/health');

  console.log(`App: ${baseUrl}`);
  console.log(`Bridge: ${bridgeUrl}`);
  console.log(`Prompts: ${prompts.length}`);

  const appHealth = await checkHealth(appHealthUrl);
  const bridgeHealth = await checkHealth(bridgeHealthUrl);

  if (!appHealth) {
    throw new Error(`Retrobuilder health check failed at ${appHealthUrl}`);
  }
  if (!bridgeHealth) {
    throw new Error(`THE BRIDGE health check failed at ${bridgeHealthUrl}`);
  }

  const scenarios: ScenarioSummary[] = [];
  for (const promptSpec of prompts) {
    scenarios.push(await runScenario(baseUrl, promptSpec, model, promptTimeoutMs, pollIntervalMs, existingSessionId));
  }

  const summary: CampaignSummary = {
    version: 1,
    startedAt,
    endedAt: nowIso(),
    baseUrl,
    bridgeUrl,
    promptCount: prompts.length,
    overallPass: scenarios.every((scenario) => scenario.pass),
    preflight: { appHealth, bridgeHealth },
    scenarios,
  };

  console.log('\n=== JSON SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));

  if (outputPath) {
    await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.log(`Wrote JSON summary to ${outputPath}`);
  }

  if (!summary.overallPass) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
