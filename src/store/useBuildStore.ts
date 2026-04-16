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
  | { type: 'build_complete'; totalFiles: number; totalLines: number; elapsedMs: number };

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
  buildProgress: number;
  totalNodes: number;
  completedNodes: number;
  nodeStates: Record<string, BuildNodeState>;
  globalLogs: BuildLogEntry[];
  buildResult: { totalFiles: number; totalLines: number; elapsedMs: number } | null;
  activeNodeId: string | null;

  startBuild: () => void;
  stopBuild: () => void;
  resetBuild: () => void;
  initNodeStates: (nodeIds: string[]) => void;
  processBuildEvent: (event: OMXBuildEvent) => void;
}

export const useBuildStore = create<BuildStore>((set, get) => ({
  isBuilding: false,
  buildProgress: 0,
  totalNodes: 0,
  completedNodes: 0,
  nodeStates: {},
  globalLogs: [],
  buildResult: null,
  activeNodeId: null,

  startBuild: () => set({ isBuilding: true, buildResult: null, buildProgress: 0, completedNodes: 0, globalLogs: [] }),
  stopBuild: () => set({ isBuilding: false }),
  resetBuild: () => set({
    isBuilding: false,
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

  processBuildEvent: (event: OMXBuildEvent) => {
    const state = get();
    switch (event.type) {
      case 'build_start': {
        set({
          isBuilding: true,
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
        ns[event.nodeId] = {
          ...prev,
          status: event.retrying ? 'building' : 'error',
          logs: [...prev.logs, mkLog(event.nodeId, 'error', `✗ ${event.error}${event.retrying ? ' — retrying...' : ''}`)],
        };
        set({
          nodeStates: ns,
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
          buildProgress: 100,
          buildResult: { totalFiles: event.totalFiles, totalLines: event.totalLines, elapsedMs: event.elapsedMs },
          globalLogs: [
            ...state.globalLogs,
            mkLog(null, 'system', `BUILD COMPLETE — ${event.totalFiles} files · ${event.totalLines} lines · ${(event.elapsedMs / 1000).toFixed(1)}s`),
          ],
        });
        break;
      }
    }
  },
}));
