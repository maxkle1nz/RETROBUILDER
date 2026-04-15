export interface NodeData {
  id: string;
  label: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
  type: 'frontend' | 'backend' | 'database' | 'external' | 'security';
  data_contract?: string;
  decision_rationale?: string;
  group: number;
}

export interface LinkData {
  source: string;
  target: string;
  label?: string;
}

export interface GraphData {
  nodes: NodeData[];
  links: LinkData[];
}

export interface SystemState {
  manifesto: string;
  architecture: string;
  graph: GraphData;
}

export interface AnalysisResult {
  isGood: boolean;
  critique: string;
  optimizedGraph?: GraphData;
}

export async function generateGraphStructure(prompt: string, currentGraph?: GraphData, currentManifesto?: string): Promise<SystemState> {
  const res = await fetch("/api/ai/generateGraphStructure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, currentGraph, currentManifesto })
  });
  if (!res.ok) throw new Error("Failed to generate graph structure");
  return res.json();
}

export async function generateProposal(prompt: string, currentGraph: GraphData, manifesto: string): Promise<string> {
  const res = await fetch("/api/ai/generateProposal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, currentGraph, manifesto })
  });
  if (!res.ok) throw new Error("Failed to generate proposal");
  const data = await res.json();
  return data.proposal;
}

export async function analyzeArchitecture(graph: GraphData, manifesto: string): Promise<AnalysisResult> {
  const res = await fetch("/api/ai/analyzeArchitecture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ graph, manifesto })
  });
  if (!res.ok) throw new Error("Failed to analyze architecture");
  return res.json();
}

export async function performDeepResearch(node: NodeData, projectContext: string): Promise<string> {
  const res = await fetch("/api/ai/performDeepResearch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ node, projectContext })
  });
  if (!res.ok) throw new Error("Failed to perform deep research");
  const data = await res.json();
  return data.research;
}

