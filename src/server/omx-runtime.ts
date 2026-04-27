import type { Request, Response } from 'express';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { availableParallelism, homedir, tmpdir } from 'node:os';
import * as path from 'node:path';
import { RETROBUILDER_AGENT_BEHAVIOR_GUIDELINES, RETROBUILDER_FRONTEND_PRODUCT_GUIDELINES } from './agent-behavior-guidelines.js';
import { CLEAN_CODEX_DESIGNER_AGENTS_MD, buildCleanCodexDesignerBrief } from './clean-codex-designer.js';
import { generateOmxBuildDocumentationArtifacts, type OmxBuildDocumentationSummary, type OmxRunnableManifest } from './omx-build-docs.js';
import { getRuntimeDirectory, registerSessionCleanupHook, type SessionDocument } from './session-store.js';
import { buildSpecularDesignGate } from './specular-create/specular-service.js';
import type { SpecularBuildDesignSummary, SpecularReferenceCandidate } from './specular-create/specular-types.js';
import { appendOmxLedgerEvent, OMX_LEDGER_VERSION, readOmxHistoryPayloads } from './omx-ledger.js';
import { runFrontendMobileQualityGate } from './omx-frontend-quality.js';
import { ensureModulePackagingBaseline } from './omx-module-packaging.js';
import { buildOmxRootComposition } from './omx-root-composition.js';
import { compileExecutionGraph, getTaskById, type OmxExecutionGraph, type OmxExecutionTask, type OmxTaskStatus } from './omx-scheduler.js';
import { consolidatePresentationFrontendNodes } from './graph-composition.js';
import { reassignOwnershipForPaths } from './omx-ownership.js';
import {
  cleanupTaskWorkspace,
  collectArtifactManifest,
  materializeTaskScaffold,
  mergeTaskArtifacts,
  prepareTaskWorkspace,
  runVerifyInOverlay,
  type OmxMergeReceipt,
  type OmxVerifyReceipt,
  type OmxWorkerLease,
} from './omx-worker.js';

export type OmxBuildStatus = 'idle' | 'queued' | 'running' | 'succeeded' | 'failed' | 'stopping' | 'stopped';

export interface OmxTransportInfo {
  kind: 'codex-cli';
  command: string;
  available: boolean;
}

interface OmxBuildResultSummary {
  totalFiles: number;
  totalLines: number;
  elapsedMs: number;
  documentation?: OmxBuildDocumentationSummary;
  runnableManifest?: OmxRunnableManifest;
  systemVerify?: {
    status: 'pending' | 'passed' | 'failed' | 'not_available';
    command?: string;
    summary?: string;
  };
}

export interface OmxStatusResponse {
  sessionId: string;
  buildId?: string;
  status: OmxBuildStatus;
  workspacePath?: string;
  transport: OmxTransportInfo;
  source: 'persisted-session' | 'session-draft';
  totalNodes?: number;
  completedNodes?: number;
  buildProgress?: number;
  activeNodeId?: string | null;
  nodeStates?: Record<string, 'dormant' | 'queued' | 'building' | 'complete' | 'error'>;
  result?: OmxBuildResultSummary;
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
  verifyReceipts?: Record<string, OmxVerifyReceipt>;
  mergeReceipts?: Record<string, OmxMergeReceipt>;
  systemVerify?: {
    status: 'pending' | 'passed' | 'failed' | 'not_available';
    command?: string;
    summary?: string;
  };
}

export interface OmxBuildStartResponse extends OmxStatusResponse {
  buildId: string;
  status: 'queued' | 'running' | 'stopping' | 'stopped';
  workspacePath: string;
  streamUrl: string;
  statusUrl: string;
  stopUrl: string;
}

interface OmxPersistedSnapshot extends OmxStatusResponse {
  startedAt?: string;
  updatedAt?: string;
  error?: string;
  stopRequested?: boolean;
  currentNodeId?: string | null;
  executionGraph?: OmxExecutionGraph;
  workerLeases?: Record<string, OmxWorkerLease>;
  verifyReceipts?: Record<string, OmxVerifyReceipt>;
  mergeReceipts?: Record<string, OmxMergeReceipt>;
}

interface OmxBuildRecord {
  sessionId: string;
  buildId: string;
  status: Exclude<OmxBuildStatus, 'idle'>;
  workspacePath: string;
  runtimeDir: string;
  transport: OmxTransportInfo;
  source: 'persisted-session' | 'session-draft';
  emitter: EventEmitter;
  backlog: string[];
  child: ChildProcess | null;
  workerChildren: Record<string, ChildProcess>;
  forceStopTimer: ReturnType<typeof setTimeout> | null;
  stopRequested: boolean;
  disposed: boolean;
  stopCleanupScheduled: boolean;
  currentNodeId: string | null;
  startedAt: string;
  updatedAt: string;
  totalNodes: number;
  completedNodes: number;
  buildProgress: number;
  nodeStates: Record<string, 'dormant' | 'queued' | 'building' | 'complete' | 'error'>;
  designSummary: SpecularBuildDesignSummary;
  executionGraph: OmxExecutionGraph;
  workerLeases: Record<string, OmxWorkerLease>;
  verifyReceipts: Record<string, OmxVerifyReceipt>;
  mergeReceipts: Record<string, OmxMergeReceipt>;
  activeWaveId: string | null;
  activeTaskIds: string[];
  workerCount: number;
  lastWarningSignature: string | null;
  systemVerify: {
    status: 'pending' | 'passed' | 'failed' | 'not_available';
    command?: string;
    summary?: string;
  };
  result?: OmxBuildResultSummary;
  terminalMessage?: string;
  error?: string;
}

interface GraphNode {
  id: string;
  label: string;
  type?: string;
  description?: string;
  priority?: number;
  acceptance_criteria?: string[];
  data_contract?: string;
  error_handling?: string[];
  designProfile?: string;
  referenceCandidates?: SpecularReferenceCandidate[];
  selectedReferenceIds?: string[];
  previewArtifact?: unknown;
  previewState?: unknown;
  designVerdict?: {
    status?: string;
    score?: number;
    findings?: string[];
    evidence?: string[];
  };
}

interface OmxBuildRequest {
  session: SessionDocument;
  source: 'persisted-session' | 'session-draft';
}

interface OmxTaskRetryRequest extends OmxBuildRequest {
  taskId: string;
}

interface OmxTaskReassignRequest extends OmxBuildRequest {
  taskId: string;
}

interface OmxLifecycleOptions {
  reuseWorkspace?: boolean;
  skipCompleted?: boolean;
  resumeRehydrated?: boolean;
}

const builds = new Map<string, OmxBuildRecord>();
const SSE_BACKLOG_LIMIT = 200;
const STATUS_FILE = 'omx-status.json';
const CODEX_COMMAND = 'codex exec --json --skip-git-repo-check --sandbox workspace-write';
const PUBLIC_REDACTED_COMMAND = '[retrobuilder-internal-command]';
let codexAvailabilityPromise: Promise<boolean> | null = null;
let codexAvailabilityCachedAt = 0;
const CODEX_AVAILABILITY_TTL_MS = 5_000;
const DEFAULT_CODEX_TASK_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_CODEX_DESIGNER_TASK_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_CODEX_TASK_HEARTBEAT_MS = 30 * 1000;
const DEFAULT_CODEX_TASK_MODEL = 'gpt-5.4-mini';
const DEFAULT_CODEX_TASK_REASONING_EFFORT = 'low';
const DEFAULT_CODEX_DESIGNER_MODEL = 'gpt-5.4-mini';
const DEFAULT_CODEX_DESIGNER_REASONING_EFFORT = 'high';

registerSessionCleanupHook(async (sessionId) => {
  await cleanupOmxBuildState(sessionId);
});

function buildStatusFile(runtimeDir: string) {
  return path.join(runtimeDir, STATUS_FILE);
}

function getTransport(available: boolean): OmxTransportInfo {
  return {
    kind: 'codex-cli',
    command: CODEX_COMMAND,
    available,
  };
}

function redactTransport(transport?: OmxTransportInfo): OmxTransportInfo {
  if (!transport) {
    return {
      kind: 'codex-cli',
      command: PUBLIC_REDACTED_COMMAND,
      available: false,
    };
  }
  return {
    ...transport,
    command: PUBLIC_REDACTED_COMMAND,
  };
}

function redactVerifyReceipt(receipt: OmxVerifyReceipt): OmxVerifyReceipt {
  return {
    ...receipt,
    command: PUBLIC_REDACTED_COMMAND,
  };
}

function redactVerifyReceipts(receipts?: Record<string, OmxVerifyReceipt>): Record<string, OmxVerifyReceipt> {
  if (!receipts) return {};
  return Object.fromEntries(
    Object.entries(receipts).map(([taskId, receipt]) => [taskId, redactVerifyReceipt(receipt)]),
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function redactPublicOmxPayload<TPayload extends Record<string, unknown>>(payload: TPayload): TPayload {
  const redacted: Record<string, unknown> = { ...payload };
  if (isPlainRecord(redacted.transport)) {
    redacted.transport = redactTransport(redacted.transport as unknown as OmxTransportInfo);
  }
  if (isPlainRecord(redacted.verifyReceipts)) {
    redacted.verifyReceipts = redactVerifyReceipts(redacted.verifyReceipts as Record<string, OmxVerifyReceipt>);
  }
  if (typeof redacted.command === 'string' && typeof redacted.type === 'string' && redacted.type.startsWith('verify_')) {
    redacted.command = PUBLIC_REDACTED_COMMAND;
  }
  if (Array.isArray(redacted.tasks)) {
    redacted.tasks = redacted.tasks.map((task) => (
      isPlainRecord(task) && typeof task.verifyCommand === 'string'
        ? { ...task, verifyCommand: PUBLIC_REDACTED_COMMAND }
        : task
    ));
  }
  return redacted as TPayload;
}

function resetCodexAvailabilityCache() {
  codexAvailabilityPromise = null;
  codexAvailabilityCachedAt = 0;
}

function clearForcedStopTimer(build: OmxBuildRecord) {
  if (build.forceStopTimer) {
    clearTimeout(build.forceStopTimer);
    build.forceStopTimer = null;
  }
}

function hasActiveChildren(build: OmxBuildRecord) {
  return Object.keys(build.workerChildren).length > 0;
}

function scheduleForcedStop(build: OmxBuildRecord) {
  clearForcedStopTimer(build);
  build.forceStopTimer = setTimeout(() => {
    if (build.child && !build.child.killed) {
      terminateProcessTree(build.child, 'SIGKILL');
    }
    for (const child of Object.values(build.workerChildren)) {
      if (!child.killed) {
        terminateProcessTree(child, 'SIGKILL');
      }
    }
    build.forceStopTimer = null;
  }, 2_000);
}

function scheduleStoppedBuildCleanup(build: OmxBuildRecord, delayMs = 1_500) {
  if (build.stopCleanupScheduled) return;
  build.stopCleanupScheduled = true;
  setTimeout(() => {
    if (builds.get(build.sessionId)?.buildId === build.buildId) {
      cleanupCompletedBuild(build);
    }
  }, delayMs);
}

function nowIso() {
  return new Date().toISOString();
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

function sanitizeSegment(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'module';
}

function toRelative(workspacePath: string, filePath: string) {
  return path.relative(workspacePath, filePath) || path.basename(filePath);
}

function serializeSse(payload: object, eventName?: string) {
  const eventPrefix = eventName ? `event: ${eventName}\n` : '';
  return `${eventPrefix}data: ${JSON.stringify(payload)}\n\n`;
}

function buildTerminalStatus(build: OmxBuildRecord): 'succeeded' | 'failed' | 'stopped' {
  if (build.stopRequested || build.status === 'stopping' || build.status === 'stopped') {
    return 'stopped';
  }
  if (build.error) {
    return 'failed';
  }
  return 'succeeded';
}

function resolveWorkerCount(taskCount: number) {
  const envValue = Number(process.env.OMX_WORKER_COUNT || '');
  if (Number.isFinite(envValue) && envValue >= 1) {
    return Math.max(1, Math.min(4, Math.floor(envValue), Math.max(taskCount, 1)));
  }
  const cpuBudget = Math.max(1, availableParallelism() - 1);
  return Math.max(1, Math.min(4, cpuBudget, Math.max(taskCount, 1)));
}

function recalculateBuildSummary(build: OmxBuildRecord) {
  build.totalNodes = build.executionGraph.tasks.length;
  build.completedNodes = build.executionGraph.tasks.filter((task) => task.status === 'merged').length;
  build.buildProgress = Math.round((build.completedNodes / Math.max(build.totalNodes, 1)) * 100);
}

function summarizeExecutionGraph(build: OmxBuildRecord, options?: { public?: boolean }) {
  const wavesTotal = build.executionGraph.waves.length;
  const wavesCompleted = build.executionGraph.waves.filter((wave) => wave.status === 'merged').length;
  const verifyPendingCount = build.executionGraph.tasks.filter(
    (task) => !['verified', 'merged', 'failed'].includes(task.status),
  ).length;
  const mergePendingCount = build.executionGraph.tasks.filter((task) => task.status === 'verified').length;
  return {
    wavesTotal,
    wavesCompleted,
    activeWaveId: build.activeWaveId,
    activeTasks: build.activeTaskIds,
    workerCount: build.workerCount,
    verifyPendingCount,
    mergePendingCount,
    ledgerVersion: OMX_LEDGER_VERSION,
    verifyReceipts: options?.public ? redactVerifyReceipts(build.verifyReceipts) : build.verifyReceipts,
    mergeReceipts: build.mergeReceipts,
  };
}

async function persistBuildSnapshot(build: OmxBuildRecord) {
  if (build.disposed) return;
  const stillActive = builds.get(build.sessionId);
  if (!stillActive || stillActive.buildId !== build.buildId) return;

  await mkdir(build.runtimeDir, { recursive: true }).catch(() => {});
  recalculateBuildSummary(build);
  const summary = summarizeExecutionGraph(build);
  const snapshot: OmxPersistedSnapshot = {
    sessionId: build.sessionId,
    buildId: build.buildId,
    status: build.status,
    workspacePath: build.workspacePath,
    transport: build.transport,
    source: build.source,
    startedAt: build.startedAt,
    updatedAt: build.updatedAt,
    error: build.error,
    stopRequested: build.stopRequested,
    currentNodeId: build.currentNodeId,
    totalNodes: build.totalNodes,
    completedNodes: build.completedNodes,
    buildProgress: build.buildProgress,
    activeNodeId: build.currentNodeId,
    nodeStates: build.nodeStates,
    designProfile: build.designSummary.designProfile,
    designGateStatus: build.designSummary.designGateStatus,
    designScore: build.designSummary.designScore,
    designFindings: build.designSummary.designFindings,
    designEvidence: build.designSummary.designEvidence,
    result: build.result,
    terminalMessage: build.terminalMessage,
    executionGraph: build.executionGraph,
    workerLeases: build.workerLeases,
    verifyReceipts: build.verifyReceipts,
    mergeReceipts: build.mergeReceipts,
    systemVerify: build.systemVerify,
    ...summary,
  };
  await writeFile(buildStatusFile(build.runtimeDir), JSON.stringify(snapshot, null, 2), 'utf8');
}

function categoryForType(type: unknown) {
  switch (type) {
    case 'build_start':
    case 'build_complete':
    case 'build_terminal':
    case 'build_compiled':
    case 'resume_rehydrated':
      return 'build' as const;
    case 'wave_started':
      return 'wave' as const;
    case 'task_leased':
    case 'task_completed':
    case 'node_start':
    case 'node_progress':
    case 'node_complete':
    case 'node_error':
    case 'edge_activated':
      return 'task' as const;
    case 'worker_started':
    case 'worker_log':
    case 'worker_fallback':
    case 'warning':
    case 'artifact_progress':
      return 'worker' as const;
    case 'verify_started':
    case 'verify_passed':
    case 'verify_failed':
      return 'verify' as const;
    case 'merge_started':
    case 'merge_passed':
    case 'merge_rejected':
      return 'merge' as const;
    case 'operational_message':
      return 'chat' as const;
    default:
      return 'system' as const;
  }
}

function emitToSubscribers(build: OmxBuildRecord, payload: object, eventName?: string) {
  if (build.disposed) return;
  const frame = serializeSse(payload, eventName);
  build.backlog.push(frame);
  if (build.backlog.length > SSE_BACKLOG_LIMIT) {
    build.backlog.splice(0, build.backlog.length - SSE_BACKLOG_LIMIT);
  }
  build.emitter.emit('frame', frame);
}

function emitBuildEvent(build: OmxBuildRecord, payload: Record<string, unknown>, eventName?: string) {
  if (build.disposed) return;
  build.updatedAt = nowIso();
  const enrichedPayload = {
    sessionId: build.sessionId,
    buildId: build.buildId,
    source: build.source,
    ...payload,
  };
  emitToSubscribers(build, redactPublicOmxPayload(enrichedPayload), eventName);
  void appendOmxLedgerEvent(build.runtimeDir, categoryForType(payload.type), String(payload.type || eventName || 'event'), enrichedPayload)
    .catch((error) => console.warn('[OMX] Failed to append ledger event:', error));
  void persistBuildSnapshot(build).catch((error) => {
    console.warn('[OMX] Failed to persist build snapshot:', error);
  });
}

async function detectCodexAvailability(): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const child = spawn('codex', ['--version'], {
      stdio: ['ignore', 'ignore', 'ignore'],
      env: { ...process.env },
    });

    child.once('error', () => resolve(false));
    child.once('exit', (code) => resolve(code === 0));
  });
}

async function codexAvailable(options?: { fresh?: boolean }) {
  if (options?.fresh) {
    resetCodexAvailabilityCache();
    return detectCodexAvailability();
  }

  const now = Date.now();
  if (!codexAvailabilityPromise || now - codexAvailabilityCachedAt > CODEX_AVAILABILITY_TTL_MS) {
    codexAvailabilityCachedAt = now;
    codexAvailabilityPromise = detectCodexAvailability();
  }
  return codexAvailabilityPromise;
}

function buildInactiveCodexMessage() {
  return 'Codex CLI is unavailable. OMX real builds require native Codex transport before execution can start.';
}

function normalizeSessionForOmx(session: SessionDocument): SessionDocument {
  const graph = consolidatePresentationFrontendNodes(session.graph);
  if (graph === session.graph) return session;
  return {
    ...session,
    graph,
  };
}

function codexTaskTimeoutMs(node?: GraphNode) {
  if (isFrontendGraphNode(node)) {
    const configuredDesigner = Number(
      process.env.CODEX_DESIGNER_TASK_TIMEOUT_MS
        || process.env.RETROBUILDER_CODEX_DESIGNER_TASK_TIMEOUT_MS
        || '',
    );
    if (Number.isFinite(configuredDesigner) && configuredDesigner > 0) {
      return configuredDesigner;
    }
    const configuredShared = Number(process.env.OMX_CODEX_TASK_TIMEOUT_MS || '');
    if (Number.isFinite(configuredShared) && configuredShared > 0) {
      return Math.max(configuredShared, DEFAULT_CODEX_DESIGNER_TASK_TIMEOUT_MS);
    }
    return DEFAULT_CODEX_DESIGNER_TASK_TIMEOUT_MS;
  }
  const configured = Number(process.env.OMX_CODEX_TASK_TIMEOUT_MS || '');
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_CODEX_TASK_TIMEOUT_MS;
}

function codexTaskHeartbeatMs() {
  const configured = Number(
    process.env.OMX_CODEX_TASK_HEARTBEAT_MS
      || process.env.RETROBUILDER_CODEX_TASK_HEARTBEAT_MS
      || '',
  );
  return Number.isFinite(configured) && configured > 0
    ? Math.max(5_000, configured)
    : DEFAULT_CODEX_TASK_HEARTBEAT_MS;
}

function isFrontendGraphNode(node?: Pick<GraphNode, 'type'>) {
  return (node?.type || '').toLowerCase() === 'frontend';
}

function codexTaskModel(node?: GraphNode) {
  if (isFrontendGraphNode(node)) {
    return process.env.CODEX_DESIGNER_MODEL?.trim()
      || process.env.RETROBUILDER_CODEX_DESIGNER_MODEL?.trim()
      || DEFAULT_CODEX_DESIGNER_MODEL;
  }
  return process.env.OMX_CODEX_MODEL?.trim() || DEFAULT_CODEX_TASK_MODEL;
}

function codexTaskReasoningEffort(node?: GraphNode) {
  if (isFrontendGraphNode(node)) {
    return process.env.CODEX_DESIGNER_REASONING_EFFORT?.trim()
      || process.env.RETROBUILDER_CODEX_DESIGNER_REASONING_EFFORT?.trim()
      || DEFAULT_CODEX_DESIGNER_REASONING_EFFORT;
  }
  return process.env.OMX_CODEX_REASONING_EFFORT?.trim() || DEFAULT_CODEX_TASK_REASONING_EFFORT;
}

function isOmxEnvironmentKey(key: string) {
  return key === 'USE_OMX_EXPLORE_CMD' || key.startsWith('OMX_') || key.includes('_OMX_');
}

function isSensitiveWorkerEnvironmentKey(key: string) {
  if (key === 'CODEX_HOME') return false;
  return /(^|_)(API_?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|PRIVATE_?KEY|ACCESS_?KEY)(_|$)/i.test(key);
}

function stripSensitiveWorkerEnv(env: NodeJS.ProcessEnv) {
  if (process.env.RETROBUILDER_PASS_WORKER_SECRETS === '1') {
    return env;
  }
  for (const key of Object.keys(env)) {
    if (isSensitiveWorkerEnvironmentKey(key)) {
      delete env[key];
    }
  }
  return env;
}

function codexWorkerEnv(node?: GraphNode, cleanCodexHome?: string) {
  const env = { ...process.env };
  if (isFrontendGraphNode(node)) {
    for (const key of Object.keys(env)) {
      if (isOmxEnvironmentKey(key)) {
        delete env[key];
      }
    }

    if (cleanCodexHome) {
      env.CODEX_HOME = cleanCodexHome;
    } else if (process.env.CODEX_DESIGNER_HOME) {
      env.CODEX_HOME = process.env.CODEX_DESIGNER_HOME;
    } else {
      delete env.CODEX_HOME;
    }
    return stripSensitiveWorkerEnv(env);
  }
  if (process.env.OMX_CODEX_HOME) {
    env.CODEX_HOME = process.env.OMX_CODEX_HOME;
  }
  return stripSensitiveWorkerEnv(env);
}

async function prepareCleanDesignerCodexHome(lease: OmxWorkerLease) {
  if (process.env.CODEX_DESIGNER_HOME?.trim()) {
    return process.env.CODEX_DESIGNER_HOME.trim();
  }

  const sourceHome = process.env.CODEX_HOME?.trim() || path.join(homedir(), '.codex');
  const cleanHome = path.join(lease.taskRuntimeDir, 'codex-home');
  await rm(cleanHome, { force: true, recursive: true }).catch(() => {});
  await mkdir(cleanHome, { recursive: true });

  for (const fileName of ['auth.json', 'installation_id', 'version.json', 'models_cache.json']) {
    const sourcePath = path.join(sourceHome, fileName);
    if (existsSync(sourcePath)) {
      await copyFile(sourcePath, path.join(cleanHome, fileName)).catch(() => {});
    }
  }

  return cleanHome;
}

async function prepareCleanDesignerWorkerSurface(lease: OmxWorkerLease) {
  await rm(path.join(lease.overlayPath, '.omx'), { force: true, recursive: true }).catch(() => {});
  await rm(path.join(lease.overlayPath, '.codex'), { force: true, recursive: true }).catch(() => {});
  await writeFile(path.join(lease.overlayPath, 'AGENTS.md'), CLEAN_CODEX_DESIGNER_AGENTS_MD, 'utf8');
  return prepareCleanDesignerCodexHome(lease);
}

function cleanDesignerRuntimeRoot(build: Pick<OmxBuildRecord, 'sessionId' | 'buildId'>) {
  return path.join(tmpdir(), 'retrobuilder-clean-codex-designer', sanitizeSegment(build.sessionId), sanitizeSegment(build.buildId), 'workers');
}

function terminateProcessTree(child: ChildProcess, signal: NodeJS.Signals) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

function isCodexTimeoutError(error: unknown) {
  return error instanceof Error && /Codex task .+ timed out after \d+ms\./.test(error.message);
}

function createDesignGateBlockedError(designSummary: SpecularBuildDesignSummary) {
  const error = new Error(`21st design gate blocked OMX build. ${designSummary.designFindings[0] || 'Resolve SPECULAR CREATE findings before building.'}`) as Error & {
    designSummary?: SpecularBuildDesignSummary;
  };
  error.designSummary = designSummary;
  return error;
}

async function persistDesignGateBlockedStatus(sessionId: string, designSummary: SpecularBuildDesignSummary) {
  const runtimeDir = getRuntimeDirectory(sessionId);
  await mkdir(runtimeDir, { recursive: true }).catch(() => {});
  const terminalMessage = `BUILD BLOCKED — ${designSummary.designFindings[0] || 'Resolve SPECULAR CREATE findings before building.'}`;
  const snapshot: OmxPersistedSnapshot = {
    sessionId,
    status: 'failed',
    transport: getTransport(await codexAvailable()),
    source: 'persisted-session',
    designProfile: designSummary.designProfile,
    designGateStatus: designSummary.designGateStatus,
    designScore: designSummary.designScore,
    designFindings: designSummary.designFindings,
    designEvidence: designSummary.designEvidence,
    terminalMessage,
    ledgerVersion: OMX_LEDGER_VERSION,
  };
  await writeFile(buildStatusFile(runtimeDir), JSON.stringify(snapshot, null, 2), 'utf8');
  await appendOmxLedgerEvent(runtimeDir, 'build', 'build_terminal', {
    type: 'build_terminal',
    sessionId,
    status: 'failed',
    message: terminalMessage,
    designProfile: designSummary.designProfile,
    designGateStatus: designSummary.designGateStatus,
    designScore: designSummary.designScore,
    designFindings: designSummary.designFindings,
    designEvidence: designSummary.designEvidence,
    failingNodeIds: designSummary.failingNodeIds,
  });
}

async function ensureWorkspaceFiles(session: SessionDocument, build: OmxBuildRecord, options?: { reuseWorkspace?: boolean }) {
  if (!options?.reuseWorkspace) {
    await rm(build.workspacePath, { force: true, recursive: true }).catch(() => {});
  }
  await mkdir(build.runtimeDir, { recursive: true });
  await mkdir(build.workspacePath, { recursive: true });
  await mkdir(path.join(build.workspacePath, 'modules'), { recursive: true });
  await mkdir(path.join(build.workspacePath, '.omx'), { recursive: true });

  const blueprintPath = path.join(build.workspacePath, '.omx', 'session.blueprint.json');
  const manifestoPath = path.join(build.workspacePath, '.omx', 'manifesto.md');
  const architecturePath = path.join(build.workspacePath, '.omx', 'architecture.md');
  const promptPath = path.join(build.workspacePath, '.omx', 'codex.prompt.md');
  const readmePath = path.join(build.workspacePath, 'README.md');

  await writeFile(blueprintPath, JSON.stringify(session, null, 2), 'utf8');
  await writeFile(manifestoPath, session.manifesto || '# Manifesto\n\nNo manifesto provided.\n', 'utf8');
  await writeFile(architecturePath, session.architecture || '# Architecture\n\nNo architecture provided.\n', 'utf8');
  await writeFile(
    readmePath,
    `# OMX Workspace\n\nSession: ${session.name}\n\nBuild ID: ${build.buildId}\n\nThis workspace is materialized under RETROBUILDER runtime state and prepared for Codex CLI execution.\n`,
    'utf8',
  );

  await writeFile(promptPath, buildCodexPrompt(session), 'utf8');

  const rootCompositionFiles = buildOmxRootComposition(session);
  for (const file of rootCompositionFiles) {
    const targetPath = path.join(build.workspacePath, file.path);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, file.content, 'utf8');
  }

  return {
    blueprintPath,
    manifestoPath,
    architecturePath,
    promptPath,
    readmePath,
    rootCompositionFiles,
  };
}

function buildCodexPrompt(session: SessionDocument) {
  const compositionGraph = consolidatePresentationFrontendNodes(session.graph);
  const nodeSummary = compositionGraph.nodes
    .map((node, index) => {
      const acceptance = node.acceptance_criteria?.map((entry) => `    - ${entry}`).join('\n') || '    - none';
      const errorHandling = node.error_handling?.map((entry) => `    - ${entry}`).join('\n') || '    - none';
      return [
        `${index + 1}. ${node.label} (${node.type || 'module'})`,
        `   id: ${node.id}`,
        `   description: ${node.description || 'No description provided.'}`,
        `   data contract: ${node.data_contract || 'No data contract provided.'}`,
        '   acceptance criteria:',
        acceptance,
        '   error handling:',
        errorHandling,
      ].join('\n');
    })
    .join('\n\n');

  return [
    '# OMX Codex Materialization Prompt',
    '',
    'You are materializing a RETROBUILDER blueprint into the current workspace.',
    'Rules:',
    RETROBUILDER_AGENT_BEHAVIOR_GUIDELINES,
    RETROBUILDER_FRONTEND_PRODUCT_GUIDELINES,
    '- Keep all work inside this workspace.',
    '- Read .omx/session.blueprint.json before editing.',
    '- Materialize files under modules/<slug>/ for each deployable construction node.',
    '- If the source blueprint contains frontend page sections, keep them inside one cohesive app module instead of creating per-section module folders.',
    '- Prefer small, inspectable scaffolds over giant speculative implementations.',
    '- Update README or per-module notes when you create artifacts.',
    '- Preserve explicit acceptance criteria and data contracts in the generated files.',
    '',
    'Manifesto:',
    session.manifesto || 'No manifesto provided.',
    '',
    'Architecture:',
    session.architecture || 'No architecture provided.',
    '',
    'Nodes:',
    nodeSummary || 'No nodes provided.',
    '',
    'Deliverable:',
    '- Create or update module folders with concrete scaffold artifacts aligned to the blueprint.',
    '- Keep a concise note of what was materialized.',
  ].join('\n');
}

async function readFileStats(targetPath: string): Promise<Array<{ path: string; kind: 'file' | 'dir' }>> {
  const { readdir, stat } = await import('node:fs/promises');
  const entries = await readdir(targetPath, { withFileTypes: true }).catch(() => []);
  const resolved: Array<{ path: string; kind: 'file' | 'dir' }> = [];
  for (const entry of entries) {
    const filePath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      resolved.push({ path: filePath, kind: 'dir' });
    } else if (entry.isFile()) {
      resolved.push({ path: filePath, kind: 'file' });
    } else {
      const stats = await stat(filePath).catch(() => null);
      if (stats?.isDirectory()) resolved.push({ path: filePath, kind: 'dir' });
      if (stats?.isFile()) resolved.push({ path: filePath, kind: 'file' });
    }
  }
  return resolved;
}

async function collectFileFingerprints(targetPath: string) {
  const queue = [targetPath];
  const fingerprints: Record<string, string> = {};

  while (queue.length > 0) {
    const current = queue.shift()!;
    const entries = await readFileStats(current);
    for (const entry of entries) {
      if (entry.kind === 'dir') {
        if (path.basename(entry.path) !== 'node_modules') {
          queue.push(entry.path);
        }
        continue;
      }

      const relativePath = path.relative(targetPath, entry.path).replaceAll(path.sep, '/');
      const content = await readFile(entry.path).catch(() => Buffer.from(''));
      fingerprints[relativePath] = createHash('sha256').update(content).digest('hex');
    }
  }

  return fingerprints;
}

function changedFingerprintPaths(before: Record<string, string>, after: Record<string, string>) {
  const changed = new Set<string>();
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[key] !== after[key]) {
      changed.add(key);
    }
  }
  return [...changed].sort();
}

async function countWorkspaceArtifacts(targetPath: string) {
  const queue = [targetPath];
  let totalFiles = 0;
  let totalLines = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const entries = await readFileStats(current);
    for (const entry of entries) {
      if (entry.kind === 'dir') {
        queue.push(entry.path);
      } else {
        totalFiles += 1;
        const content = await readFile(entry.path, 'utf8').catch(() => '');
        totalLines += content.length > 0 ? content.split(/\r?\n/).length : 0;
      }
    }
  }

  return { totalFiles, totalLines };
}

async function reserveFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('No free port available')));
        return;
      }
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function pathReadable(targetPath: string) {
  try {
    await readFile(targetPath, 'utf8');
    return true;
  } catch {
    return false;
  }
}

async function hasWorkspaceHealthRoute(buildWorkspacePath: string) {
  const candidates = [
    path.join(buildWorkspacePath, 'app', 'api', 'health', 'route.ts'),
    path.join(buildWorkspacePath, 'app', 'api', 'health', 'route.js'),
  ];

  try {
    const modulesDir = path.join(buildWorkspacePath, 'modules');
    const moduleEntries = await readFile(path.join(modulesDir, '.nonexistent'), 'utf8').catch(() => null);
    void moduleEntries;
  } catch {}

  const moduleNames = await (async () => {
    const { readdir } = await import('node:fs/promises');
    return await readdir(path.join(buildWorkspacePath, 'modules')).catch(() => []);
  })();

  for (const moduleName of moduleNames) {
    candidates.push(
      path.join(buildWorkspacePath, 'modules', moduleName, 'app', 'api', 'health', 'route.ts'),
      path.join(buildWorkspacePath, 'modules', moduleName, 'app', 'api', 'health', 'route.js'),
    );
  }

  for (const candidate of candidates) {
    if (await pathReadable(candidate)) {
      return true;
    }
  }
  return false;
}

async function runRootScript(
  buildWorkspacePath: string,
  _display: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn('npm', args, {
      cwd: buildWorkspacePath,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function runRuntimeSmoke(buildWorkspacePath: string): Promise<{ passed: boolean; summary: string }> {
  const port = await reserveFreePort();
  const child = spawn('npm', ['run', 'start'], {
    cwd: buildWorkspacePath,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
  child.stderr?.on('data', (chunk) => { stderr += chunk.toString('utf8'); });

  try {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        return {
          passed: false,
          summary: stderr.trim() || stdout.trim() || `Runtime smoke failed before server became healthy on port ${port}.`,
        };
      }

      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          const body = await response.text().catch(() => '');
          return {
            passed: true,
            summary: body.trim() || `Runtime smoke passed on http://127.0.0.1:${port}/api/health`,
          };
        }
      } catch {
        // continue polling
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return {
      passed: false,
      summary: stderr.trim() || stdout.trim() || `Runtime smoke timed out waiting for /api/health on port ${port}.`,
    };
  } finally {
    child.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 1000);
    });
  }
}

async function resolveSystemVerify(buildWorkspacePath: string): Promise<{
  status: 'passed' | 'failed' | 'not_available';
  command?: string;
  summary: string;
}> {
  const rootPackagePath = path.join(buildWorkspacePath, 'package.json');
  try {
    const parsed = JSON.parse(await readFile(rootPackagePath, 'utf8'));
    const scripts = parsed?.scripts || {};
    const commands = [
      scripts.verify
        ? { command: 'npm', args: ['run', 'verify'], display: 'npm run verify' }
        : scripts.test
          ? { command: 'npm', args: ['run', 'test'], display: 'npm run test' }
          : null,
      scripts.build ? { command: 'npm', args: ['run', 'build'], display: 'npm run build' } : null,
    ].filter(Boolean) as Array<{ command: string; args: string[]; display: string }>;

    if (commands.length === 0) {
      return {
        status: 'not_available',
        summary: 'No root verify/test/build script available for final system verification.',
      };
    }

    const hasGeneratedRootSmoke = Boolean(scripts.smoke);
    const stepSummaries: string[] = [];

    for (const command of commands) {
      const result = await runRootScript(buildWorkspacePath, command.display, command.args);
      const successSummary = result.stdout.trim() || result.stderr.trim() || `${command.display} passed.`;

      if (result.code !== 0) {
        return {
          status: 'failed',
          command: command.display,
          summary: result.stderr.trim() || result.stdout.trim() || `Final system verify failed via ${command.display}.`,
        };
      }

      stepSummaries.push(`${command.display}: ${successSummary}`);
    }

    const gateSummary = stepSummaries.join('\n');
    const ranBuild = commands.some((command) => command.display === 'npm run build');
    const primaryCommand = commands[commands.length - 1]?.display || commands[0]?.display;

    if (hasGeneratedRootSmoke) {
      const smokeResult = await runRootScript(buildWorkspacePath, 'npm run smoke', ['run', 'smoke']);

      if (smokeResult.code !== 0) {
        return {
          status: 'failed',
          command: 'npm run smoke',
          summary: smokeResult.stderr.trim() || smokeResult.stdout.trim() || 'Root smoke script failed.',
        };
      }

      return {
        status: 'passed',
        command: 'npm run smoke',
        summary: [gateSummary, `npm run smoke: ${smokeResult.stdout.trim() || 'Root smoke passed.'}`]
          .filter(Boolean)
          .join('\n'),
      };
    }

    if (commands[0]?.display === 'npm run verify' && !ranBuild) {
      return {
        status: 'not_available',
        command: commands[0].display,
        summary: [
          gateSummary || 'Workspace module verify passed.',
          'Runtime smoke unavailable: no generated root smoke wrapper or runtime health route was found.',
        ].join('\n'),
      };
    }

    const shouldRunRuntimeSmoke = !hasGeneratedRootSmoke
      && Boolean(scripts.start)
      && await hasWorkspaceHealthRoute(buildWorkspacePath);

    if (shouldRunRuntimeSmoke) {
      const runtimeSmoke = await runRuntimeSmoke(buildWorkspacePath);
      if (!runtimeSmoke.passed) {
        return {
          status: 'failed',
          command: 'npm run start',
          summary: runtimeSmoke.summary,
        };
      }
      return {
        status: 'passed',
        command: primaryCommand,
        summary: [gateSummary, `Runtime smoke: ${runtimeSmoke.summary}`].filter(Boolean).join('\n'),
      };
    }
  } catch {
    return {
      status: 'not_available',
      summary: 'No root package.json available for final system verification.',
    };
  }

  return {
    status: 'not_available',
    summary: 'Final system verify unavailable.',
  };
}

async function runCodexForTask(
  build: OmxBuildRecord,
  lease: OmxWorkerLease,
  task: OmxExecutionTask,
  node: GraphNode,
  moduleDir: string,
) {
  if (build.stopRequested) return;
  if (!build.transport.available) {
    throw new Error(buildInactiveCodexMessage());
  }

  const isFrontend = isFrontendGraphNode(node);
  const designContext = buildCleanCodexDesignerBrief(node as GraphNode & {
    referenceCandidates?: SpecularReferenceCandidate[];
    selectedReferenceIds?: string[];
  });
  const prompt = (
    isFrontend
      ? [
        `You are a clean Codex product designer-builder for exactly one frontend module: "${node.label}".`,
        'Do not call m1nd, do not read external skills, and do not do broad repository discovery; this overlay is already scoped to the task.',
        'Use only the module files, local AGENTS.md, and task details below. Do not rely on orchestration workspace files or project-level prompt packs.',
        'Finish with a small shippable product surface, not an analysis report. Prefer direct file writes over exploration.',
        'Work like a bounded design patch: first edit the renderable source, then adjust tests only if required, then run the module verify command.',
        'Do not launch dev servers, browsers, screenshots, long repo-wide commands, package installs, or cross-project discovery from this clean lane.',
        'Budget your work for roughly 90 seconds. If you cannot improve the visible product surface quickly, exit cleanly and let the deterministic baseline stand.',
        `Only modify files inside ${modulePrefix(task)} and keep every edit within your lease.`,
        `Write set: ${task.writeSet.join(', ')}`,
        `Required artifacts inside ${modulePrefix(task)}: module.spec.json, README.md, package.json, a runnable module entrypoint, and at least one passing test file wired into scripts/verify.cjs.`,
        'Keep the scaffold src/index.js + src/index.test.js if you stay on the fallback shape; if you replace them, update scripts/verify.cjs and package scripts so the final files still verify.',
        RETROBUILDER_FRONTEND_PRODUCT_GUIDELINES,
        'Create a polished mobile-first product surface, not a generic placeholder. The UI can stay module-local, but it must feel like the actual user-facing product for the requested business, with strong hierarchy, deliberate typography, responsive spacing, meaningful states, and domain-specific copy.',
        'Frontend modules should export renderApp(input) returning a complete HTML document for the root runtime. renderPortal(input) or createService().render(input) are accepted compatibility fallbacks, but renderApp is the preferred final product entrypoint.',
        'Never render raw JSON, module specs, data contracts, acceptance criteria, generated-by labels, worker/debug language, or implementation notes as the visible customer UI.',
        'Frontend renderable source must include product action primitives that the quality gate can detect: literal <button>, <a href>, <form>, onClick/onclick/addEventListener, or document.createElement("button"/"a"/"form") tied to a domain action. Passive dashboards with only cards, labels, or lists are not enough.',
        'Frontend modules must pass the Retrobuilder mobile overflow quality gate: a 390px viewport must not horizontally scroll or clip headline, chips, card content, or JSON/payload-like text. Use overflow-wrap/word-break/break-words, min-width:0, max-width:100%/width:100%, flex-wrap, and a long-content render test.',
        'The clean designer brief below is the visual authority. Use it as first-class inspiration and do not fall back to generated scaffold aesthetics.',
        designContext,
      ]
      : [
        `You are a fast Retrobuilder build worker for exactly one module: "${node.label}".`,
        'Do not call m1nd, do not read external skills, and do not do broad repository discovery; this overlay is already scoped to the task.',
        'Use only .omx/session.blueprint.json, .omx/architecture.md, the existing module files, and the task details below.',
        'Finish with a small shippable module, not an analysis report. Prefer direct file writes over exploration.',
        `Only modify files inside ${modulePrefix(task)} and keep every edit within your lease.`,
        `Read set: ${task.readSet.join(', ') || '.omx/**'}`,
        `Write set: ${task.writeSet.join(', ')}`,
        `Required artifacts inside ${modulePrefix(task)}: module.spec.json, README.md, package.json, a runnable module entrypoint, and at least one passing test file wired into scripts/verify.cjs.`,
        'Keep the scaffold src/index.js + src/index.test.js if you stay on the fallback shape; if you replace them, update scripts/verify.cjs and package scripts so the final files still verify.',
        'Use dependency-free CommonJS for backend/security/database/integration modules unless an existing package says otherwise.',
        RETROBUILDER_AGENT_BEHAVIOR_GUIDELINES,
      ]
  ).concat([
    `Respect this description: ${node.description || 'No description provided.'}`,
    `Respect this data contract: ${node.data_contract || 'No data contract provided.'}`,
    `Acceptance criteria: ${(node.acceptance_criteria || []).join(' | ') || 'none'}`,
    `Error handling: ${(node.error_handling || []).join(' | ') || 'none'}`,
    `Verify command policy: ${task.verifyCommand}`,
    'Your last action must be a real local verify against the final filesystem state. If you edit files after verifying, rerun verify before stopping.',
    'Do not ask questions; do not touch paths outside the lease.',
  ]).join('\n');

  const cleanCodexHome = isFrontend ? await prepareCleanDesignerWorkerSurface(lease) : undefined;

  await new Promise<void>((resolve, reject) => {
    const codexArgs = [
      'exec',
      '--json',
      '--skip-git-repo-check',
      '--full-auto',
      '--sandbox',
      'workspace-write',
      '-m',
      codexTaskModel(node),
      '-c',
      `model_reasoning_effort="${codexTaskReasoningEffort(node)}"`,
      '-C',
      lease.overlayPath,
      prompt,
    ];
    const child = spawn(
      'codex',
      codexArgs,
      {
        cwd: lease.overlayPath,
        detached: true,
        env: codexWorkerEnv(node, cleanCodexHome),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    build.child = child;
    build.workerChildren[lease.workerId] = child;
    build.lastWarningSignature = null;
    let stderrBuffer = '';
    let timedOut = false;
    let settled = false;
    let forceKillTimer: NodeJS.Timeout | null = null;
    const timeoutMs = codexTaskTimeoutMs(node);
    const heartbeatMs = codexTaskHeartbeatMs();
    const startedAt = Date.now();
    let lastOutputAt = startedAt;
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      emitBuildEvent(build, {
        type: 'warning',
        workerId: lease.workerId,
        taskId: task.taskId,
        nodeId: task.nodeId,
        message: `Codex task exceeded ${formatDuration(timeoutMs)} safety ceiling; terminating worker process group.`,
      });
      terminateProcessTree(child, 'SIGTERM');
      forceKillTimer = setTimeout(() => terminateProcessTree(child, 'SIGKILL'), 5_000);
    }, timeoutMs);
    const heartbeatTimer = setInterval(() => {
      if (settled || build.stopRequested) return;
      lease.heartbeatAt = nowIso();
      const elapsedMs = Date.now() - startedAt;
      const silentMs = Date.now() - lastOutputAt;
      emitBuildEvent(build, {
        type: 'worker_log',
        workerId: lease.workerId,
        taskId: task.taskId,
        nodeId: task.nodeId,
        level: 'info',
        message: `Codex still running — ${formatDuration(elapsedMs)} elapsed, ${formatDuration(Math.max(timeoutMs - elapsedMs, 0))} before safety ceiling${silentMs >= heartbeatMs ? `, ${formatDuration(silentMs)} since last output` : ''}.`,
      });
    }, heartbeatMs);

    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearInterval(heartbeatTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      delete build.workerChildren[lease.workerId];
      build.child = null;
      finish();
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      lastOutputAt = Date.now();
      const text = chunk.toString('utf8').trim();
      if (!text) return;
      emitBuildEvent(build, {
        type: 'worker_log',
        workerId: lease.workerId,
        taskId: task.taskId,
        nodeId: task.nodeId,
        level: 'info',
        message: text.slice(0, 240),
      });
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      lastOutputAt = Date.now();
      const text = chunk.toString('utf8');
      stderrBuffer += text;
      if (!text.trim()) return;
      const warningSignature = `${task.taskId}:${text.trim().slice(0, 160)}`;
      if (build.lastWarningSignature === warningSignature) {
        return;
      }
      build.lastWarningSignature = warningSignature;
      emitBuildEvent(build, {
        type: 'warning',
        workerId: lease.workerId,
        taskId: task.taskId,
        nodeId: task.nodeId,
        message: text.trim().slice(0, 240),
      });
    });

    child.once('error', (error) => {
      settle(() => reject(error));
    });
    child.once('exit', (code, signal) => {
      settle(() => {
        if (build.stopRequested) {
          resolve();
          return;
        }
        if (timedOut) {
          reject(new Error(`Codex task ${task.taskId} timed out after ${timeoutMs}ms.`));
          return;
        }
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`Codex exited with code ${code ?? 'unknown'}${signal ? ` (signal ${signal})` : ''}${stderrBuffer.trim() ? `: ${stderrBuffer.trim()}` : ''}`));
      });
    });
  });
}

function modulePrefix(task: OmxExecutionTask) {
  return (task.writeSet[0] || `modules/${sanitizeSegment(task.nodeId)}/**`).replace(/\/\*\*$/, '');
}

function getNode(session: SessionDocument, task: OmxExecutionTask) {
  return (
    session.graph.nodes.find((node) => node.id === task.nodeId) as GraphNode | undefined
  ) || {
    id: task.nodeId,
    label: task.label,
    type: task.type,
    status: 'pending',
    description: `${task.label} generated from the canonical OMX execution graph.`,
    data_contract: 'Input/output contract carried by the canonical OMX execution task.',
    acceptance_criteria: ['Materializes the canonical execution task without falling back to fragmented source nodes.'],
    error_handling: ['Return structured task failure metadata when materialization fails.'],
  };
}

function setTaskStatus(build: OmxBuildRecord, taskId: string, status: OmxTaskStatus) {
  const task = getTaskById(build.executionGraph, taskId);
  if (task) {
    task.status = status;
  }
}

function setWaveStatus(build: OmxBuildRecord, waveId: string, status: OmxExecutionGraph['waves'][number]['status']) {
  const wave = build.executionGraph.waves.find((entry) => entry.waveId === waveId);
  if (wave) {
    wave.status = status;
  }
}

function addActiveTask(build: OmxBuildRecord, taskId: string, nodeId: string) {
  build.activeTaskIds = [...new Set([...build.activeTaskIds, taskId])];
  build.currentNodeId = build.currentNodeId || nodeId;
}

function removeActiveTask(build: OmxBuildRecord, taskId: string, nodeId: string) {
  build.activeTaskIds = build.activeTaskIds.filter((value) => value !== taskId);
  if (build.currentNodeId === nodeId) {
    const nextTaskId = build.activeTaskIds[0];
    build.currentNodeId = nextTaskId ? getTaskById(build.executionGraph, nextTaskId)?.nodeId || null : null;
  }
}

function abortInFlightTasks(build: OmxBuildRecord, reason: string) {
  for (const task of build.executionGraph.tasks) {
    if (['leased', 'building', 'verifying'].includes(task.status)) {
      task.status = 'aborted';
      build.nodeStates[task.nodeId] = 'queued';
      emitBuildEvent(build, {
        type: 'warning',
        taskId: task.taskId,
        nodeId: task.nodeId,
        message: `${task.taskId} aborted: ${reason}`,
      });
    }
  }
  build.activeTaskIds = [];
  build.currentNodeId = null;
  build.workerLeases = {};
}

function markBuildDisposed(build: OmxBuildRecord) {
  clearForcedStopTimer(build);
  build.disposed = true;
  build.child = null;
  build.workerChildren = {};
  build.stopRequested = true;
  build.emitter.removeAllListeners();
}

function markBuildStopped(build: OmxBuildRecord) {
  build.stopRequested = true;
  build.status = 'stopped';
  build.updatedAt = nowIso();
  build.child = null;
  build.workerChildren = {};
}

function cleanupCompletedBuild(build: OmxBuildRecord) {
  markBuildDisposed(build);
  if (builds.get(build.sessionId)?.buildId === build.buildId) {
    builds.delete(build.sessionId);
  }
}

async function runTaskLifecycle(build: OmxBuildRecord, session: SessionDocument, task: OmxExecutionTask) {
  const node = getNode(session, task);
  if (!node) {
    throw new Error(`Missing node for task ${task.taskId}`);
  }

  let lease: OmxWorkerLease | null = null;
  try {
    addActiveTask(build, task.taskId, node.id);
    build.nodeStates[node.id] = 'building';
    setTaskStatus(build, task.taskId, 'leased');

    lease = await prepareTaskWorkspace(
      build.workspacePath,
      build.runtimeDir,
      task,
      isFrontendGraphNode(node)
        ? { copyOmxState: false, externalRuntimeRoot: cleanDesignerRuntimeRoot(build) }
        : undefined,
    );
    build.workerLeases[lease.workerId] = lease;

    emitBuildEvent(build, {
      type: 'task_leased',
      taskId: task.taskId,
      nodeId: task.nodeId,
      waveId: task.waveId,
      workerId: lease.workerId,
    });
    emitBuildEvent(build, {
      type: 'worker_started',
      workerId: lease.workerId,
      taskId: task.taskId,
      nodeId: task.nodeId,
    });
    emitBuildEvent(build, {
      type: 'node_start',
      nodeId: node.id,
      phase: 'scaffold',
    });

    let scaffold = await materializeTaskScaffold(lease.overlayPath, task, node);
    emitBuildEvent(build, {
      type: 'artifact_progress',
      taskId: task.taskId,
      nodeId: task.nodeId,
      workerId: lease.workerId,
      phase: 'scaffold',
      pct: 25,
      path: toRelative(lease.overlayPath, scaffold.specPath),
      message: 'Module spec scaffolded.',
    });
    emitBuildEvent(build, {
      type: 'node_progress',
      nodeId: node.id,
      phase: 'scaffold',
      pct: 25,
      currentFile: toRelative(lease.overlayPath, scaffold.specPath),
    });
    emitBuildEvent(build, {
      type: 'artifact_progress',
      taskId: task.taskId,
      nodeId: task.nodeId,
      workerId: lease.workerId,
      phase: 'implement',
      pct: 50,
      path: toRelative(lease.overlayPath, scaffold.readmePath),
      message: 'Module README scaffolded.',
    });
    emitBuildEvent(build, {
      type: 'node_progress',
      nodeId: node.id,
      phase: 'implement',
      pct: 50,
      currentFile: toRelative(lease.overlayPath, scaffold.readmePath),
    });

    setTaskStatus(build, task.taskId, 'building');
    lease.state = 'running';
    lease.heartbeatAt = nowIso();
    const frontendFingerprintBefore = isFrontendGraphNode(node)
      ? await collectFileFingerprints(scaffold.moduleDir)
      : null;
    let codexTimeoutReason: string | null = null;
    let cleanDesignerRenderableChanged = false;
    let cleanDesignerChangedPaths: string[] = [];
    try {
      await runCodexForTask(build, lease, task, node, scaffold.moduleDir);
    } catch (error) {
      if (!isCodexTimeoutError(error)) {
        throw error;
      }
      codexTimeoutReason = error.message;
      if (!frontendFingerprintBefore) {
        emitBuildEvent(build, {
          type: 'worker_fallback',
          workerId: lease.workerId,
          taskId: task.taskId,
          nodeId: task.nodeId,
          reason: codexTimeoutReason,
          message: 'Codex worker timed out; continuing with deterministic Retrobuilder module baseline.',
        });
      }
    }

    if (frontendFingerprintBefore) {
      const frontendFingerprintAfter = await collectFileFingerprints(scaffold.moduleDir);
      const changedPaths = changedFingerprintPaths(frontendFingerprintBefore, frontendFingerprintAfter);
      const renderableChanged = changedPaths.some((entry) => entry === 'src/index.js' || entry.startsWith('src/index.'));
      cleanDesignerRenderableChanged = renderableChanged;
      cleanDesignerChangedPaths = changedPaths;

      if (!renderableChanged) {
        const noRenderableReason = changedPaths.length > 0
          ? `Clean designer changed non-renderable files only: ${changedPaths.slice(0, 6).join(', ')}.`
          : 'Clean designer made no module artifact changes.';
        emitBuildEvent(build, {
          type: 'worker_fallback',
          workerId: lease.workerId,
          taskId: task.taskId,
          nodeId: task.nodeId,
          reason: codexTimeoutReason
            ? `${codexTimeoutReason}; ${noRenderableReason}`
            : noRenderableReason,
          message: 'Clean designer did not alter the renderable product surface; continuing with deterministic Retrobuilder module baseline.',
        });
      } else if (codexTimeoutReason) {
        emitBuildEvent(build, {
          type: 'worker_log',
          workerId: lease.workerId,
          taskId: task.taskId,
          nodeId: task.nodeId,
          level: 'info',
          message: `Clean designer hit deadline after updating renderable artifacts; validating captured patch: ${changedPaths.slice(0, 6).join(', ')}.`,
        });
      } else {
        emitBuildEvent(build, {
          type: 'worker_log',
          workerId: lease.workerId,
          taskId: task.taskId,
          nodeId: task.nodeId,
          level: 'info',
          message: `Clean designer updated renderable artifacts: ${changedPaths.slice(0, 6).join(', ')}.`,
        });
      }
    }
    await ensureModulePackagingBaseline(scaffold.moduleDir);

    if (build.stopRequested) {
      setTaskStatus(build, task.taskId, 'aborted');
      build.nodeStates[node.id] = 'queued';
      return;
    }

    setTaskStatus(build, task.taskId, 'verifying');
    lease.state = 'verifying';
    lease.heartbeatAt = nowIso();
    emitBuildEvent(build, {
      type: 'verify_started',
      taskId: task.taskId,
      nodeId: task.nodeId,
      workerId: lease.workerId,
      command: task.verifyCommand,
    });

    let verifyReceipt = await runVerifyInOverlay(lease.overlayPath, task);
    if (!verifyReceipt.passed && frontendFingerprintBefore && cleanDesignerRenderableChanged) {
      emitBuildEvent(build, {
        type: 'worker_fallback',
        workerId: lease.workerId,
        taskId: task.taskId,
        nodeId: task.nodeId,
        reason: `Clean designer patch failed verification: ${verifyReceipt.summary.slice(0, 500)}`,
        message: `Clean designer patch failed module verify; restoring deterministic domain-aware baseline instead of failing the build. Changed artifacts: ${cleanDesignerChangedPaths.slice(0, 6).join(', ') || 'unknown'}.`,
      });
      scaffold = await materializeTaskScaffold(lease.overlayPath, task, node);
      await ensureModulePackagingBaseline(scaffold.moduleDir);
      emitBuildEvent(build, {
        type: 'verify_started',
        taskId: task.taskId,
        nodeId: task.nodeId,
        workerId: lease.workerId,
        command: 'deterministic baseline retry',
      });
      verifyReceipt = await runVerifyInOverlay(lease.overlayPath, task);
    }
    build.verifyReceipts[task.taskId] = verifyReceipt;
    if (!verifyReceipt.passed) {
      setTaskStatus(build, task.taskId, 'failed');
      build.nodeStates[node.id] = 'error';
      build.error = `Verify failed for ${task.taskId}: ${verifyReceipt.summary}`;
      emitBuildEvent(build, {
        type: 'verify_failed',
        taskId: task.taskId,
        nodeId: task.nodeId,
        workerId: lease.workerId,
        command: verifyReceipt.command,
        error: verifyReceipt.summary,
      });
      emitBuildEvent(build, {
        type: 'node_error',
        nodeId: node.id,
        error: verifyReceipt.summary,
        retrying: false,
      });
      return;
    }

    let frontendQuality = await runFrontendMobileQualityGate(scaffold.moduleDir, node);
    if (!frontendQuality.passed && frontendFingerprintBefore && cleanDesignerRenderableChanged) {
      emitBuildEvent(build, {
        type: 'worker_fallback',
        workerId: lease.workerId,
        taskId: task.taskId,
        nodeId: task.nodeId,
        reason: `Clean designer patch failed frontend quality: ${frontendQuality.summary.slice(0, 500)}`,
        message: `Clean designer patch failed mobile quality; restoring deterministic domain-aware baseline instead of failing the build. Changed artifacts: ${cleanDesignerChangedPaths.slice(0, 6).join(', ') || 'unknown'}.`,
      });
      scaffold = await materializeTaskScaffold(lease.overlayPath, task, node);
      await ensureModulePackagingBaseline(scaffold.moduleDir);
      const baselineVerifyReceipt = await runVerifyInOverlay(lease.overlayPath, task);
      build.verifyReceipts[task.taskId] = baselineVerifyReceipt;
      if (!baselineVerifyReceipt.passed) {
        setTaskStatus(build, task.taskId, 'failed');
        build.nodeStates[node.id] = 'error';
        build.error = `Verify failed for deterministic baseline ${task.taskId}: ${baselineVerifyReceipt.summary}`;
        emitBuildEvent(build, {
          type: 'verify_failed',
          taskId: task.taskId,
          nodeId: task.nodeId,
          workerId: lease.workerId,
          command: baselineVerifyReceipt.command,
          error: baselineVerifyReceipt.summary,
        });
        emitBuildEvent(build, {
          type: 'node_error',
          nodeId: node.id,
          error: baselineVerifyReceipt.summary,
          retrying: false,
        });
        return;
      }
      frontendQuality = await runFrontendMobileQualityGate(scaffold.moduleDir, node);
    }
    if (!frontendQuality.passed) {
      setTaskStatus(build, task.taskId, 'failed');
      build.nodeStates[node.id] = 'error';
      build.error = `Frontend mobile quality failed for ${task.taskId}: ${frontendQuality.summary}`;
      emitBuildEvent(build, {
        type: 'verify_failed',
        taskId: task.taskId,
        nodeId: task.nodeId,
        workerId: lease.workerId,
        command: 'frontend mobile quality gate',
        error: frontendQuality.summary,
      });
      emitBuildEvent(build, {
        type: 'node_error',
        nodeId: node.id,
        error: frontendQuality.summary,
        retrying: false,
      });
      return;
    }

    if (frontendQuality.summary) {
      verifyReceipt.summary = [verifyReceipt.summary, frontendQuality.summary].filter(Boolean).join('\n');
      build.verifyReceipts[task.taskId] = verifyReceipt;
    }

    setTaskStatus(build, task.taskId, 'verified');
    emitBuildEvent(build, {
      type: 'verify_passed',
      taskId: task.taskId,
      nodeId: task.nodeId,
      workerId: lease.workerId,
      command: verifyReceipt.command,
      summary: verifyReceipt.summary,
    });

    const manifest = await collectArtifactManifest(lease.overlayPath, task);
    emitBuildEvent(build, {
      type: 'merge_started',
      taskId: task.taskId,
      nodeId: task.nodeId,
      workerId: lease.workerId,
    });
    const mergeReceipt = await mergeTaskArtifacts(build.workspacePath, lease.overlayPath, task, manifest, build.executionGraph.ownership);
    build.mergeReceipts[task.taskId] = mergeReceipt;

    if (!mergeReceipt.applied) {
      setTaskStatus(build, task.taskId, 'failed');
      build.nodeStates[node.id] = 'error';
      build.error = `Merge rejected for ${task.taskId}: ${mergeReceipt.reason || 'ownership violation'}`;
      emitBuildEvent(build, {
        type: 'merge_rejected',
        taskId: task.taskId,
        nodeId: task.nodeId,
        workerId: lease.workerId,
        rejectedPaths: mergeReceipt.rejectedPaths,
        reason: mergeReceipt.reason,
      });
      emitBuildEvent(build, {
        type: 'node_error',
        nodeId: node.id,
        error: mergeReceipt.reason || 'Merge rejected.',
        retrying: false,
      });
      return;
    }

    setTaskStatus(build, task.taskId, 'merged');
    build.nodeStates[node.id] = 'complete';
    lease.state = 'idle';
    emitBuildEvent(build, {
      type: 'merge_passed',
      taskId: task.taskId,
      nodeId: task.nodeId,
      workerId: lease.workerId,
      appliedPaths: mergeReceipt.appliedPaths,
    });
    emitBuildEvent(build, {
      type: 'task_completed',
      taskId: task.taskId,
      nodeId: task.nodeId,
      waveId: task.waveId,
      filesWritten: manifest.totalFiles,
      linesWritten: manifest.totalLines,
    });
    emitBuildEvent(build, {
      type: 'node_complete',
      nodeId: node.id,
      filesWritten: manifest.totalFiles,
      linesWritten: manifest.totalLines,
    });
  } finally {
    removeActiveTask(build, task.taskId, node.id);
    if (lease) {
      if (task.status === 'failed' || build.nodeStates[node.id] === 'error') {
        emitBuildEvent(build, {
          type: 'warning',
          taskId: task.taskId,
          nodeId: node.id,
          workerId: lease.workerId,
          message: `Preserved failed worker workspace for inspection: ${lease.taskRuntimeDir}`,
        });
      } else {
        await cleanupTaskWorkspace(lease.taskRuntimeDir);
      }
      delete build.workerLeases[lease.workerId];
    }
    recalculateBuildSummary(build);
  }
}

async function runWaveTasks(build: OmxBuildRecord, session: SessionDocument, taskIds: string[]) {
  const queue = [...taskIds];
  const running = new Set<Promise<void>>();

  const launch = (taskId: string) => {
    const task = getTaskById(build.executionGraph, taskId);
    if (!task) return;
    const runner = runTaskLifecycle(build, session, task)
      .catch((error) => {
        if (!build.error) {
          build.error = error instanceof Error ? error.message : String(error);
        }
      })
      .finally(() => {
        running.delete(runner);
      });
    running.add(runner);
  };

  while ((queue.length > 0 || running.size > 0) && !build.stopRequested && !build.error) {
    while (queue.length > 0 && running.size < build.workerCount && !build.stopRequested && !build.error) {
      launch(queue.shift()!);
    }
    if (running.size > 0) {
      await Promise.race(running);
    }
  }

  if (running.size > 0) {
    await Promise.allSettled([...running]);
  }
}

async function finalizeBuild(build: OmxBuildRecord, session: SessionDocument) {
  const terminalStatus = buildTerminalStatus(build);
  let { totalFiles, totalLines } = await countWorkspaceArtifacts(build.workspacePath).catch(() => ({ totalFiles: 0, totalLines: 0 }));
  const elapsedMs = Date.now() - Date.parse(build.startedAt);

  if (terminalStatus === 'stopped') {
    abortInFlightTasks(build, 'operator stop or interrupted runtime');
    build.activeWaveId = null;
    build.activeTaskIds = [];
    markBuildStopped(build);
    build.terminalMessage = 'BUILD STOPPED — operator interrupted OMX materialization.';
    await persistBuildSnapshot(build);
    emitBuildEvent(build, {
      type: 'build_terminal',
      status: 'stopped',
      message: build.terminalMessage,
    }, 'terminal');
    emitToSubscribers(build, {}, 'done');
    scheduleStoppedBuildCleanup(build);
    return;
  }

  if (terminalStatus === 'failed') {
    build.status = 'failed';
    build.updatedAt = nowIso();
    build.activeWaveId = null;
    build.activeTaskIds = [];
    build.terminalMessage = `BUILD FAILED — ${build.error || 'unexpected OMX runtime fault.'}`;
    await persistBuildSnapshot(build);
    emitBuildEvent(build, {
      type: 'build_terminal',
      status: 'failed',
      message: build.terminalMessage,
    }, 'terminal');
    emitToSubscribers(build, {}, 'done');
    cleanupCompletedBuild(build);
    return;
  }

  build.status = 'running';
  build.updatedAt = nowIso();
  build.activeWaveId = null;
  build.activeTaskIds = [];
  build.systemVerify = { status: 'pending' };
  build.result = {
    totalFiles,
    totalLines,
    elapsedMs,
  };
  build.terminalMessage = undefined;
  recalculateBuildSummary(build);

  const specularTotal = build.designSummary.affectedNodeIds.length;
  const specularGateApproved = build.designSummary.designGateStatus === 'passed';
  const specularPassed = specularGateApproved ? specularTotal : 0;

  if (!specularGateApproved) {
    build.status = 'failed';
    build.error = `21st design gate blocked certification. ${build.designSummary.designFindings[0] || 'Resolve SPECULAR CREATE findings before building.'}`;
    build.terminalMessage = build.error;
    await persistBuildSnapshot(build);
    emitBuildEvent(build, {
      type: 'build_complete',
      status: build.status,
      totalFiles,
      totalLines,
      elapsedMs,
      specular: {
        passed: specularPassed,
        total: specularTotal,
        fixesApplied: 0,
        gateApproved: false,
      },
    });
    emitBuildEvent(build, {
      type: 'build_terminal',
      status: 'failed',
      message: build.terminalMessage,
    }, 'terminal');
    emitToSubscribers(build, {}, 'done');
    cleanupCompletedBuild(build);
    return;
  }

  build.systemVerify = await resolveSystemVerify(build.workspacePath);
  build.result.systemVerify = build.systemVerify;

  try {
    const generatedDocs = await generateOmxBuildDocumentationArtifacts({
      workspacePath: build.workspacePath,
      session,
      buildId: build.buildId,
      executionGraph: build.executionGraph,
      verifyReceipts: build.verifyReceipts,
      mergeReceipts: build.mergeReceipts,
      designSummary: build.designSummary,
      systemVerify: build.systemVerify,
      elapsedMs,
    });
    build.result.documentation = generatedDocs.documentation;
    build.result.runnableManifest = generatedDocs.runnableManifest;
    totalFiles = generatedDocs.documentation.workspace.totalFiles;
    totalLines = generatedDocs.documentation.workspace.totalLines;
    build.result.totalFiles = totalFiles;
    build.result.totalLines = totalLines;
    if (generatedDocs.documentation.quality.status !== 'passed') {
      emitBuildEvent(build, {
        type: 'warning',
        message: `Documentation quality gate ${generatedDocs.documentation.quality.status} (${generatedDocs.documentation.quality.score}/100): ${generatedDocs.documentation.quality.findings[0] || 'Review the generated wiki and README bundle.'}`,
      });
    }
  } catch (error) {
    const message = `Documentation synthesis failed: ${error instanceof Error ? error.message : String(error)}`;
    emitBuildEvent(build, {
      type: 'warning',
      message,
    });
    build.status = 'failed';
    build.error = `${message}. Review the generated workspace artifacts before certifying this build.`;
    build.terminalMessage = build.error;
    build.result.totalFiles = totalFiles;
    build.result.totalLines = totalLines;
    await persistBuildSnapshot(build);
    emitBuildEvent(build, {
      type: 'build_complete',
      status: build.status,
      totalFiles,
      totalLines,
      elapsedMs,
      specular: {
        passed: specularPassed,
        total: specularTotal,
        fixesApplied: 0,
        gateApproved: true,
      },
      systemVerify: build.systemVerify,
    });
    emitBuildEvent(build, {
      type: 'build_terminal',
      status: 'failed',
      message: build.terminalMessage,
    }, 'terminal');
    emitToSubscribers(build, {}, 'done');
    cleanupCompletedBuild(build);
    return;
  }

  if (build.result.documentation?.quality.status === 'failed') {
    build.status = 'failed';
    build.error = `Documentation quality gate failed. ${build.result.documentation.quality.findings[0] || 'Review the generated dossier, wiki, and README artifacts.'}`;
    build.terminalMessage = build.error;
    await persistBuildSnapshot(build);
    emitBuildEvent(build, {
      type: 'build_complete',
      status: build.status,
      totalFiles,
      totalLines,
      elapsedMs,
      specular: {
        passed: specularPassed,
        total: specularTotal,
        fixesApplied: 0,
        gateApproved: true,
      },
      documentation: build.result.documentation,
      runnableManifest: build.result.runnableManifest,
      systemVerify: build.systemVerify,
    });
    emitBuildEvent(build, {
      type: 'build_terminal',
      status: 'failed',
      message: build.terminalMessage,
    }, 'terminal');
    emitToSubscribers(build, {}, 'done');
    cleanupCompletedBuild(build);
    return;
  }

  if (build.systemVerify.status === 'failed') {
    build.status = 'failed';
    build.error = `Final system verify failed. ${build.systemVerify.summary || 'Review root verification output.'}`;
    build.terminalMessage = build.error;
    await persistBuildSnapshot(build);
    emitBuildEvent(build, {
      type: 'build_complete',
      status: build.status,
      totalFiles,
      totalLines,
      elapsedMs,
      specular: {
        passed: specularPassed,
        total: specularTotal,
        fixesApplied: 0,
        gateApproved: true,
      },
      documentation: build.result.documentation,
      runnableManifest: build.result.runnableManifest,
      systemVerify: build.systemVerify,
    });
    emitBuildEvent(build, {
      type: 'build_terminal',
      status: 'failed',
      message: build.terminalMessage,
    }, 'terminal');
    emitToSubscribers(build, {}, 'done');
    cleanupCompletedBuild(build);
    return;
  }

  build.status = 'succeeded';
  build.updatedAt = nowIso();
  build.terminalMessage = 'BUILD SUCCEEDED — OMX materialization completed.';
  await persistBuildSnapshot(build);
  emitBuildEvent(build, {
    type: 'build_complete',
    status: build.status,
    totalFiles,
    totalLines,
    elapsedMs,
    specular: {
      passed: specularPassed,
      total: specularTotal,
      fixesApplied: 0,
      gateApproved: true,
    },
    documentation: build.result.documentation,
    runnableManifest: build.result.runnableManifest,
    systemVerify: build.systemVerify,
  });
  emitToSubscribers(build, {}, 'done');
  cleanupCompletedBuild(build);
}

async function runBuildLifecycle(build: OmxBuildRecord, session: SessionDocument, options?: OmxLifecycleOptions) {
  try {
    if (build.stopRequested) return;

    const prepared = await ensureWorkspaceFiles(session, build, { reuseWorkspace: options?.reuseWorkspace });
    if (build.stopRequested) {
      markBuildStopped(build);
      return;
    }

    build.status = 'running';
    build.updatedAt = nowIso();
    if (!options?.skipCompleted) {
      for (const task of build.executionGraph.tasks) task.status = 'pending';
      for (const wave of build.executionGraph.waves) wave.status = 'pending';
      build.completedNodes = 0;
      build.buildProgress = 0;
    }
    recalculateBuildSummary(build);
    await persistBuildSnapshot(build);

    emitBuildEvent(build, {
      type: 'build_start',
      totalNodes: build.executionGraph.tasks.length,
      workspacePath: build.workspacePath,
      bootstrapFiles: [
        toRelative(build.workspacePath, prepared.blueprintPath),
        toRelative(build.workspacePath, prepared.manifestoPath),
        toRelative(build.workspacePath, prepared.architecturePath),
        toRelative(build.workspacePath, prepared.promptPath),
        ...prepared.rootCompositionFiles.map((file) => file.path),
      ],
    });

    emitBuildEvent(build, {
      type: 'build_compiled',
      wavesTotal: build.executionGraph.waves.length,
      workerCount: build.executionGraph.workerCount,
      tasks: build.executionGraph.tasks.map((task) => ({
        taskId: task.taskId,
        nodeId: task.nodeId,
        waveId: task.waveId,
        label: task.label,
        status: task.status,
        priority: task.priority,
        verifyCommand: task.verifyCommand,
      })),
      waves: build.executionGraph.waves.map((wave) => ({
        waveId: wave.waveId,
        taskIds: wave.taskIds,
        status: wave.status,
      })),
      ownership: build.executionGraph.ownership,
      ledgerVersion: OMX_LEDGER_VERSION,
    });

    if (options?.resumeRehydrated) {
      emitBuildEvent(build, {
        type: 'resume_rehydrated',
        reason: 'persisted ledger and execution graph restored',
        activeWaveId: build.activeWaveId,
      });
    }

    for (const wave of build.executionGraph.waves) {
      if (build.stopRequested || build.error) {
        build.status = 'stopping';
        break;
      }

      const runnableTaskIds = wave.taskIds.filter((taskId) => {
        const task = getTaskById(build.executionGraph, taskId);
        return task && (!options?.skipCompleted || task.status !== 'merged');
      });
      if (runnableTaskIds.length === 0) {
        wave.status = 'merged';
        continue;
      }

      build.activeWaveId = wave.waveId;
      setWaveStatus(build, wave.waveId, 'running');
      for (const taskId of runnableTaskIds) {
        const task = getTaskById(build.executionGraph, taskId);
        if (!task) continue;
        if (build.nodeStates[task.nodeId] === 'dormant') {
          build.nodeStates[task.nodeId] = 'queued';
        }
        const dependencySources = build.executionGraph.tasks.filter((candidate) => task.dependsOnTaskIds.includes(candidate.taskId));
        for (const sourceTask of dependencySources) {
          emitBuildEvent(build, {
            type: 'edge_activated',
            source: sourceTask.nodeId,
            target: task.nodeId,
          });
        }
      }
      emitBuildEvent(build, {
        type: 'wave_started',
        waveId: wave.waveId,
        taskIds: runnableTaskIds,
      });

      await runWaveTasks(build, session, runnableTaskIds);

      if (build.error) {
        setWaveStatus(build, wave.waveId, 'failed');
        break;
      }
      setWaveStatus(build, wave.waveId, 'merged');
    }
  } catch (error) {
    build.error = error instanceof Error ? error.message : String(error);
  } finally {
    build.child = null;
    build.activeTaskIds = [];
    await finalizeBuild(build, session);
  }
}

function statusFromRecord(build: OmxBuildRecord): OmxStatusResponse {
  const resumeReason =
    build.status === 'stopped'
      ? 'stopped'
      : build.status === 'failed'
        ? 'failed'
        : undefined;
  return {
    sessionId: build.sessionId,
    buildId: build.buildId,
    status: build.status,
    workspacePath: build.workspacePath,
    transport: redactTransport(build.transport),
    source: build.source,
    totalNodes: build.totalNodes,
    completedNodes: build.completedNodes,
    buildProgress: build.buildProgress,
    activeNodeId: build.currentNodeId,
    nodeStates: build.nodeStates,
    designProfile: build.designSummary.designProfile,
    designGateStatus: build.designSummary.designGateStatus,
    designScore: build.designSummary.designScore,
    designFindings: build.designSummary.designFindings,
    designEvidence: build.designSummary.designEvidence,
    resumeAvailable: Boolean(resumeReason),
    resumeReason,
    result: build.result,
    terminalMessage: build.terminalMessage,
    verifyReceipts: redactVerifyReceipts(build.verifyReceipts),
    mergeReceipts: build.mergeReceipts,
    ...summarizeExecutionGraph(build, { public: true }),
  };
}

function statusFromPersistedFile(persisted: OmxPersistedSnapshot): OmxStatusResponse {
  const resumeReason =
    persisted.status === 'running' || persisted.status === 'queued'
      ? 'interrupted'
      : persisted.status === 'stopped'
        ? 'stopped'
        : persisted.status === 'failed'
          ? 'failed'
          : undefined;
  return {
    ...persisted,
    transport: redactTransport(persisted.transport),
    source: persisted.source || 'persisted-session',
    designProfile: persisted.designProfile || '21st',
    designGateStatus: persisted.designGateStatus || 'pending',
    designScore: typeof persisted.designScore === 'number' ? persisted.designScore : 0,
    designFindings: Array.isArray(persisted.designFindings) ? persisted.designFindings : [],
    designEvidence: Array.isArray(persisted.designEvidence) ? persisted.designEvidence : [],
    resumeAvailable: Boolean(resumeReason && persisted.buildId && persisted.workspacePath),
    resumeReason,
    ledgerVersion: persisted.ledgerVersion || OMX_LEDGER_VERSION,
    activeTasks: Array.isArray(persisted.activeTasks) ? persisted.activeTasks : [],
    verifyReceipts: redactVerifyReceipts(persisted.verifyReceipts || {}),
    mergeReceipts: persisted.mergeReceipts || {},
    systemVerify: persisted.systemVerify || { status: 'not_available' },
  };
}

async function readPersistedStatus(sessionId: string): Promise<OmxPersistedSnapshot | null> {
  const runtimeDir = getRuntimeDirectory(sessionId);
  const filePath = buildStatusFile(runtimeDir);
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as OmxPersistedSnapshot;
  } catch {
    return null;
  }
}

export async function readOmxEventHistory(sessionId: string, buildId?: string): Promise<Record<string, unknown>[]> {
  const events = await readOmxHistoryPayloads(getRuntimeDirectory(sessionId));
  const publicEvents = events.map((event) => redactPublicOmxPayload(event));
  if (!buildId) {
    return publicEvents;
  }
  return publicEvents.filter((event) => {
    const candidate = event as Record<string, unknown>;
    return candidate.buildId === buildId;
  });
}

async function hasNodeCheckpoint(workspacePath: string, nodeId: string, label: string) {
  const specPath = path.join(workspacePath, 'modules', sanitizeSegment(nodeId || label), 'module.spec.json');
  try {
    await readFile(specPath, 'utf8');
    return true;
  } catch {
    return false;
  }
}

function createBuildRecord(
  session: SessionDocument,
  source: 'persisted-session' | 'session-draft',
  buildId: string,
  transport: OmxTransportInfo,
  workspacePath: string,
  startedAt: string,
  executionGraph: OmxExecutionGraph,
): OmxBuildRecord {
  const deliverySession = normalizeSessionForOmx(session);
  const designSummary = buildSpecularDesignGate(deliverySession.graph.nodes as any);
  const nodeStates = Object.fromEntries(session.graph.nodes.map((node) => [node.id, 'dormant'])) as Record<string, 'dormant' | 'queued' | 'building' | 'complete' | 'error'>;
  return {
    sessionId: session.id,
    buildId,
    status: 'queued',
    workspacePath,
    runtimeDir: getRuntimeDirectory(session.id),
    transport,
    source,
    emitter: new EventEmitter(),
    backlog: [],
    child: null,
    workerChildren: {},
    forceStopTimer: null,
    stopRequested: false,
    disposed: false,
    stopCleanupScheduled: false,
    currentNodeId: null,
    startedAt,
    updatedAt: nowIso(),
    totalNodes: executionGraph.tasks.length,
    completedNodes: 0,
    buildProgress: 0,
    nodeStates,
    designSummary,
    executionGraph,
    workerLeases: {},
    verifyReceipts: {},
    mergeReceipts: {},
    activeWaveId: null,
    activeTaskIds: [],
    workerCount: executionGraph.workerCount,
    lastWarningSignature: null,
    systemVerify: { status: 'pending' },
  };
}

function buildRecordFromPersistedStatus(
  session: SessionDocument,
  source: OmxBuildRecord['source'],
  persisted: OmxPersistedSnapshot,
): OmxBuildRecord {
  const buildId = persisted.buildId || randomUUID();
  const transport = getTransport(true);
  const workspacePath = persisted.workspacePath || path.join(getRuntimeDirectory(session.id), `build-${buildId}`);
  const executionGraph = persisted.executionGraph || compileExecutionGraph(session);
  const build = createBuildRecord(
    session,
    source,
    buildId,
    transport,
    workspacePath,
    persisted.startedAt || nowIso(),
    executionGraph,
  );

  build.status = 'queued';
  build.updatedAt = nowIso();
  build.nodeStates = Object.fromEntries(
    session.graph.nodes.map((node) => [node.id, persisted.nodeStates?.[node.id] || 'dormant']),
  ) as Record<string, 'dormant' | 'queued' | 'building' | 'complete' | 'error'>;
  build.workerLeases = persisted.workerLeases || {};
  build.verifyReceipts = persisted.verifyReceipts || {};
  build.mergeReceipts = persisted.mergeReceipts || {};
  build.activeWaveId = persisted.activeWaveId || null;
  build.activeTaskIds = persisted.activeTasks || [];
  build.workerCount = persisted.workerCount || executionGraph.workerCount;
  build.result = undefined;
  build.terminalMessage = undefined;
  build.error = undefined;
  return build;
}

function resetTaskForRetry(build: OmxBuildRecord, taskId: string) {
  const task = getTaskById(build.executionGraph, taskId);
  if (!task) {
    throw new Error(`No retryable OMX task found for ${taskId}.`);
  }
  if (task.status !== 'failed' && task.status !== 'aborted') {
    throw new Error(`Cannot retry task ${taskId} while it is ${task.status}.`);
  }

  task.status = 'pending';
  delete build.verifyReceipts[taskId];
  delete build.mergeReceipts[taskId];
  build.nodeStates[task.nodeId] = 'queued';
  build.error = undefined;
  build.terminalMessage = undefined;
  build.status = 'queued';
  build.activeWaveId = task.waveId;
  build.activeTaskIds = [];

  const wave = build.executionGraph.waves.find((entry) => entry.waveId === task.waveId);
  if (wave) {
    wave.status = 'pending';
  }
}

function reassignTaskOwnership(build: OmxBuildRecord, taskId: string) {
  const receipt = build.mergeReceipts[taskId];
  if (!receipt || receipt.applied || receipt.rejectedPaths.length === 0) {
    throw new Error(`No retryable merge rejection found for ${taskId}.`);
  }

  const updated = reassignOwnershipForPaths(build.executionGraph.ownership, taskId, receipt.rejectedPaths);
  if (updated === 0) {
    throw new Error(`No shared-owner lanes can be reassigned to ${taskId}.`);
  }
}

async function reconcileResumableRecord(session: SessionDocument, build: OmxBuildRecord) {
  for (const task of build.executionGraph.tasks) {
    const node = session.graph.nodes.find((entry) => entry.id === task.nodeId);
    if (!node) continue;

    if (['leased', 'building', 'verifying'].includes(task.status)) {
      task.status = 'aborted';
      build.nodeStates[node.id] = 'queued';
      continue;
    }

    if (task.status === 'merged') {
      const checkpointExists = await hasNodeCheckpoint(build.workspacePath, node.id, node.label);
      if (!checkpointExists) {
        task.status = 'pending';
        build.nodeStates[node.id] = 'queued';
      } else {
        build.nodeStates[node.id] = 'complete';
      }
    }
  }

  build.workerLeases = {};
  build.activeTaskIds = [];
  build.currentNodeId = null;
  recalculateBuildSummary(build);
}

export async function cleanupOmxBuildState(sessionId: string) {
  const build = builds.get(sessionId);
  if (build && (build.child || hasActiveChildren(build))) {
    build.stopRequested = true;
    if (build.child) terminateProcessTree(build.child, 'SIGTERM');
    for (const child of Object.values(build.workerChildren)) {
      terminateProcessTree(child, 'SIGTERM');
    }
    scheduleForcedStop(build);
  }
  if (build) {
    markBuildDisposed(build);
  }
  builds.delete(sessionId);
  await rm(getRuntimeDirectory(sessionId), { force: true, recursive: true }).catch(() => {});
}

export async function getOmxStatus(sessionId: string): Promise<OmxStatusResponse> {
  const activeBuild = builds.get(sessionId);
  if (activeBuild) {
    return statusFromRecord(activeBuild);
  }

  const persisted = await readPersistedStatus(sessionId);
  if (persisted) {
    return statusFromPersistedFile(persisted);
  }

  return {
    sessionId,
    status: 'idle',
    transport: redactTransport(getTransport(await codexAvailable())),
    source: 'persisted-session',
    designProfile: '21st',
    designGateStatus: 'pending',
    designScore: 0,
    designFindings: [],
    designEvidence: [],
    resumeAvailable: false,
    wavesTotal: 0,
    wavesCompleted: 0,
    activeTasks: [],
    workerCount: 0,
    verifyPendingCount: 0,
    mergePendingCount: 0,
    ledgerVersion: OMX_LEDGER_VERSION,
    verifyReceipts: {},
    mergeReceipts: {},
    systemVerify: { status: 'not_available' },
  };
}

export async function startOmxBuild(input: OmxBuildRequest): Promise<OmxBuildStartResponse> {
  const { session, source } = input;
  const existing = builds.get(session.id);
  if (existing && ['queued', 'running', 'stopping', 'stopped'].includes(existing.status)) {
    return {
      ...statusFromRecord(existing),
      buildId: existing.buildId,
      status: existing.status,
      workspacePath: existing.workspacePath,
      streamUrl: `/api/omx/stream/${session.id}`,
      statusUrl: `/api/omx/status/${session.id}`,
      stopUrl: `/api/omx/stop/${session.id}`,
    } as OmxBuildStartResponse;
  }

  const deliverySession = normalizeSessionForOmx(session);
  const designSummary = buildSpecularDesignGate(deliverySession.graph.nodes as any);
  if (designSummary.designGateStatus !== 'passed') {
    await persistDesignGateBlockedStatus(session.id, designSummary);
    throw createDesignGateBlockedError(designSummary);
  }

  const transport = getTransport(await codexAvailable({ fresh: true }));
  if (!transport.available) {
    throw new Error(buildInactiveCodexMessage());
  }

  const buildId = randomUUID();
  const workspacePath = path.join(getRuntimeDirectory(session.id), `build-${buildId}`);
  const executionGraph = compileExecutionGraph(deliverySession, resolveWorkerCount(deliverySession.graph.nodes.length));
  const build = createBuildRecord(deliverySession, source, buildId, transport, workspacePath, nowIso(), executionGraph);
  builds.set(session.id, build);
  await mkdir(build.runtimeDir, { recursive: true });
  await persistBuildSnapshot(build);

  queueMicrotask(() => {
    void runBuildLifecycle(build, deliverySession);
  });

  return {
    ...statusFromRecord(build),
    buildId,
    status: 'queued',
    workspacePath,
    streamUrl: `/api/omx/stream/${session.id}`,
    statusUrl: `/api/omx/status/${session.id}`,
    stopUrl: `/api/omx/stop/${session.id}`,
  } as OmxBuildStartResponse;
}

export async function resumeOmxBuild(input: OmxBuildRequest): Promise<OmxBuildStartResponse> {
  const { session, source } = input;
  const active = builds.get(session.id);
  if (active && ['queued', 'running', 'stopping'].includes(active.status)) {
    return {
      ...statusFromRecord(active),
      buildId: active.buildId,
      status: active.status as OmxBuildStartResponse['status'],
      workspacePath: active.workspacePath,
      streamUrl: `/api/omx/stream/${session.id}`,
      statusUrl: `/api/omx/status/${session.id}`,
      stopUrl: `/api/omx/stop/${session.id}`,
    };
  }

  const persisted = await readPersistedStatus(session.id);
  if (!persisted || !persisted.buildId || !persisted.workspacePath || !['failed', 'stopped', 'queued', 'running'].includes(persisted.status)) {
    throw new Error('No resumable OMX build found for this session.');
  }

  const deliverySession = normalizeSessionForOmx(session);
  const designSummary = buildSpecularDesignGate(deliverySession.graph.nodes as any);
  if (designSummary.designGateStatus !== 'passed') {
    await persistDesignGateBlockedStatus(session.id, designSummary);
    throw createDesignGateBlockedError(designSummary);
  }

  const transport = getTransport(await codexAvailable({ fresh: true }));
  if (!transport.available) {
    throw new Error(buildInactiveCodexMessage());
  }

  const build = buildRecordFromPersistedStatus(deliverySession, source, persisted);
  build.transport = transport;
  build.designSummary = designSummary;
  build.executionGraph.workerCount = resolveWorkerCount(build.executionGraph.tasks.length);
  build.workerCount = build.executionGraph.workerCount;
  await reconcileResumableRecord(deliverySession, build);
  builds.set(session.id, build);
  await persistBuildSnapshot(build);

  queueMicrotask(() => {
    void runBuildLifecycle(build, deliverySession, { reuseWorkspace: true, skipCompleted: true, resumeRehydrated: true });
  });

  return {
    ...statusFromRecord(build),
    buildId: build.buildId,
    status: 'queued',
    workspacePath: build.workspacePath,
    streamUrl: `/api/omx/stream/${session.id}`,
    statusUrl: `/api/omx/status/${session.id}`,
    stopUrl: `/api/omx/stop/${session.id}`,
  };
}

export async function retryOmxTask(input: OmxTaskRetryRequest): Promise<OmxBuildStartResponse> {
  const { session, source, taskId } = input;
  const active = builds.get(session.id);
  if (active && ['queued', 'running', 'stopping'].includes(active.status)) {
    throw new Error('Cannot retry OMX task while a build is active.');
  }

  const persisted = await readPersistedStatus(session.id);
  if (!persisted || !persisted.buildId || !persisted.workspacePath || !['failed', 'stopped'].includes(persisted.status)) {
    throw new Error('No retryable OMX task found for this session.');
  }

  const deliverySession = normalizeSessionForOmx(session);
  const designSummary = buildSpecularDesignGate(deliverySession.graph.nodes as any);
  if (designSummary.designGateStatus !== 'passed') {
    await persistDesignGateBlockedStatus(session.id, designSummary);
    throw createDesignGateBlockedError(designSummary);
  }

  const transport = getTransport(await codexAvailable({ fresh: true }));
  if (!transport.available) {
    throw new Error(buildInactiveCodexMessage());
  }

  const build = buildRecordFromPersistedStatus(deliverySession, source, persisted);
  build.transport = transport;
  build.designSummary = designSummary;
  build.executionGraph.workerCount = resolveWorkerCount(build.executionGraph.tasks.length);
  build.workerCount = build.executionGraph.workerCount;
  await reconcileResumableRecord(deliverySession, build);
  resetTaskForRetry(build, taskId);
  builds.set(session.id, build);
  await persistBuildSnapshot(build);
  emitBuildEvent(build, {
    type: 'operational_message',
    role: 'user',
    action: 'retry',
    message: `Task retry requested for ${taskId}.`,
  });

  queueMicrotask(() => {
    void runBuildLifecycle(build, deliverySession, { reuseWorkspace: true, skipCompleted: true, resumeRehydrated: true });
  });

  return {
    ...statusFromRecord(build),
    buildId: build.buildId,
    status: 'queued',
    workspacePath: build.workspacePath,
    streamUrl: `/api/omx/stream/${session.id}`,
    statusUrl: `/api/omx/status/${session.id}`,
    stopUrl: `/api/omx/stop/${session.id}`,
  };
}

export async function reassignOmxTaskOwnership(input: OmxTaskReassignRequest): Promise<OmxBuildStartResponse> {
  const { session, source, taskId } = input;
  const active = builds.get(session.id);
  if (active && ['queued', 'running', 'stopping'].includes(active.status)) {
    throw new Error('Cannot reassign OMX ownership while a build is active.');
  }

  const persisted = await readPersistedStatus(session.id);
  if (!persisted || !persisted.buildId || !persisted.workspacePath || !['failed', 'stopped'].includes(persisted.status)) {
    throw new Error('No reassignable OMX task found for this session.');
  }

  const deliverySession = normalizeSessionForOmx(session);
  const designSummary = buildSpecularDesignGate(deliverySession.graph.nodes as any);
  if (designSummary.designGateStatus !== 'passed') {
    await persistDesignGateBlockedStatus(session.id, designSummary);
    throw createDesignGateBlockedError(designSummary);
  }

  const transport = getTransport(await codexAvailable({ fresh: true }));
  if (!transport.available) {
    throw new Error(buildInactiveCodexMessage());
  }

  const build = buildRecordFromPersistedStatus(deliverySession, source, persisted);
  build.transport = transport;
  build.designSummary = designSummary;
  build.executionGraph.workerCount = resolveWorkerCount(build.executionGraph.tasks.length);
  build.workerCount = build.executionGraph.workerCount;
  await reconcileResumableRecord(deliverySession, build);
  reassignTaskOwnership(build, taskId);
  resetTaskForRetry(build, taskId);
  builds.set(session.id, build);
  await persistBuildSnapshot(build);
  emitBuildEvent(build, {
    type: 'operational_message',
    role: 'user',
    action: 'reassign_owner',
    message: `Ownership reassigned to ${taskId}.`,
  });

  queueMicrotask(() => {
    void runBuildLifecycle(build, deliverySession, { reuseWorkspace: true, skipCompleted: true, resumeRehydrated: true });
  });

  return {
    ...statusFromRecord(build),
    buildId: build.buildId,
    status: 'queued',
    workspacePath: build.workspacePath,
    streamUrl: `/api/omx/stream/${session.id}`,
    statusUrl: `/api/omx/status/${session.id}`,
    stopUrl: `/api/omx/stop/${session.id}`,
  };
}

export async function stopOmxBuild(sessionId: string) {
  const build = builds.get(sessionId);
  if (!build || build.status === 'stopped' || build.status === 'succeeded' || build.status === 'failed') {
    return null;
  }

  build.stopRequested = true;
  build.status = build.child || hasActiveChildren(build) ? 'stopping' : 'stopped';
  abortInFlightTasks(build, 'stop requested');
  build.updatedAt = nowIso();
  await persistBuildSnapshot(build);
  emitBuildEvent(build, {
    type: 'operational_message',
    role: 'user',
    action: 'stop',
    message: 'Build stop requested from OMX control surface.',
  });

  if (build.child || hasActiveChildren(build)) {
    if (build.child) terminateProcessTree(build.child, 'SIGTERM');
    for (const child of Object.values(build.workerChildren)) {
      terminateProcessTree(child, 'SIGTERM');
    }
    scheduleForcedStop(build);
  }

  if (!build.child && !hasActiveChildren(build)) {
    build.terminalMessage = 'BUILD STOPPED — operator interrupted OMX materialization before Codex execution began.';
    await persistBuildSnapshot(build);
    emitBuildEvent(build, {
      type: 'build_terminal',
      status: 'stopped',
      message: build.terminalMessage,
    }, 'terminal');
    emitToSubscribers(build, {}, 'done');
    scheduleStoppedBuildCleanup(build);
  }

  return {
    sessionId,
    buildId: build.buildId,
    status: build.status,
  };
}

export async function recordOmxOperationalMessage(
  sessionId: string,
  input: { role: 'user' | 'system'; action: string; message: string },
) {
  const build = builds.get(sessionId);
  if (build) {
    emitBuildEvent(build, {
      type: 'operational_message',
      role: input.role,
      action: input.action,
      message: input.message,
    });
    return;
  }

  await appendOmxLedgerEvent(getRuntimeDirectory(sessionId), 'chat', 'operational_message', {
    type: 'operational_message',
    sessionId,
    role: input.role,
    action: input.action,
    message: input.message,
  });
}

function isAttachable(status: OmxBuildStatus) {
  return status === 'queued' || status === 'running' || status === 'stopping';
}

export async function attachOmxStream(sessionId: string, req: Request, res: Response): Promise<boolean> {
  const build = builds.get(sessionId);
  if (!build || !isAttachable(build.status)) {
    return false;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  for (const frame of build.backlog) {
    if (res.writableEnded) break;
    res.write(frame);
  }

  const keepAlive = setInterval(() => {
    if (!res.writableEnded) {
      res.write(':ping\n\n');
    }
  }, 15000);

  const handleFrame = (frame: string) => {
    if (!res.writableEnded) {
      res.write(frame);
    }
  };

  build.emitter.on('frame', handleFrame);

  req.on('close', () => {
    clearInterval(keepAlive);
    build.emitter.off('frame', handleFrame);
    if (!res.writableEnded) {
      res.end();
    }
  });

  return true;
}
