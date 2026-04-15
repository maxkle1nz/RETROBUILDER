import { create } from 'zustand';
import { temporal } from 'zundo';
import { GraphData, NodeData, LinkData } from '../lib/gemini';

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
  addLink: (link: LinkData) => void;
}

export const useGraphStore = create<GraphState>()(
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
      addLink: (link) => set((state) => {
        // Prevent duplicate links
        const exists = state.graphData.links.some(l => l.source === link.source && l.target === link.target);
        if (exists) return state;
        return {
          graphData: {
            ...state.graphData,
            links: [...state.graphData.links, link]
          }
        };
      })
    }),
    {
      partialize: (state) => ({
        graphData: state.graphData,
        manifesto: state.manifesto,
        architecture: state.architecture
      })
    }
  )
);
