import type { Request, Response } from 'express';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { getRuntimeDirectory, registerSessionCleanupHook, type SessionDocument } from './session-store.js';

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
}

interface OmxStatusResponse {
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
}

export interface OmxBuildStartResponse extends OmxStatusResponse {
  buildId: string;
  status: 'queued' | 'running' | 'stopping' | 'stopped';
  workspacePath: string;
  streamUrl: string;
  statusUrl: string;
  stopUrl: string;
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
  result?: OmxBuildResultSummary;
  terminalMessage?: string;
  error?: string;
}

interface GraphNode {
  id: string;
  label: string;
  type?: string;
  description?: string;
  acceptance_criteria?: string[];
  data_contract?: string;
  error_handling?: string[];
}

interface OmxBuildRequest {
  session: SessionDocument;
  source: 'persisted-session' | 'session-draft';
}

const builds = new Map<string, OmxBuildRecord>();
const SSE_BACKLOG_LIMIT = 200;
const STATUS_FILE = 'omx-status.json';
const EVENT_LOG_FILE = 'omx-events.ndjson';
const CODEX_COMMAND = 'codex exec --json --skip-git-repo-check --sandbox workspace-write';
let codexAvailabilityPromise: Promise<boolean> | null = null;
let codexAvailabilityCachedAt = 0;
const CODEX_AVAILABILITY_TTL_MS = 5_000;

registerSessionCleanupHook(async (sessionId) => {
  await cleanupOmxBuildState(sessionId);
});

function buildStatusFile(runtimeDir: string) {
  return path.join(runtimeDir, STATUS_FILE);
}

function buildEventLogFile(runtimeDir: string) {
  return path.join(runtimeDir, EVENT_LOG_FILE);
}

function getTransport(available: boolean): OmxTransportInfo {
  return {
    kind: 'codex-cli',
    command: CODEX_COMMAND,
    available,
  };
}

function resetCodexAvailabilityCache() {
  codexAvailabilityPromise = null;
  codexAvailabilityCachedAt = 0;
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

function clearForcedStopTimer(build: OmxBuildRecord) {
  if (build.forceStopTimer) {
    clearTimeout(build.forceStopTimer);
    build.forceStopTimer = null;
  }
}

function scheduleForcedStop(build: OmxBuildRecord) {
  clearForcedStopTimer(build);
  build.forceStopTimer = setTimeout(() => {
    if (build.child && !build.child.killed) {
      build.child.kill('SIGKILL');
    }
    build.forceStopTimer = null;
  }, 2_000);
}

function scheduleStoppedBuildCleanup(build: OmxBuildRecord, delayMs = 1_500) {
  if (build.stopCleanupScheduled) {
    return;
  }
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

async function appendEventRecord(runtimeDir: string, payload: object, eventName?: string) {
  try {
    await mkdir(runtimeDir, { recursive: true }).catch(() => {});
    await appendFile(
      buildEventLogFile(runtimeDir),
      `${JSON.stringify({ timestamp: nowIso(), event: eventName || 'message', payload })}\n`,
      'utf8',
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

async function persistBuildSnapshot(build: OmxBuildRecord) {
  if (build.disposed) {
    return;
  }

  const stillActive = builds.get(build.sessionId);
  if (!stillActive || stillActive.buildId !== build.buildId) {
    return;
  }

  await mkdir(build.runtimeDir, { recursive: true }).catch(() => {});
  const snapshot = {
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
    result: build.result,
    terminalMessage: build.terminalMessage,
  };
  await writeFile(buildStatusFile(build.runtimeDir), JSON.stringify(snapshot, null, 2), 'utf8');
}

function emitToSubscribers(build: OmxBuildRecord, payload: object, eventName?: string) {
  if (build.disposed) {
    return;
  }
  const frame = serializeSse(payload, eventName);
  build.backlog.push(frame);
  if (build.backlog.length > SSE_BACKLOG_LIMIT) {
    build.backlog.splice(0, build.backlog.length - SSE_BACKLOG_LIMIT);
  }
  build.emitter.emit('frame', frame);
  void appendEventRecord(build.runtimeDir, payload, eventName).catch((error) => {
    console.warn('[OMX] Failed to append event record:', error);
  });
}

function emitBuildEvent(build: OmxBuildRecord, payload: Record<string, unknown>, eventName?: string) {
  if (build.disposed) {
    return;
  }
  build.updatedAt = nowIso();
  const enrichedPayload = {
    sessionId: build.sessionId,
    buildId: build.buildId,
    source: build.source,
    ...payload,
  };
  emitToSubscribers(build, enrichedPayload, eventName);
  void persistBuildSnapshot(build).catch((error) => {
    console.warn('[OMX] Failed to persist build snapshot:', error);
  });
}

function topoSort(nodes: GraphNode[], links: Array<{ source: string; target: string }>): GraphNode[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const link of links) {
    adjacency.get(link.source)?.push(link.target);
    inDegree.set(link.target, (inDegree.get(link.target) || 0) + 1);
  }

  const queue = nodes.filter((node) => (inDegree.get(node.id) || 0) === 0);
  const ordered: GraphNode[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    ordered.push(node);
    for (const child of adjacency.get(node.id) || []) {
      const nextDegree = (inDegree.get(child) || 1) - 1;
      inDegree.set(child, nextDegree);
      if (nextDegree === 0) {
        const childNode = nodes.find((entry) => entry.id === child);
        if (childNode) queue.push(childNode);
      }
    }
  }

  const seen = new Set(ordered.map((node) => node.id));
  for (const node of nodes) {
    if (!seen.has(node.id)) ordered.push(node);
  }

  return ordered;
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

async function ensureWorkspaceFiles(session: SessionDocument, build: OmxBuildRecord) {
  await rm(build.workspacePath, { force: true, recursive: true }).catch(() => {});
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

  return {
    blueprintPath,
    manifestoPath,
    architecturePath,
    promptPath,
    readmePath,
  };
}

function buildCodexPrompt(session: SessionDocument) {
  const nodeSummary = session.graph.nodes
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
    '- Keep all work inside this workspace.',
    '- Read .omx/session.blueprint.json before editing.',
    '- Materialize files under modules/<slug>/ for each blueprint node.',
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

async function materializeNodeSpec(build: OmxBuildRecord, node: GraphNode) {
  const slug = sanitizeSegment(node.id || node.label);
  const moduleDir = path.join(build.workspacePath, 'modules', slug);
  await mkdir(moduleDir, { recursive: true });

  const specPath = path.join(moduleDir, 'module.spec.json');
  const readmePath = path.join(moduleDir, 'README.md');

  await writeFile(
    specPath,
    JSON.stringify(
      {
        id: node.id,
        label: node.label,
        type: node.type || 'module',
        description: node.description || '',
        dataContract: node.data_contract || '',
        acceptanceCriteria: node.acceptance_criteria || [],
        errorHandling: node.error_handling || [],
      },
      null,
      2,
    ),
    'utf8',
  );

  await writeFile(
    readmePath,
    [
      `# ${node.label}`,
      '',
      node.description || 'No description provided.',
      '',
      '## Data Contract',
      node.data_contract || 'No data contract provided.',
      '',
      '## Acceptance Criteria',
      ...(node.acceptance_criteria?.length ? node.acceptance_criteria.map((entry) => `- ${entry}`) : ['- none']),
      '',
      '## Error Handling',
      ...(node.error_handling?.length ? node.error_handling.map((entry) => `- ${entry}`) : ['- none']),
      '',
    ].join('\n'),
    'utf8',
  );

  emitBuildEvent(build, {
    type: 'node_progress',
    nodeId: node.id,
    phase: 'scaffold',
    pct: 25,
    currentFile: toRelative(build.workspacePath, specPath),
  });

  emitBuildEvent(build, {
    type: 'node_progress',
    nodeId: node.id,
    phase: 'implement',
    pct: 50,
    currentFile: toRelative(build.workspacePath, readmePath),
  });

  return moduleDir;
}

async function runCodexForNode(build: OmxBuildRecord, node: GraphNode, moduleDir: string) {
  if (build.stopRequested) {
    return;
  }

  if (!build.transport.available) {
    throw new Error(buildInactiveCodexMessage());
  }

  const prompt = [
    `Materialize the blueprint node "${node.label}" inside the current workspace.`,
    `Only modify files inside modules/${path.basename(moduleDir)}/ and add compact scaffolding files if needed.`,
    `Respect this description: ${node.description || 'No description provided.'}`,
    `Respect this data contract: ${node.data_contract || 'No data contract provided.'}`,
    `Acceptance criteria: ${(node.acceptance_criteria || []).join(' | ') || 'none'}`,
    `Error handling: ${(node.error_handling || []).join(' | ') || 'none'}`,
    'Create or refine concrete artifacts; do not ask questions; keep the output concise and deterministic.',
  ].join('\n');

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'codex',
      ['exec', '--json', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', build.workspacePath, prompt],
      {
        cwd: build.workspacePath,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    build.child = child;
    let stderrBuffer = '';

    const handleStdout = (chunk: Buffer) => {
      const text = chunk.toString('utf8').trim();
      if (!text) return;
      emitBuildEvent(build, {
        type: 'node_progress',
        nodeId: node.id,
        phase: 'implement',
        pct: 75,
        currentFile: `codex:${text.slice(0, 120)}`,
      });
    };

    const handleStderr = (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stderrBuffer += text;
      if (!text.trim()) return;
      emitBuildEvent(build, {
        type: 'node_progress',
        nodeId: node.id,
        phase: 'test',
        pct: 90,
        currentFile: `codex-stderr:${text.trim().slice(0, 120)}`,
      });
    };

    child.stdout?.on('data', handleStdout);
    child.stderr?.on('data', handleStderr);
    child.once('error', (error) => {
      build.child = null;
      reject(error);
    });
    child.once('exit', (code, signal) => {
      build.child = null;
      if (build.stopRequested) {
        resolve();
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Codex exited with code ${code ?? 'unknown'}${signal ? ` (signal ${signal})` : ''}${stderrBuffer.trim() ? `: ${stderrBuffer.trim()}` : ''}`));
    });
  });
}

function markBuildDisposed(build: OmxBuildRecord) {
  clearForcedStopTimer(build);
  build.disposed = true;
  build.child = null;
  build.stopRequested = true;
  build.emitter.removeAllListeners();
}

function markBuildStopped(build: OmxBuildRecord) {
  build.stopRequested = true;
  build.status = 'stopped';
  build.updatedAt = nowIso();
  build.child = null;
}

function cleanupCompletedBuild(build: OmxBuildRecord) {
  markBuildDisposed(build);
  if (builds.get(build.sessionId)?.buildId === build.buildId) {
    builds.delete(build.sessionId);
  }
}

async function finalizeBuild(build: OmxBuildRecord) {
  const terminalStatus = buildTerminalStatus(build);
  const { totalFiles, totalLines } = await countWorkspaceArtifacts(build.workspacePath).catch(() => ({ totalFiles: 0, totalLines: 0 }));
  const elapsedMs = Date.now() - Date.parse(build.startedAt);

  if (terminalStatus === 'stopped') {
    markBuildStopped(build);
    build.buildProgress = build.completedNodes > 0 || build.totalNodes === 0 ? Math.round((build.completedNodes / Math.max(build.totalNodes, 1)) * 100) : 0;
    build.terminalMessage = 'BUILD STOPPED — operator interrupted OMX materialization.';
    await persistBuildSnapshot(build);
    emitBuildEvent(build, {
      type: 'node_error',
      nodeId: build.currentNodeId || 'system',
      error: 'Build stopped by operator request.',
      retrying: false,
    });
    emitToSubscribers(build, {
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
    build.buildProgress = build.completedNodes > 0 || build.totalNodes === 0 ? Math.round((build.completedNodes / Math.max(build.totalNodes, 1)) * 100) : 0;
    build.terminalMessage = `BUILD FAILED — ${build.error || 'unexpected OMX runtime fault.'}`;
    await persistBuildSnapshot(build);
    emitBuildEvent(build, {
      type: 'node_error',
      nodeId: build.currentNodeId || 'system',
      error: build.error || 'Build failed.',
      retrying: false,
    });
    emitToSubscribers(build, {
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
  build.completedNodes = build.totalNodes;
  build.buildProgress = 100;
  build.result = {
    totalFiles,
    totalLines,
    elapsedMs,
  };
  build.terminalMessage = undefined;
  await persistBuildSnapshot(build);
  emitBuildEvent(build, {
    type: 'build_complete',
    totalFiles,
    totalLines,
    elapsedMs,
  });
  emitToSubscribers(build, {}, 'done');
  cleanupCompletedBuild(build);
}

async function runBuildLifecycle(build: OmxBuildRecord, session: SessionDocument) {
  try {
    if (build.stopRequested) {
      return;
    }

    const orderedNodes = topoSort(session.graph.nodes as GraphNode[], session.graph.links || []);
    const prepared = await ensureWorkspaceFiles(session, build);

    if (build.stopRequested) {
      markBuildStopped(build);
      return;
    }

    build.status = 'running';
    build.updatedAt = nowIso();
    build.totalNodes = orderedNodes.length;
    build.buildProgress = 0;
    await persistBuildSnapshot(build);

    emitBuildEvent(build, {
      type: 'build_start',
      totalNodes: orderedNodes.length,
      workspacePath: build.workspacePath,
      bootstrapFiles: [
        toRelative(build.workspacePath, prepared.blueprintPath),
        toRelative(build.workspacePath, prepared.manifestoPath),
        toRelative(build.workspacePath, prepared.architecturePath),
        toRelative(build.workspacePath, prepared.promptPath),
      ],
    });

    for (const node of orderedNodes) {
      if (build.stopRequested) {
        build.status = 'stopping';
        break;
      }

      build.currentNodeId = node.id;
      build.nodeStates[node.id] = 'building';
      emitBuildEvent(build, {
        type: 'node_start',
        nodeId: node.id,
        phase: 'scaffold',
      });

      const moduleDir = await materializeNodeSpec(build, node);
      await runCodexForNode(build, node, moduleDir);

      if (build.stopRequested) {
        build.status = 'stopping';
        break;
      }

      const { totalFiles, totalLines } = await countWorkspaceArtifacts(moduleDir);
      build.nodeStates[node.id] = 'complete';
      build.completedNodes += 1;
      build.buildProgress = Math.round((build.completedNodes / Math.max(build.totalNodes, 1)) * 100);
      build.currentNodeId = null;
      emitBuildEvent(build, {
        type: 'node_complete',
        nodeId: node.id,
        filesWritten: totalFiles,
        linesWritten: totalLines,
      });
    }
  } catch (error) {
    build.error = error instanceof Error ? error.message : String(error);
  } finally {
    build.child = null;
    await finalizeBuild(build);
  }
}

function statusFromRecord(build: OmxBuildRecord): OmxStatusResponse {
  return {
    sessionId: build.sessionId,
    buildId: build.buildId,
    status: build.status,
    workspacePath: build.workspacePath,
    transport: build.transport,
    source: build.source,
    totalNodes: build.totalNodes,
    completedNodes: build.completedNodes,
    buildProgress: build.buildProgress,
    activeNodeId: build.currentNodeId,
    nodeStates: build.nodeStates,
    result: build.result,
    terminalMessage: build.terminalMessage,
  };
}

function statusFromPersistedFile(persisted: OmxStatusResponse): OmxStatusResponse {
  return {
    ...persisted,
    source: persisted.source || 'persisted-session',
  };
}

async function readPersistedStatus(sessionId: string): Promise<OmxStatusResponse | null> {
  const runtimeDir = getRuntimeDirectory(sessionId);
  const filePath = buildStatusFile(runtimeDir);
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as OmxStatusResponse;
    return parsed;
  } catch {
    return null;
  }
}

export async function cleanupOmxBuildState(sessionId: string) {
  const build = builds.get(sessionId);
  if (build?.child) {
    build.stopRequested = true;
    build.child.kill('SIGTERM');
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
    transport: getTransport(await codexAvailable()),
    source: 'persisted-session',
  };
}

export async function startOmxBuild(input: OmxBuildRequest): Promise<OmxBuildStartResponse> {
  const { session, source } = input;
  const existing = builds.get(session.id);
  if (existing && ['queued', 'running', 'stopping', 'stopped'].includes(existing.status)) {
    return {
      sessionId: existing.sessionId,
      buildId: existing.buildId,
      status: existing.status,
      workspacePath: existing.workspacePath,
      streamUrl: `/api/omx/stream/${session.id}`,
      statusUrl: `/api/omx/status/${session.id}`,
      stopUrl: `/api/omx/stop/${session.id}`,
      transport: existing.transport,
      source: existing.source,
    } as OmxBuildStartResponse;
  }

  const transport = getTransport(await codexAvailable({ fresh: true }));
  if (!transport.available) {
    throw new Error(buildInactiveCodexMessage());
  }

  const buildId = randomUUID();
  const runtimeDir = getRuntimeDirectory(session.id);
  const workspacePath = path.join(runtimeDir, `build-${buildId}`);

  const build: OmxBuildRecord = {
    sessionId: session.id,
    buildId,
    status: 'queued',
    workspacePath,
    runtimeDir,
    transport,
    source,
    emitter: new EventEmitter(),
    backlog: [],
    child: null,
    forceStopTimer: null,
    stopRequested: false,
    disposed: false,
    stopCleanupScheduled: false,
    currentNodeId: null,
    startedAt: nowIso(),
    updatedAt: nowIso(),
    totalNodes: session.graph.nodes.length,
    completedNodes: 0,
    buildProgress: 0,
    nodeStates: Object.fromEntries(session.graph.nodes.map((node) => [node.id, 'dormant'])) as Record<string, 'dormant' | 'queued' | 'building' | 'complete' | 'error'>,
  };

  builds.set(session.id, build);
  await mkdir(runtimeDir, { recursive: true });
  await persistBuildSnapshot(build);

  queueMicrotask(() => {
    void runBuildLifecycle(build, session);
  });

  return {
    sessionId: session.id,
    buildId,
    status: 'queued',
    workspacePath,
    streamUrl: `/api/omx/stream/${session.id}`,
    statusUrl: `/api/omx/status/${session.id}`,
    stopUrl: `/api/omx/stop/${session.id}`,
    transport,
    source,
  };
}

export async function stopOmxBuild(sessionId: string) {
  const build = builds.get(sessionId);
  if (!build || build.status === 'stopped' || build.status === 'succeeded' || build.status === 'failed') {
    return null;
  }

  build.stopRequested = true;
  build.status = build.child ? 'stopping' : 'stopped';
  build.updatedAt = nowIso();
  await persistBuildSnapshot(build);

  if (build.child) {
    build.child.kill('SIGTERM');
    scheduleForcedStop(build);
  }

  if (!build.child) {
    build.terminalMessage = 'BUILD STOPPED — operator interrupted OMX materialization before Codex execution began.';
    await persistBuildSnapshot(build);
    emitBuildEvent(build, {
      type: 'node_error',
      nodeId: build.currentNodeId || 'system',
      error: 'Build stopped before Codex execution began.',
      retrying: false,
    });
    emitToSubscribers(build, {
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
