/**
 * RETROBUILDER API Client
 * 
 * Frontend API functions for communicating with the Express backend.
 * Provider-agnostic — the backend handles AI provider selection via SSOT.
 * Model selection is passed through from the frontend store.
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface NodeData {
  id: string;
  label: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
  type: 'frontend' | 'backend' | 'database' | 'external' | 'security';
  data_contract?: string;
  decision_rationale?: string;
  acceptance_criteria?: string[];
  error_handling?: string[];
  priority?: number;
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

export interface ProviderInfo {
  name: string;
  label: string;
  defaultModel: string | null;
  active: boolean;
  error?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

// ─── Provider & Model Config API ─────────────────────────────────────

export async function fetchProviders(): Promise<{ providers: ProviderInfo[]; active: string }> {
  const res = await fetch("/api/ai/providers");
  if (!res.ok) throw new Error("Failed to fetch providers");
  return res.json();
}

export async function fetchModels(provider?: string): Promise<{ provider: string; defaultModel: string; models: ModelInfo[] }> {
  const url = provider ? `/api/ai/models?provider=${provider}` : "/api/ai/models";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch models");
  return res.json();
}

export async function switchProvider(providerName: string): Promise<{ success: boolean; provider: string; label: string; defaultModel: string }> {
  const res = await fetch("/api/ai/switch-provider", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: providerName })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to switch provider");
  }
  return res.json();
}

// ─── AI Endpoints (model-aware) ──────────────────────────────────────

/** Helper to get current model from store (avoids circular dep) */
let getActiveModel: (() => string | null) | null = null;
export function registerModelGetter(fn: () => string | null) {
  getActiveModel = fn;
}

function activeModel(): string | undefined {
  return getActiveModel?.() || undefined;
}

export async function generateGraphStructure(prompt: string, currentGraph?: GraphData, currentManifesto?: string): Promise<SystemState> {
  const res = await fetch("/api/ai/generateGraphStructure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, currentGraph, currentManifesto, model: activeModel() })
  });
  if (!res.ok) throw new Error("Failed to generate graph structure");
  return res.json();
}

export async function generateProposal(prompt: string, currentGraph: GraphData, manifesto: string): Promise<string> {
  const res = await fetch("/api/ai/generateProposal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, currentGraph, manifesto, model: activeModel() })
  });
  if (!res.ok) throw new Error("Failed to generate proposal");
  const data = await res.json();
  return data.proposal;
}

export async function applyProposal(prompt: string, currentGraph: GraphData, manifesto: string, proposal: string): Promise<GraphData> {
  const res = await fetch("/api/ai/applyProposal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, currentGraph, manifesto, proposal, model: activeModel() })
  });
  if (!res.ok) throw new Error("Failed to apply proposal");
  return res.json();
}

export async function analyzeArchitecture(graph: GraphData, manifesto: string): Promise<AnalysisResult> {
  const res = await fetch("/api/ai/analyzeArchitecture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ graph, manifesto, model: activeModel() })
  });
  if (!res.ok) throw new Error("Failed to analyze architecture");
  return res.json();
}

export async function performDeepResearch(node: NodeData, projectContext: string): Promise<string> {
  const res = await fetch("/api/ai/performDeepResearch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ node, projectContext, model: activeModel() })
  });
  if (!res.ok) throw new Error("Failed to perform deep research");
  const data = await res.json();
  return data.research;
}

export async function exportToOmx(graph: GraphData, manifesto: string, architecture: string): Promise<{ plan: string; agents: string }> {
  const res = await fetch("/api/export/omx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ graph, manifesto, architecture })
  });
  if (!res.ok) throw new Error("Failed to export to OMX format");
  return res.json();
}
