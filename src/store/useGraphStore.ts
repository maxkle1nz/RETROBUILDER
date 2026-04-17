import { create } from 'zustand';
import { temporal } from 'zundo';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  GraphData,
  NodeData,
  LinkData,
  ProviderInfo,
  ModelInfo,
  SessionSummary,
  SessionSource,
  CodebaseImportMeta,
  SessionDocument,
  KompletusResult,
  KompletusEvent,
} from '../lib/api';

export type AppMode = 'architect' | 'm1nd' | 'builder';
export type SessionSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

interface GraphState {
  activeSessionId: string | null;
  activeSessionName: string | null;
  activeSessionSource: SessionSource | null;
  importMeta: CodebaseImportMeta | null;
  availableSessions: SessionSummary[];
  showSessionLauncher: boolean;
  showEnvConfigModal: boolean;
  sessionSaveState: SessionSaveState;
  graphData: GraphData;
  manifesto: string;
  architecture: string;
  selectedNode: NodeData | null;
  isGenerating: boolean;
  projectContext: string;
  pendingProposal: { text: string; prompt: string } | null;
  appMode: AppMode;
  isRightPanelOpen: boolean;

  // AI Provider/Model Selection
  activeProvider: string;
  activeModel: string | null;
  availableProviders: ProviderInfo[];
  availableModels: ModelInfo[];

  // Blast radius highlighting — set of node IDs that are "illuminated"
  highlightedNodes: Set<string>;
  highlightSource: string | null; // which node triggered the highlight

  // Spotlight: signals GraphView to center on this node
  focusNodeId: string | null;

  // Multi-select for batch operations
  selectedNodes: Set<string>;

  // KOMPLETUS pipeline state
  showKompletusReport: boolean;
  kompletusResult: KompletusResult | null;
  kompletusProgress: KompletusEvent[];
  isKompletusRunning: boolean;

  setGraphData: (data: GraphData) => void;
  setManifesto: (manifesto: string) => void;
  setArchitecture: (architecture: string) => void;
  setSelectedNode: (node: NodeData | null) => void;
  setIsGenerating: (isGenerating: boolean) => void;
  setProjectContext: (context: string) => void;
  setPendingProposal: (proposal: { text: string; prompt: string } | null) => void;
  setAppMode: (mode: AppMode) => void;
  openRightPanel: () => void;
  closeRightPanel: () => void;
  updateNode: (id: string, updates: Partial<NodeData>) => void;
  removeNode: (id: string) => void;
  removeLink: (source: string, target: string) => void;
  addLink: (link: LinkData) => void;
  setHighlightedNodes: (nodeIds: string[], source: string | null) => void;
  clearHighlightedNodes: () => void;
  setFocusNodeId: (id: string) => void;
  clearFocusNodeId: () => void;
  toggleNodeSelection: (nodeId: string) => void;
  clearNodeSelection: () => void;
  setSelectedNodes: (nodeIds: string[]) => void;

  // Provider/Model actions
  setActiveProvider: (provider: string) => void;
  setActiveModel: (model: string | null) => void;
  setAvailableProviders: (providers: ProviderInfo[]) => void;
  setAvailableModels: (models: ModelInfo[]) => void;
  setAvailableSessions: (sessions: SessionSummary[]) => void;
  setSessionSaveState: (state: SessionSaveState) => void;
  setSessionName: (name: string) => void;
  openSessionLauncher: () => void;
  closeSessionLauncher: () => void;
  openEnvConfigModal: () => void;
  closeEnvConfigModal: () => void;
  hydrateSession: (session: SessionDocument) => void;
  clearSession: () => void;

  // KOMPLETUS actions
  openKompletusReport: (result: KompletusResult) => void;
  closeKompletusReport: () => void;
  setKompletusRunning: (running: boolean) => void;
  addKompletusProgress: (event: KompletusEvent) => void;
  clearKompletusProgress: () => void;
  updateKompletusNode: (nodeId: string, updates: Partial<NodeData>) => void;

  // Node Inspector
  inspectorNodeId: string | null;
  openInspector: (nodeId: string) => void;
  closeInspector: () => void;
}

export const useGraphStore = create<GraphState>()(
  persist(
    temporal(
      (set) => ({
        activeSessionId: null,
        activeSessionName: null,
        activeSessionSource: null,
        importMeta: null,
        availableSessions: [],
        showSessionLauncher: true,
        showEnvConfigModal: false,
        sessionSaveState: 'idle',
        graphData: { nodes: [], links: [] },
        manifesto: '',
        architecture: '',
        selectedNode: null,
        isGenerating: false,
        projectContext: '',
        pendingProposal: null,
        appMode: 'architect',
        isRightPanelOpen: false,
        highlightedNodes: new Set<string>(),
        highlightSource: null,
        focusNodeId: null,
        selectedNodes: new Set<string>(),
        activeProvider: 'xai',
        activeModel: null,
        availableProviders: [],
        availableModels: [],
        showKompletusReport: false,
        kompletusResult: null,
        kompletusProgress: [],
        isKompletusRunning: false,
        inspectorNodeId: null,
        setGraphData: (data) => set((state) => ({
          graphData: data,
          sessionSaveState: state.activeSessionId ? 'dirty' : state.sessionSaveState,
        })),
        setManifesto: (manifesto) => set((state) => ({
          manifesto,
          sessionSaveState: state.activeSessionId ? 'dirty' : state.sessionSaveState,
        })),
        setArchitecture: (architecture) => set((state) => ({
          architecture,
          sessionSaveState: state.activeSessionId ? 'dirty' : state.sessionSaveState,
        })),
        setSelectedNode: (node) => set({ selectedNode: node }),
        setIsGenerating: (isGenerating) => set({ isGenerating }),
        setProjectContext: (context) => set((state) => ({
          projectContext: context,
          sessionSaveState: state.activeSessionId ? 'dirty' : state.sessionSaveState,
        })),
        setPendingProposal: (proposal) => set({ pendingProposal: proposal }),
        setAppMode: (mode) => set({ appMode: mode }),
        openRightPanel: () => set({ isRightPanelOpen: true }),
        closeRightPanel: () => set({ isRightPanelOpen: false }),
        updateNode: (id, updates) => set((state) => ({
          graphData: {
            ...state.graphData,
            nodes: state.graphData.nodes.map((n) => n.id === id ? { ...n, ...updates } : n)
          },
          selectedNode: state.selectedNode?.id === id ? { ...state.selectedNode, ...updates } : state.selectedNode,
          sessionSaveState: state.activeSessionId ? 'dirty' : state.sessionSaveState,
        })),
        removeNode: (id) => set((state) => ({
          graphData: {
            nodes: state.graphData.nodes.filter((n) => n.id !== id),
            links: state.graphData.links.filter((l) => l.source !== id && l.target !== id)
          },
          selectedNode: state.selectedNode?.id === id ? null : state.selectedNode,
          isRightPanelOpen: state.selectedNode?.id === id ? false : state.isRightPanelOpen,
          sessionSaveState: state.activeSessionId ? 'dirty' : state.sessionSaveState,
        })),
        removeLink: (source, target) => set((state) => ({
          graphData: {
            ...state.graphData,
            links: state.graphData.links.filter((l) => !(l.source === source && l.target === target))
          },
          sessionSaveState: state.activeSessionId ? 'dirty' : state.sessionSaveState,
        })),
        addLink: (link) => set((state) => {
          const exists = state.graphData.links.some(l => l.source === link.source && l.target === link.target);
          if (exists) return state;
          return {
            graphData: {
              ...state.graphData,
              links: [...state.graphData.links, link]
            },
            sessionSaveState: state.activeSessionId ? 'dirty' : state.sessionSaveState,
          };
        }),
        setHighlightedNodes: (nodeIds, source) => set({ 
          highlightedNodes: new Set(nodeIds),
          highlightSource: source
        }),
        clearHighlightedNodes: () => set({ 
          highlightedNodes: new Set<string>(),
          highlightSource: null
        }),
        setFocusNodeId: (id) => set({ focusNodeId: id }),
        clearFocusNodeId: () => set({ focusNodeId: null }),
        toggleNodeSelection: (nodeId) => set((state) => {
          const next = new Set(state.selectedNodes);
          if (next.has(nodeId)) {
            next.delete(nodeId);
          } else {
            next.add(nodeId);
          }
          return { selectedNodes: next };
        }),
        clearNodeSelection: () => set({ selectedNodes: new Set<string>() }),
        setSelectedNodes: (nodeIds) => set({ selectedNodes: new Set(nodeIds) }),
        setActiveProvider: (provider) => set({ activeProvider: provider }),
        setActiveModel: (model) => set({ activeModel: model }),
        setAvailableProviders: (providers) => set({ availableProviders: providers }),
        setAvailableModels: (models) => set({ availableModels: models }),
        setAvailableSessions: (sessions) => set({ availableSessions: sessions }),
        setSessionSaveState: (sessionSaveState) => set({ sessionSaveState }),
        setSessionName: (activeSessionName) => set((state) => ({
          activeSessionName,
          sessionSaveState: state.activeSessionId ? 'dirty' : state.sessionSaveState,
        })),
        openSessionLauncher: () => set({ showSessionLauncher: true }),
        closeSessionLauncher: () => set({ showSessionLauncher: false }),
        openEnvConfigModal: () => set({ showEnvConfigModal: true }),
        closeEnvConfigModal: () => set({ showEnvConfigModal: false }),
        hydrateSession: (session) => set({
          activeSessionId: session.id,
          activeSessionName: session.name,
          activeSessionSource: session.source,
          importMeta: session.importMeta || null,
          graphData: session.graph,
          manifesto: session.manifesto,
          architecture: session.architecture,
          projectContext: session.projectContext,
          selectedNode: null,
          pendingProposal: null,
          highlightedNodes: new Set<string>(),
          highlightSource: null,
          selectedNodes: new Set<string>(),
          showSessionLauncher: false,
          sessionSaveState: 'saved',
        }),
        clearSession: () => set({
          activeSessionId: null,
          activeSessionName: null,
          activeSessionSource: null,
          importMeta: null,
          graphData: { nodes: [], links: [] },
          manifesto: '',
          architecture: '',
          projectContext: '',
          selectedNode: null,
          pendingProposal: null,
          highlightedNodes: new Set<string>(),
          highlightSource: null,
          selectedNodes: new Set<string>(),
          showSessionLauncher: true,
          sessionSaveState: 'idle',
        }),

        // KOMPLETUS actions
        openKompletusReport: (result) => set({ showKompletusReport: true, kompletusResult: result }),
        closeKompletusReport: () => set({ showKompletusReport: false }),
        setKompletusRunning: (running) => set({ isKompletusRunning: running }),
        addKompletusProgress: (event) => set((state) => ({
          kompletusProgress: [...state.kompletusProgress, event],
        })),
        clearKompletusProgress: () => set({ kompletusProgress: [], kompletusResult: null }),
        updateKompletusNode: (nodeId, updates) => set((state) => {
          if (!state.kompletusResult) return state;
          return {
            kompletusResult: {
              ...state.kompletusResult,
              graph: {
                ...state.kompletusResult.graph,
                nodes: state.kompletusResult.graph.nodes.map(n =>
                  n.id === nodeId ? { ...n, ...updates } : n,
                ),
              },
            },
          };
        }),
        openInspector: (nodeId) => set({ inspectorNodeId: nodeId }),
        closeInspector: () => set({ inspectorNodeId: null }),
      }),
      {
        partialize: (state) => ({
          activeSessionId: state.activeSessionId,
          activeSessionName: state.activeSessionName,
          activeSessionSource: state.activeSessionSource,
          importMeta: state.importMeta,
        })
      }
    ),
    {
      name: 'retrobuilder-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        appMode: state.appMode,
        activeProvider: state.activeProvider,
        activeModel: state.activeModel,
        activeSessionId: state.activeSessionId,
        showSessionLauncher: state.showSessionLauncher,
        showEnvConfigModal: state.showEnvConfigModal,
      }),
    }
  )
);
