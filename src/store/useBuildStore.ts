import { create } from 'zustand';
import type { OmxBuildDocumentation, OmxRunnableManifest } from '../lib/api';

export type BuildPhase = 'scaffold' | 'implement' | 'test' | 'integrate';
export type BuildNodeStatus = 'dormant' | 'queued' | 'building' | 'complete' | 'error';
export type BuildTaskStatus = 'pending' | 'leased' | 'building' | 'verifying' | 'verified' | 'merged' | 'failed' | 'aborted';
export type BuildWaveStatus = 'pending' | 'running' | 'verified' | 'failed' | 'merged';

export interface BuildLogEntry {
  id: string;
  timestamp: number;
  nodeId: string | null;
  type: 'info' | 'success' | 'error' | 'edge' | 'system';
  message: string;
  file?: string;
}

export interface BuildNodeState {
  status: BuildNodeStatus;
  phase: BuildPhase | null;
  pct: number;
  filesWritten: number;
  linesWritten: number;
  currentFile: string | null;
  logs: BuildLogEntry[];
  startedAt: number | null;
  completedAt: number | null;
}

export interface BuildWaveState {
  waveId: string;
  status: BuildWaveStatus;
  taskIds: string[];
}

export interface BuildTaskState {
  taskId: string;
  nodeId: string;
  waveId: string;
  label: string;
  priority: number;
  status: BuildTaskStatus;
  workerId: string | null;
  verifyCommand?: string;
  filesWritten: number;
  linesWritten: number;
}

export interface BuildWorkerState {
  workerId: string;
  taskId: string;
  nodeId: string;
  status: 'starting' | 'running' | 'verifying' | 'idle' | 'failed';
  startedAt: number | null;
  lastMessage: string | null;
}

export interface BuildVerifyReceiptState {
  taskId: string;
  passed: boolean;
  command: string;
  summary: string;
  verifiedAt: number;
}

export interface BuildMergeReceiptState {
  taskId: string;
  applied: boolean;
  appliedPaths: string[];
  rejectedPaths: string[];
  reason?: string;
  ownerCandidates?: string[];
  mergedAt: number;
}

export type BuildDocumentationState = OmxBuildDocumentation;

export interface BuildResumeContext {
  available: boolean;
  reason: 'interrupted' | 'stopped' | 'failed' | null;
  buildId?: string;
  activeWaveId?: string | null;
}

export type OMXBuildEvent =
  | { type: 'build_start'; sessionId: string; totalNodes: number; estimatedMs?: number }
  | { type: 'build_compiled'; wavesTotal: number; workerCount: number; tasks: Array<{ taskId: string; nodeId: string; waveId: string; label: string; status: BuildTaskStatus; priority: number; verifyCommand?: string }>; waves: Array<{ waveId: string; taskIds: string[]; status: BuildWaveStatus }>; ownership?: unknown; ledgerVersion?: number }
  | { type: 'wave_started'; waveId: string; taskIds: string[] }
  | { type: 'task_leased'; taskId: string; nodeId: string; waveId: string; workerId: string }
  | { type: 'worker_started'; workerId: string; taskId: string; nodeId: string }
  | { type: 'artifact_progress'; taskId: string; nodeId: string; workerId: string; phase: BuildPhase; pct: number; path?: string; message?: string }
  | { type: 'worker_log'; workerId: string; taskId: string; nodeId: string; level: 'info' | 'warning'; message: string }
  | { type: 'warning'; workerId?: string; taskId?: string; nodeId?: string; message: string }
  | { type: 'verify_started'; taskId: string; nodeId: string; workerId: string; command: string }
  | { type: 'verify_passed'; taskId: string; nodeId: string; workerId: string; command: string; summary: string }
  | { type: 'verify_failed'; taskId: string; nodeId: string; workerId: string; command: string; error: string }
  | { type: 'merge_started'; taskId: string; nodeId: string; workerId: string }
  | { type: 'merge_passed'; taskId: string; nodeId: string; workerId: string; appliedPaths: string[] }
  | { type: 'merge_rejected'; taskId: string; nodeId: string; workerId: string; rejectedPaths: string[]; reason?: string; ownerCandidates?: string[] }
  | { type: 'task_completed'; taskId: string; nodeId: string; waveId: string; filesWritten: number; linesWritten: number }
  | { type: 'resume_rehydrated'; reason: string; activeWaveId?: string | null }
  | { type: 'operational_message'; role: 'user' | 'system'; action: string; message: string }
  | { type: 'node_start'; nodeId: string; phase: BuildPhase }
  | { type: 'node_progress'; nodeId: string; phase: BuildPhase; pct: number; currentFile?: string }
  | { type: 'node_complete'; nodeId: string; filesWritten: number; linesWritten: number }
  | { type: 'node_error'; nodeId: string; error: string; retrying: boolean }
  | { type: 'edge_activated'; source: string; target: string }
  | { type: 'specular_iteration'; nodeId: string; iteration: number; status: 'testing' | 'failing' | 'fixing' | 'passed'; message: string; fixes?: string[] }
  | { type: 'build_terminal'; status: 'failed' | 'stopped'; message: string }
  | { type: 'build_complete'; status?: 'succeeded' | 'failed'; totalFiles: number; totalLines: number; elapsedMs: number; documentation?: BuildDocumentationState; runnableManifest?: OmxRunnableManifest; specular?: { passed: number; total: number; fixesApplied: number; gateApproved?: boolean; certified?: boolean }; systemVerify?: { status: 'pending' | 'passed' | 'failed' | 'not_available'; command?: string; summary?: string } };

const defaultNodeState = (): BuildNodeState => ({
  status: 'dormant',
  phase: null,
  pct: 0,
  filesWritten: 0,
  linesWritten: 0,
  currentFile: null,
  logs: [],
  startedAt: null,
  completedAt: null,
});

let logCounter = 0;
const mkLog = (
  nodeId: string | null,
  type: BuildLogEntry['type'],
  message: string,
  file?: string,
): BuildLogEntry => ({
  id: `log-${++logCounter}-${Date.now()}`,
  timestamp: Date.now(),
  nodeId,
  type,
  message,
  file,
});

interface BuildStore {
  isBuilding: boolean;
  buildStatus: 'idle' | 'queued' | 'running' | 'stopping' | 'succeeded' | 'failed' | 'stopped';
  buildProgress: number;
  totalNodes: number;
  completedNodes: number;
  resumeAvailable: boolean;
  resumeReason: 'interrupted' | 'stopped' | 'failed' | null;
  nodeStates: Record<string, BuildNodeState>;
  globalLogs: BuildLogEntry[];
  buildResult: {
    totalFiles: number;
    totalLines: number;
    elapsedMs: number;
    documentation?: BuildDocumentationState;
    runnableManifest?: OmxRunnableManifest;
    specularGateApproved?: boolean;
    systemVerify?: {
      status: 'pending' | 'passed' | 'failed' | 'not_available';
      command?: string;
      summary?: string;
    };
    designProfile?: '21st';
    designGateStatus?: 'pending' | 'passed' | 'failed';
    designScore?: number;
    designFindings?: string[];
    designEvidence?: string[];
    resumeAvailable?: boolean;
    resumeReason?: 'interrupted' | 'stopped' | 'failed';
  } | null;
  activeNodeId: string | null;
  waves: Record<string, BuildWaveState>;
  tasks: Record<string, BuildTaskState>;
  workers: Record<string, BuildWorkerState>;
  verifyReceipts: Record<string, BuildVerifyReceiptState>;
  mergeReceipts: Record<string, BuildMergeReceiptState>;
  resumeContext: BuildResumeContext;
  activeWaveId: string | null;
  activeTasks: string[];
  wavesTotal: number;
  wavesCompleted: number;
  workerCount: number;
  verifyPendingCount: number;
  mergePendingCount: number;
  ledgerVersion: number;

  startBuild: (status?: 'queued' | 'running' | 'stopping' | 'stopped') => void;
  stopBuild: (status?: 'idle' | 'queued' | 'running' | 'stopping' | 'succeeded' | 'failed' | 'stopped') => void;
  resetBuild: () => void;
  initNodeStates: (nodeIds: string[]) => void;
  hydrateBuildLifecycle: (remote: {
    status: 'idle' | 'queued' | 'running' | 'succeeded' | 'failed' | 'stopping' | 'stopped';
    totalNodes?: number;
    completedNodes?: number;
    buildProgress?: number;
    activeNodeId?: string | null;
    nodeStates?: Record<string, 'dormant' | 'queued' | 'building' | 'complete' | 'error'>;
    result?: { totalFiles: number; totalLines: number; elapsedMs: number; documentation?: BuildDocumentationState; runnableManifest?: OmxRunnableManifest; systemVerify?: { status: 'pending' | 'passed' | 'failed' | 'not_available'; command?: string; summary?: string } };
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
    buildId?: string;
    verifyReceipts?: Record<string, { taskId: string; passed: boolean; command: string; summary: string; verifiedAt: string }>;
    mergeReceipts?: Record<string, { taskId: string; applied: boolean; appliedPaths: string[]; rejectedPaths: string[]; reason?: string; ownerCandidates?: string[]; mergedAt: string }>;
  }) => void;
  processBuildEvent: (event: OMXBuildEvent) => void;
}

export const useBuildStore = create<BuildStore>((set, get) => ({
  isBuilding: false,
  buildStatus: 'idle',
  buildProgress: 0,
  totalNodes: 0,
  completedNodes: 0,
  resumeAvailable: false,
  resumeReason: null,
  nodeStates: {},
  globalLogs: [],
  buildResult: null,
  activeNodeId: null,
  waves: {},
  tasks: {},
  workers: {},
  verifyReceipts: {},
  mergeReceipts: {},
  resumeContext: { available: false, reason: null },
  activeWaveId: null,
  activeTasks: [],
  wavesTotal: 0,
  wavesCompleted: 0,
  workerCount: 0,
  verifyPendingCount: 0,
  mergePendingCount: 0,
  ledgerVersion: 1,

  startBuild: (status = 'running') => set({
    isBuilding: status === 'queued' || status === 'running' || status === 'stopping',
    buildStatus: status,
    buildResult: null,
    buildProgress: 0,
    completedNodes: 0,
    globalLogs: [],
    waves: {},
    tasks: {},
    workers: {},
    verifyReceipts: {},
    mergeReceipts: {},
    activeWaveId: null,
    activeTasks: [],
    wavesTotal: 0,
    wavesCompleted: 0,
    workerCount: 0,
    verifyPendingCount: 0,
    mergePendingCount: 0,
  }),
  stopBuild: (buildStatus) => set((state) => ({
    isBuilding: false,
    buildStatus: buildStatus ?? (state.buildStatus === 'running' ? 'idle' : state.buildStatus),
  })),
  resetBuild: () => set({
    isBuilding: false,
    buildStatus: 'idle',
    buildProgress: 0,
    totalNodes: 0,
    completedNodes: 0,
    resumeAvailable: false,
    resumeReason: null,
    nodeStates: {},
    globalLogs: [],
    buildResult: null,
    activeNodeId: null,
    waves: {},
    tasks: {},
    workers: {},
    verifyReceipts: {},
    mergeReceipts: {},
    resumeContext: { available: false, reason: null },
    activeWaveId: null,
    activeTasks: [],
    wavesTotal: 0,
    wavesCompleted: 0,
    workerCount: 0,
    verifyPendingCount: 0,
    mergePendingCount: 0,
    ledgerVersion: 1,
  }),

  initNodeStates: (nodeIds: string[]) => {
    const nodeStates: Record<string, BuildNodeState> = {};
    for (const id of nodeIds) nodeStates[id] = defaultNodeState();
    set({ nodeStates, totalNodes: nodeIds.length });
  },

  hydrateBuildLifecycle: (remote) => set((state) => {
    const mergedNodeStates: Record<string, BuildNodeState> = remote.nodeStates
      ? Object.fromEntries(
          Object.entries({ ...state.nodeStates, ...remote.nodeStates }).map(([nodeId, status]) => {
            const nextStatus = status as BuildNodeStatus;
            const previous = state.nodeStates[nodeId] || defaultNodeState();
            return [
              nodeId,
              {
                ...previous,
                status: nextStatus,
                pct: nextStatus === 'complete' ? 100 : nextStatus === 'queued' ? 0 : previous.pct,
                completedAt: nextStatus === 'complete' ? previous.completedAt ?? Date.now() : previous.completedAt,
              },
            ];
          }),
        ) as Record<string, BuildNodeState>
      : state.nodeStates;

    const terminalLog =
      remote.terminalMessage && !state.globalLogs.some((entry) => entry.message === remote.terminalMessage)
        ? [...state.globalLogs, mkLog(null, 'system', remote.terminalMessage)]
        : state.globalLogs;

    return {
      isBuilding: remote.status === 'queued' || remote.status === 'running' || remote.status === 'stopping',
      buildStatus: remote.status,
      totalNodes: remote.totalNodes ?? state.totalNodes,
      completedNodes: remote.completedNodes ?? state.completedNodes,
      resumeAvailable: remote.resumeAvailable ?? false,
      resumeReason: remote.resumeReason ?? null,
      resumeContext: {
        available: remote.resumeAvailable ?? false,
        reason: remote.resumeReason ?? null,
        buildId: remote.buildId,
        activeWaveId: remote.activeWaveId ?? null,
      },
      activeNodeId: remote.activeNodeId ?? state.activeNodeId,
      activeWaveId: remote.activeWaveId ?? state.activeWaveId,
      activeTasks: remote.activeTasks ?? state.activeTasks,
      nodeStates: mergedNodeStates,
      buildResult: remote.result
        ? {
            totalFiles: remote.result.totalFiles,
            totalLines: remote.result.totalLines,
            elapsedMs: remote.result.elapsedMs,
            documentation: remote.result.documentation,
            runnableManifest: remote.result.runnableManifest ?? remote.result.documentation?.runnableManifest,
            systemVerify: remote.result.systemVerify,
            designProfile: remote.designProfile,
            designGateStatus: remote.designGateStatus,
            designScore: remote.designScore,
            designFindings: remote.designFindings,
            designEvidence: remote.designEvidence,
            resumeAvailable: remote.resumeAvailable,
            resumeReason: remote.resumeReason,
          }
        : remote.status === 'failed' || remote.status === 'stopped'
          ? state.buildResult
          : remote.status === 'queued' || remote.status === 'running' || remote.status === 'stopping'
            ? null
            : state.buildResult,
      buildProgress:
        remote.buildProgress ??
        (remote.status === 'queued'
          ? 0
          : remote.status === 'succeeded'
            ? 100
            : state.buildProgress),
      globalLogs: terminalLog,
      wavesTotal: remote.wavesTotal ?? state.wavesTotal,
      wavesCompleted: remote.wavesCompleted ?? state.wavesCompleted,
      workerCount: remote.workerCount ?? state.workerCount,
      verifyPendingCount: remote.verifyPendingCount ?? state.verifyPendingCount,
      mergePendingCount: remote.mergePendingCount ?? state.mergePendingCount,
      ledgerVersion: remote.ledgerVersion ?? state.ledgerVersion,
      verifyReceipts: remote.verifyReceipts
        ? Object.fromEntries(
            Object.entries(remote.verifyReceipts).map(([taskId, receipt]) => [
              taskId,
              {
                ...receipt,
                verifiedAt: Date.parse(receipt.verifiedAt) || Date.now(),
              },
            ]),
          ) as Record<string, BuildVerifyReceiptState>
        : state.verifyReceipts,
      mergeReceipts: remote.mergeReceipts
        ? Object.fromEntries(
            Object.entries(remote.mergeReceipts).map(([taskId, receipt]) => [
              taskId,
              {
                ...receipt,
                mergedAt: Date.parse(receipt.mergedAt) || Date.now(),
              },
            ]),
          ) as Record<string, BuildMergeReceiptState>
        : state.mergeReceipts,
    };
  }),

  processBuildEvent: (event: OMXBuildEvent) => {
    const state = get();
    switch (event.type) {
      case 'build_start': {
        set({
          isBuilding: true,
          buildStatus: 'running',
          totalNodes: event.totalNodes,
          globalLogs: [...state.globalLogs, mkLog(null, 'system', `BUILD INITIATED — ${event.totalNodes} tasks queued for construction`)],
        });
        break;
      }
      case 'build_compiled': {
        const waves = Object.fromEntries(event.waves.map((wave) => [wave.waveId, { ...wave }])) as Record<string, BuildWaveState>;
        const tasks = Object.fromEntries(event.tasks.map((task) => [task.taskId, {
          taskId: task.taskId,
          nodeId: task.nodeId,
          waveId: task.waveId,
          label: task.label,
          priority: task.priority,
          status: task.status,
          workerId: null,
          verifyCommand: task.verifyCommand,
          filesWritten: 0,
          linesWritten: 0,
        }])) as Record<string, BuildTaskState>;
        set({
          waves,
          tasks,
          workerCount: event.workerCount,
          wavesTotal: event.wavesTotal,
          ledgerVersion: event.ledgerVersion || state.ledgerVersion,
          globalLogs: [...state.globalLogs, mkLog(null, 'system', `COMPILED — ${event.wavesTotal} waves · ${event.tasks.length} tasks · ${event.workerCount} worker(s)`)],
        });
        break;
      }
      case 'wave_started': {
        const waves = { ...state.waves };
        waves[event.waveId] = {
          waveId: event.waveId,
          taskIds: event.taskIds,
          status: 'running',
        };
        set({
          waves,
          activeWaveId: event.waveId,
          activeTasks: event.taskIds,
          globalLogs: [...state.globalLogs, mkLog(null, 'system', `WAVE STARTED — ${event.waveId} · ${event.taskIds.length} task(s)`)],
        });
        break;
      }
      case 'task_leased': {
        const tasks = { ...state.tasks };
        const prev = tasks[event.taskId];
        if (prev) {
          tasks[event.taskId] = { ...prev, status: 'leased', workerId: event.workerId };
        }
        set({
          tasks,
          activeTasks: [event.taskId],
          globalLogs: [...state.globalLogs, mkLog(event.nodeId, 'info', `LEASED ${event.taskId} → ${event.workerId}`)],
        });
        break;
      }
      case 'worker_started': {
        const workers: Record<string, BuildWorkerState> = {
          ...state.workers,
          [event.workerId]: {
            workerId: event.workerId,
            taskId: event.taskId,
            nodeId: event.nodeId,
            status: 'running',
            startedAt: Date.now(),
            lastMessage: null,
          },
        };
        const tasks = { ...state.tasks };
        const prev = tasks[event.taskId];
        if (prev) tasks[event.taskId] = { ...prev, status: 'building', workerId: event.workerId };
        set({ workers, tasks });
        break;
      }
      case 'artifact_progress': {
        const tasks = { ...state.tasks };
        const prevTask = tasks[event.taskId];
        if (prevTask) {
          tasks[event.taskId] = { ...prevTask, status: 'building' };
        }
        const ns = { ...state.nodeStates };
        const prev = ns[event.nodeId] || defaultNodeState();
        const newLog = event.path ? mkLog(event.nodeId, 'info', event.message || `Artifact: ${event.path}`, event.path) : mkLog(event.nodeId, 'info', event.message || 'Artifact progress');
        ns[event.nodeId] = {
          ...prev,
          status: 'building',
          phase: event.phase,
          pct: event.pct,
          currentFile: event.path || prev.currentFile,
          logs: [...prev.logs, newLog],
        };
        const workers = { ...state.workers };
        if (workers[event.workerId]) {
          workers[event.workerId] = { ...workers[event.workerId], lastMessage: event.message || event.path || null };
        }
        set({ nodeStates: ns, tasks, workers });
        break;
      }
      case 'worker_log':
      case 'warning': {
        const logType: BuildLogEntry['type'] = event.type === 'warning' || event.level === 'warning' ? 'error' : 'info';
        const workers = 'workerId' in event && event.workerId ? { ...state.workers } : state.workers;
        if ('workerId' in event && event.workerId && workers[event.workerId]) {
          workers[event.workerId] = { ...workers[event.workerId], lastMessage: event.message } as BuildWorkerState;
        }
        set({
          workers,
          globalLogs: [...state.globalLogs, mkLog(('nodeId' in event ? event.nodeId || null : null), logType, event.message)],
        });
        break;
      }
      case 'verify_started': {
        const tasks = { ...state.tasks };
        const prev = tasks[event.taskId];
        if (prev) tasks[event.taskId] = { ...prev, status: 'verifying' };
        const workers = { ...state.workers };
        if (workers[event.workerId]) workers[event.workerId] = { ...workers[event.workerId], status: 'verifying', lastMessage: event.command };
        set({
          tasks,
          workers,
          verifyPendingCount: Math.max(0, state.verifyPendingCount + 1),
          globalLogs: [...state.globalLogs, mkLog(event.nodeId, 'info', `VERIFY — ${event.command}`)],
        });
        break;
      }
      case 'verify_passed': {
        const tasks = { ...state.tasks };
        const prev = tasks[event.taskId];
        if (prev) tasks[event.taskId] = { ...prev, status: 'verified' };
        const verifyReceipts = {
          ...state.verifyReceipts,
          [event.taskId]: {
            taskId: event.taskId,
            passed: true,
            command: event.command,
            summary: event.summary,
            verifiedAt: Date.now(),
          },
        };
        set({
          tasks,
          verifyReceipts,
          verifyPendingCount: Math.max(0, state.verifyPendingCount - 1),
          mergePendingCount: state.mergePendingCount + 1,
          globalLogs: [...state.globalLogs, mkLog(event.nodeId, 'success', `VERIFY PASSED — ${event.summary}`)],
        });
        break;
      }
      case 'verify_failed': {
        const tasks = { ...state.tasks };
        const prev = tasks[event.taskId];
        if (prev) tasks[event.taskId] = { ...prev, status: 'failed' };
        const waves = { ...state.waves };
        const failedWaveId = prev?.waveId;
        if (failedWaveId && waves[failedWaveId]) {
          waves[failedWaveId] = { ...waves[failedWaveId], status: 'failed' };
        }
        const verifyReceipts = {
          ...state.verifyReceipts,
          [event.taskId]: {
            taskId: event.taskId,
            passed: false,
            command: event.command,
            summary: event.error,
            verifiedAt: Date.now(),
          },
        };
        set({
          tasks,
          waves,
          verifyReceipts,
          verifyPendingCount: Math.max(0, state.verifyPendingCount - 1),
          buildStatus: 'failed',
          globalLogs: [...state.globalLogs, mkLog(event.nodeId, 'error', `VERIFY FAILED — ${event.error}`)],
        });
        break;
      }
      case 'merge_started': {
        set({
          globalLogs: [...state.globalLogs, mkLog(event.nodeId, 'info', `MERGE STARTED — ${event.taskId}`)],
        });
        break;
      }
      case 'merge_passed': {
        const mergeReceipts = {
          ...state.mergeReceipts,
          [event.taskId]: {
            taskId: event.taskId,
            applied: true,
            appliedPaths: event.appliedPaths,
            rejectedPaths: [],
            mergedAt: Date.now(),
          },
        };
        const tasks = { ...state.tasks };
        const prev = tasks[event.taskId];
        if (prev) tasks[event.taskId] = { ...prev, status: 'merged' };
        const waves = { ...state.waves };
        const mergedWaveId = prev?.waveId;
        if (mergedWaveId && waves[mergedWaveId]) {
          const waveTaskIds = waves[mergedWaveId].taskIds;
          const nextTasks = { ...tasks };
          const waveIsMerged = waveTaskIds.every((taskId) => nextTasks[taskId]?.status === 'merged');
          waves[mergedWaveId] = { ...waves[mergedWaveId], status: waveIsMerged ? 'merged' : waves[mergedWaveId].status };
        }
        const wavesCompleted = Object.values(waves).filter((wave) => wave.status === 'merged').length;
        set({
          tasks,
          waves,
          wavesCompleted,
          mergeReceipts,
          mergePendingCount: Math.max(0, state.mergePendingCount - 1),
          globalLogs: [...state.globalLogs, mkLog(event.nodeId, 'success', `MERGE PASSED — ${event.appliedPaths.length} path(s)`)],
        });
        break;
      }
      case 'merge_rejected': {
        const mergeReceipts = {
          ...state.mergeReceipts,
          [event.taskId]: {
            taskId: event.taskId,
            applied: false,
            appliedPaths: [],
            rejectedPaths: event.rejectedPaths,
            reason: event.reason,
            ownerCandidates: event.ownerCandidates,
            mergedAt: Date.now(),
          },
        };
        const tasks = { ...state.tasks };
        const prev = tasks[event.taskId];
        if (prev) tasks[event.taskId] = { ...prev, status: 'failed' };
        const waves = { ...state.waves };
        const failedWaveId = prev?.waveId;
        if (failedWaveId && waves[failedWaveId]) {
          waves[failedWaveId] = { ...waves[failedWaveId], status: 'failed' };
        }
        set({
          tasks,
          waves,
          mergeReceipts,
          mergePendingCount: Math.max(0, state.mergePendingCount - 1),
          buildStatus: 'failed',
          globalLogs: [...state.globalLogs, mkLog(event.nodeId, 'error', `MERGE REJECTED — ${event.reason || event.rejectedPaths.join(', ')}`)],
        });
        break;
      }
      case 'task_completed': {
        const tasks = { ...state.tasks };
        const prev = tasks[event.taskId];
        if (prev) {
          tasks[event.taskId] = {
            ...prev,
            status: 'merged',
            filesWritten: event.filesWritten,
            linesWritten: event.linesWritten,
          };
        }
        const nextCompleted = state.completedNodes + 1;
        const progress = Math.round((nextCompleted / Math.max(state.totalNodes || 1, 1)) * 100);
        set({
          tasks,
          completedNodes: nextCompleted,
          buildProgress: progress,
          activeTasks: [],
        });
        break;
      }
      case 'resume_rehydrated': {
        set({
          resumeContext: {
            ...state.resumeContext,
            activeWaveId: event.activeWaveId ?? null,
          },
          globalLogs: [...state.globalLogs, mkLog(null, 'system', `RESUME REHYDRATED — ${event.reason}`)],
        });
        break;
      }
      case 'operational_message': {
        set({
          globalLogs: [...state.globalLogs, mkLog(null, event.role === 'system' ? 'system' : 'info', `${event.role.toUpperCase()} ${event.action} — ${event.message}`)],
        });
        break;
      }
      case 'node_start': {
        const ns = { ...state.nodeStates };
        ns[event.nodeId] = {
          ...defaultNodeState(),
          status: 'building',
          phase: event.phase,
          startedAt: Date.now(),
          logs: [mkLog(event.nodeId, 'info', `Starting ${event.phase}...`)],
        };
        set({
          nodeStates: ns,
          activeNodeId: event.nodeId,
          globalLogs: [...state.globalLogs, mkLog(event.nodeId, 'info', `● ${event.nodeId} — ${event.phase}`)],
        });
        break;
      }
      case 'node_progress': {
        const ns = { ...state.nodeStates };
        const prev = ns[event.nodeId] || defaultNodeState();
        const newLog = event.currentFile
          ? mkLog(event.nodeId, 'info', `Writing: ${event.currentFile}`, event.currentFile)
          : null;
        ns[event.nodeId] = {
          ...prev,
          status: 'building',
          phase: event.phase,
          pct: event.pct,
          currentFile: event.currentFile || prev.currentFile,
          logs: newLog ? [...prev.logs, newLog] : prev.logs,
        };
        set({ nodeStates: ns });
        break;
      }
      case 'node_complete': {
        const ns = { ...state.nodeStates };
        const prev = ns[event.nodeId] || defaultNodeState();
        ns[event.nodeId] = {
          ...prev,
          status: 'complete',
          phase: 'integrate',
          pct: 100,
          filesWritten: event.filesWritten,
          linesWritten: event.linesWritten,
          currentFile: null,
          completedAt: Date.now(),
          logs: [...prev.logs, mkLog(event.nodeId, 'success', `✓ ${event.filesWritten} files · ${event.linesWritten} lines`)],
        };
        set({
          nodeStates: ns,
          globalLogs: [...state.globalLogs, mkLog(event.nodeId, 'success', `✓ ${event.nodeId} — ${event.filesWritten} files · ${event.linesWritten} lines`)],
        });
        break;
      }
      case 'node_error': {
        const ns = { ...state.nodeStates };
        const prev = ns[event.nodeId] || defaultNodeState();
        const nextStatus = event.retrying ? 'running' : 'failed';
        ns[event.nodeId] = {
          ...prev,
          status: event.retrying ? 'building' : 'error',
          logs: [...prev.logs, mkLog(event.nodeId, 'error', `✗ ${event.error}${event.retrying ? ' — retrying...' : ''}`)],
        };
        set({
          nodeStates: ns,
          buildStatus: nextStatus,
          globalLogs: [...state.globalLogs, mkLog(event.nodeId, 'error', `✗ ${event.nodeId} — ${event.error}`)],
        });
        break;
      }
      case 'edge_activated': {
        const ns = { ...state.nodeStates };
        if (ns[event.target] && ns[event.target].status === 'dormant') {
          ns[event.target] = { ...ns[event.target], status: 'queued' };
        }
        set({
          nodeStates: ns,
          globalLogs: [...state.globalLogs, mkLog(null, 'edge', `⟶ ${event.source} → ${event.target}`)],
        });
        break;
      }
      case 'build_complete': {
        const specularGateApproved = event.specular?.gateApproved ?? event.specular?.certified ?? true;
        const systemVerifyFailed = event.systemVerify?.status === 'failed';
        const documentationQualityFailed = event.documentation?.quality.status === 'failed';
        const terminalStatus = event.status || (specularGateApproved === false || systemVerifyFailed || documentationQualityFailed ? 'failed' : 'succeeded');
        set({
          isBuilding: false,
          buildStatus: terminalStatus,
          buildProgress: 100,
          buildResult: {
            totalFiles: event.totalFiles,
            totalLines: event.totalLines,
            elapsedMs: event.elapsedMs,
            documentation: event.documentation,
            runnableManifest: event.runnableManifest ?? event.documentation?.runnableManifest,
            specularGateApproved,
            systemVerify: event.systemVerify,
            designProfile: '21st',
            designGateStatus: specularGateApproved === false ? 'failed' : 'passed',
          },
          globalLogs: [
            ...state.globalLogs,
            mkLog(null, 'system', `BUILD COMPLETE — ${event.totalFiles} files · ${event.totalLines} lines · ${(event.elapsedMs / 1000).toFixed(1)}s${event.specular ? ` · SPECULAR gate-approved: ${event.specular.passed}/${event.specular.total} (${event.specular.fixesApplied} fixes)` : ''}`),
          ],
        });
        break;
      }
      case 'specular_iteration': {
        const statusIcons: Record<string, string> = {
          testing: '🔍',
          failing: '❌',
          fixing: '🔧',
          passed: '✅',
        };
        const icon = statusIcons[event.status] || '•';
        set({
          globalLogs: [
            ...state.globalLogs,
            mkLog(
              event.nodeId,
              event.status === 'passed' ? 'success' : event.status === 'failing' ? 'error' : 'info',
              `${icon} SPECULAR [${event.iteration}] ${event.nodeId} — ${event.message}`,
            ),
          ],
        });
        break;
      }
      case 'build_terminal': {
        set({
          isBuilding: false,
          buildStatus: event.status,
          globalLogs: [...state.globalLogs, mkLog(null, 'system', event.message)],
        });
        break;
      }
    }
  },
}));
