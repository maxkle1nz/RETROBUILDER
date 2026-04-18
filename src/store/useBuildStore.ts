import { create } from 'zustand';

export type BuildPhase = 'scaffold' | 'implement' | 'test' | 'integrate';
export type BuildNodeStatus = 'dormant' | 'queued' | 'building' | 'complete' | 'error';

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

export type OMXBuildEvent =
  | { type: 'build_start'; sessionId: string; totalNodes: number; estimatedMs?: number }
  | { type: 'node_start'; nodeId: string; phase: BuildPhase }
  | { type: 'node_progress'; nodeId: string; phase: BuildPhase; pct: number; currentFile?: string }
  | { type: 'node_complete'; nodeId: string; filesWritten: number; linesWritten: number }
  | { type: 'node_error'; nodeId: string; error: string; retrying: boolean }
  | { type: 'edge_activated'; source: string; target: string }
  | { type: 'specular_iteration'; nodeId: string; iteration: number; status: 'testing' | 'failing' | 'fixing' | 'passed'; message: string; fixes?: string[] }
  | { type: 'build_terminal'; status: 'failed' | 'stopped'; message: string }
  | { type: 'build_complete'; totalFiles: number; totalLines: number; elapsedMs: number; specular?: { passed: number; total: number; fixesApplied: number; certified: boolean } };

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
  nodeStates: Record<string, BuildNodeState>;
  globalLogs: BuildLogEntry[];
  buildResult: { totalFiles: number; totalLines: number; elapsedMs: number; specularCertified?: boolean } | null;
  activeNodeId: string | null;

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
    result?: { totalFiles: number; totalLines: number; elapsedMs: number };
    terminalMessage?: string;
  }) => void;
  processBuildEvent: (event: OMXBuildEvent) => void;
}

export const useBuildStore = create<BuildStore>((set, get) => ({
  isBuilding: false,
  buildStatus: 'idle',
  buildProgress: 0,
  totalNodes: 0,
  completedNodes: 0,
  nodeStates: {},
  globalLogs: [],
  buildResult: null,
  activeNodeId: null,

  startBuild: (status = 'running') => set({ isBuilding: status === 'queued' || status === 'running' || status === 'stopping', buildStatus: status, buildResult: null, buildProgress: status === 'queued' ? 0 : 0, completedNodes: 0, globalLogs: [] }),
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
    nodeStates: {},
    globalLogs: [],
    buildResult: null,
    activeNodeId: null,
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
      activeNodeId: remote.activeNodeId ?? state.activeNodeId,
      nodeStates: mergedNodeStates,
      buildResult: remote.result
        ? {
            totalFiles: remote.result.totalFiles,
            totalLines: remote.result.totalLines,
            elapsedMs: remote.result.elapsedMs,
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
          globalLogs: [mkLog(null, 'system', `BUILD INITIATED — ${event.totalNodes} nodes queued for construction`)],
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
        const newCompleted = state.completedNodes + 1;
        const progress = Math.round((newCompleted / state.totalNodes) * 100);
        set({
          nodeStates: ns,
          completedNodes: newCompleted,
          buildProgress: progress,
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
        set({
          isBuilding: false,
          buildStatus: event.specular?.certified === false ? 'failed' : 'succeeded',
          buildProgress: 100,
          buildResult: {
            totalFiles: event.totalFiles,
            totalLines: event.totalLines,
            elapsedMs: event.elapsedMs,
            specularCertified: event.specular?.certified,
          },
          globalLogs: [
            ...state.globalLogs,
            mkLog(null, 'system', `BUILD COMPLETE — ${event.totalFiles} files · ${event.totalLines} lines · ${(event.elapsedMs / 1000).toFixed(1)}s${event.specular ? ` · SPECULAR: ${event.specular.passed}/${event.specular.total} certified (${event.specular.fixesApplied} fixes)` : ''}`),
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
