import { create } from 'zustand';
import { temporal } from 'zundo';
import { persist, createJSONStorage } from 'zustand/middleware';
import { GraphData, NodeData, LinkData, ProviderInfo, ModelInfo } from '../lib/api';

export type AppMode = 'architect' | 'm1nd';

interface GraphState {
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

  // Provider/Model actions
  setActiveProvider: (provider: string) => void;
  setActiveModel: (model: string | null) => void;
  setAvailableProviders: (providers: ProviderInfo[]) => void;
  setAvailableModels: (models: ModelInfo[]) => void;
}

export const useGraphStore = create<GraphState>()(
  persist(
    temporal(
      (set) => ({
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
        activeProvider: 'xai',
        activeModel: null,
        availableProviders: [],
        availableModels: [],
        setGraphData: (data) => set({ graphData: data }),
        setManifesto: (manifesto) => set({ manifesto }),
        setArchitecture: (architecture) => set({ architecture }),
        setSelectedNode: (node) => set({ selectedNode: node }),
        setIsGenerating: (isGenerating) => set({ isGenerating }),
        setProjectContext: (context) => set({ projectContext: context }),
        setPendingProposal: (proposal) => set({ pendingProposal: proposal }),
        setAppMode: (mode) => set({ appMode: mode }),
        openRightPanel: () => set({ isRightPanelOpen: true }),
        closeRightPanel: () => set({ isRightPanelOpen: false }),
        updateNode: (id, updates) => set((state) => ({
          graphData: {
            ...state.graphData,
            nodes: state.graphData.nodes.map((n) => n.id === id ? { ...n, ...updates } : n)
          },
          selectedNode: state.selectedNode?.id === id ? { ...state.selectedNode, ...updates } : state.selectedNode
        })),
        removeNode: (id) => set((state) => ({
          graphData: {
            nodes: state.graphData.nodes.filter((n) => n.id !== id),
            links: state.graphData.links.filter((l) => l.source !== id && l.target !== id)
          },
          selectedNode: state.selectedNode?.id === id ? null : state.selectedNode,
          isRightPanelOpen: state.selectedNode?.id === id ? false : state.isRightPanelOpen
        })),
        removeLink: (source, target) => set((state) => ({
          graphData: {
            ...state.graphData,
            links: state.graphData.links.filter((l) => !(l.source === source && l.target === target))
          }
        })),
        addLink: (link) => set((state) => {
          const exists = state.graphData.links.some(l => l.source === link.source && l.target === link.target);
          if (exists) return state;
          return {
            graphData: {
              ...state.graphData,
              links: [...state.graphData.links, link]
            }
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
        setActiveProvider: (provider) => set({ activeProvider: provider }),
        setActiveModel: (model) => set({ activeModel: model }),
        setAvailableProviders: (providers) => set({ availableProviders: providers }),
        setAvailableModels: (models) => set({ availableModels: models }),
      }),
      {
        partialize: (state) => ({
          graphData: state.graphData,
          manifesto: state.manifesto,
          architecture: state.architecture
        })
      }
    ),
    {
      name: 'retrobuilder-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        graphData: state.graphData,
        manifesto: state.manifesto,
        architecture: state.architecture,
        projectContext: state.projectContext,
        appMode: state.appMode,
        activeProvider: state.activeProvider,
        activeModel: state.activeModel,
      }),
    }
  )
);
