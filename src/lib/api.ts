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
  researchContext?: string;
  researchMeta?: Record<string, unknown>;
  constructionNotes?: string;
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

export type SessionSource = 'manual' | 'imported_codebase';

export interface CodebaseImportMeta {
  sourcePath: string;
  importedAt: string;
  confidence: number;
  notes: string[];
  summary?: string;
  sourceStats?: {
    totalFiles?: number;
    totalLoc?: number;
    topFiles?: string[];
  };
}

export interface SessionSummary {
  id: string;
  name: string;
  source: SessionSource;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  nodeCount: number;
  linkCount: number;
  importMeta?: CodebaseImportMeta;
}

export interface SessionDocument {
  id: string;
  name: string;
  source: SessionSource;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  manifesto: string;
  architecture: string;
  graph: GraphData;
  projectContext: string;
  importMeta?: CodebaseImportMeta;
}

export interface AnalysisIssue {
  code: string;
  message: string;
  nodeIds?: string[];
}

export interface BuildOrderEntry {
  id: string;
  label: string;
  priority: number;
}

export interface BlueprintReadinessReport {
  status: 'ready' | 'blocked' | 'needs_review';
  exportAllowed: boolean;
  blockers: AnalysisIssue[];
  warnings: AnalysisIssue[];
  buildOrder: BuildOrderEntry[];
  stats: {
    totalNodes: number;
    totalLinks: number;
    acceptanceCoverage: number;
    contractCoverage: number;
    errorHandlingCoverage: number;
    hasCycles: boolean;
    unresolvedLinkCount: number;
    groundingQuality: 'degraded' | 'medium' | 'high';
  };
  projection: {
    prepared: boolean;
    runtimeDir: string;
    preparedAt?: string;
  };
}

export interface BlueprintImpactReport {
  nodeId: string;
  nodeLabel: string;
  upstream: BuildOrderEntry[];
  downstream: BuildOrderEntry[];
  changedTogether: BuildOrderEntry[];
  explanation: string;
  semanticRelated: string[];
}

export interface BlueprintGapReport {
  blockers: AnalysisIssue[];
  warnings: AnalysisIssue[];
  missingAcceptanceCriteria: BuildOrderEntry[];
  missingContracts: BuildOrderEntry[];
  missingErrorHandling: BuildOrderEntry[];
  suggestedModules: string[];
  semanticHints: string[];
}

export interface SessionDraftPayload {
  name: string | null;
  source: SessionSource | null;
  graph: GraphData;
  manifesto: string;
  architecture: string;
  projectContext: string;
  importMeta?: CodebaseImportMeta | null;
}

export interface SessionAdvancedReport {
  action: 'health' | 'layers' | 'metrics' | 'diagram' | 'impact' | 'predict';
  data: any;
  projection: {
    prepared: boolean;
    runtimeDir: string;
    preparedAt?: string;
  };
}

export interface SystemState {
  manifesto: string;
  architecture: string;
  graph: GraphData;
  explanation?: string;
  meta?: {
    provider?: string;
    fallbackUsed?: boolean;
    selfCorrected?: boolean;
    pass1Issues?: number;
    pass1Nodes?: number;
    enhancedNodes?: number;
  };
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
  status?: 'ready' | 'offline' | 'blocked' | 'missing_config';
  error?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

export interface EnvConfigState {
  targetFile: string;
  onboardingRequired: boolean;
  config: Partial<Record<string, string>>;
  configured: Partial<Record<string, boolean>>;
  providers: ProviderInfo[];
}

export class ExportBlockedError extends Error {
  readiness?: BlueprintReadinessReport;

  constructor(message: string, readiness?: BlueprintReadinessReport) {
    super(message);
    this.name = 'ExportBlockedError';
    this.readiness = readiness;
  }
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

export async function fetchEnvConfig(): Promise<EnvConfigState> {
  const res = await fetch('/api/config/env');
  if (!res.ok) throw new Error('Failed to fetch env config');
  return res.json();
}

export async function saveEnvConfig(updates: Record<string, string>): Promise<EnvConfigState & { success: boolean; targetFile: string }> {
  const res = await fetch('/api/config/env', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to save env config');
  }
  return res.json();
}

// ─── Session API ─────────────────────────────────────────────────────

export async function listSessions(): Promise<SessionSummary[]> {
  const res = await fetch('/api/sessions');
  if (!res.ok) throw new Error('Failed to list sessions');
  const data = await res.json();
  return data.sessions;
}

export async function createSession(input: {
  name: string;
  source?: SessionSource;
  manifesto?: string;
  architecture?: string;
  graph?: GraphData;
  projectContext?: string;
  importMeta?: CodebaseImportMeta;
}): Promise<SessionDocument> {
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to create session');
  return res.json();
}

export async function loadSession(id: string): Promise<SessionDocument> {
  const res = await fetch(`/api/sessions/${id}`);
  if (!res.ok) throw new Error('Failed to load session');
  return res.json();
}

export async function saveSession(
  id: string,
  input: Partial<Pick<SessionDocument, 'name' | 'archived' | 'manifesto' | 'architecture' | 'graph' | 'projectContext' | 'importMeta'>>,
): Promise<SessionDocument> {
  const res = await fetch(`/api/sessions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to save session');
  return res.json();
}

export async function deleteSession(id: string): Promise<void> {
  const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete session');
}

export async function importCodebase(path: string): Promise<{
  session: SessionDocument;
  readiness: BlueprintReadinessReport;
  importMeta: CodebaseImportMeta;
}> {
  const res = await fetch('/api/sessions/import/codebase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, model: activeModel() }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to import codebase');
  }
  return res.json();
}

export async function getSessionReadiness(sessionId: string): Promise<BlueprintReadinessReport> {
  const res = await fetch(`/api/sessions/${sessionId}/readiness`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to get readiness');
  return res.json();
}

export async function getSessionReadinessDraft(sessionId: string, draft: SessionDraftPayload): Promise<BlueprintReadinessReport> {
  const res = await fetch(`/api/sessions/${sessionId}/readiness`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draft }),
  });
  if (!res.ok) throw new Error('Failed to get readiness');
  return res.json();
}

export async function getSessionImpact(sessionId: string, nodeId: string): Promise<BlueprintImpactReport> {
  const res = await fetch(`/api/sessions/${sessionId}/impact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to analyze impact');
  }
  return res.json();
}

export async function getSessionImpactDraft(sessionId: string, nodeId: string, draft: SessionDraftPayload): Promise<BlueprintImpactReport> {
  const res = await fetch(`/api/sessions/${sessionId}/impact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeId, draft }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to analyze impact');
  }
  return res.json();
}

export async function getSessionGaps(sessionId: string): Promise<BlueprintGapReport> {
  const res = await fetch(`/api/sessions/${sessionId}/gaps`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to analyze gaps');
  return res.json();
}

export async function getSessionGapsDraft(sessionId: string, draft: SessionDraftPayload): Promise<BlueprintGapReport> {
  const res = await fetch(`/api/sessions/${sessionId}/gaps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draft }),
  });
  if (!res.ok) throw new Error('Failed to analyze gaps');
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

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error || fallback);
}

export async function generateGraphStructure(prompt: string, currentGraph?: GraphData, currentManifesto?: string): Promise<SystemState> {
  const res = await fetch("/api/ai/generateGraphStructure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, currentGraph, currentManifesto, model: activeModel() })
  });
  if (!res.ok) await throwApiError(res, "Failed to generate graph structure");
  return res.json();
}

export async function generateProposal(prompt: string, currentGraph: GraphData, manifesto: string): Promise<string> {
  const res = await fetch("/api/ai/generateProposal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, currentGraph, manifesto, model: activeModel() })
  });
  if (!res.ok) await throwApiError(res, "Failed to generate proposal");
  const data = await res.json();
  return data.proposal;
}

export async function applyProposal(prompt: string, currentGraph: GraphData, manifesto: string, proposal: string): Promise<GraphData> {
  const res = await fetch("/api/ai/applyProposal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, currentGraph, manifesto, proposal, model: activeModel() })
  });
  if (!res.ok) await throwApiError(res, "Failed to apply proposal");
  return res.json();
}

export async function analyzeArchitecture(graph: GraphData, manifesto: string): Promise<AnalysisResult> {
  const res = await fetch("/api/ai/analyzeArchitecture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ graph, manifesto, model: activeModel() })
  });
  if (!res.ok) await throwApiError(res, "Failed to analyze architecture");
  return res.json();
}

export async function performDeepResearch(node: NodeData, projectContext: string): Promise<string> {
  const res = await fetch("/api/ai/performDeepResearch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ node, projectContext, model: activeModel() })
  });
  if (!res.ok) await throwApiError(res, "Failed to perform deep research");
  const data = await res.json();
  return data.research;
}

export async function exportToOmx(graph: GraphData, manifesto: string, architecture: string): Promise<{ plan: string; agents: string }> {
  const res = await fetch("/api/export/omx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ graph, manifesto, architecture })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 409) {
      throw new ExportBlockedError(data.error || "Blueprint is blocked.", data.readiness);
    }
    throw new Error(data.error || "Failed to export to OMX format");
  }
  return res.json();
}

export async function exportSessionToOmx(sessionId: string): Promise<{ plan: string; agents: string; readiness: BlueprintReadinessReport }> {
  const res = await fetch('/api/export/omx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 409) {
      throw new ExportBlockedError(data.error || "Blueprint is blocked.", data.readiness);
    }
    throw new Error(data.error || 'Failed to export session to OMX');
  }
  return res.json();
}

export async function exportSessionDraftToOmx(
  sessionId: string,
  draft: SessionDraftPayload,
): Promise<{ plan: string; agents: string; readiness: BlueprintReadinessReport }> {
  const res = await fetch('/api/export/omx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, draft }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 409) {
      throw new ExportBlockedError(data.error || "Blueprint is blocked.", data.readiness);
    }
    throw new Error(data.error || 'Failed to export session to OMX');
  }
  return res.json();
}

export async function activateSessionDraft(
  sessionId: string,
  query: string,
  draft: SessionDraftPayload,
): Promise<any> {
  const res = await fetch(`/api/sessions/${sessionId}/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, draft }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to query the active session');
  }
  return res.json();
}

export async function runSessionAdvancedDraft(
  sessionId: string,
  action: SessionAdvancedReport['action'],
  draft: SessionDraftPayload,
  nodeId?: string,
): Promise<SessionAdvancedReport> {
  const res = await fetch(`/api/sessions/${sessionId}/advanced`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, nodeId, draft }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to run advanced session action');
  }
  return res.json();
}

// ─── KOMPLETUS Pipeline ──────────────────────────────────────────────

export interface KompletusEvent {
  stage: string;
  status: 'running' | 'done' | 'error';
  message?: string;
  data?: Record<string, unknown>;
}

// ─── SPECULAR AUDIT Types (SSOT: mirrors backend exactly) ─────────────

export interface UserMoment {
  id: string;
  label: string;
  backendStages: string[];
  userQuestion: string;
}

export interface NodeScreenEntry {
  nodeId: string;
  label: string;
  hasUserSurface: boolean;
  screenType?: string;
  userActions?: string[];
  dataDisplayed?: string[];
}

export interface CoverageEntry {
  backendPhase: string;
  momentId: string;
  momentLabel: string;
  confidence: number;
}

export interface SpecularAuditResult {
  moments: UserMoment[];
  coverage: CoverageEntry[];
  nodeScreenMap: NodeScreenEntry[];
  parityScore: number;
}

export interface KompletusResult {
  graph: GraphData;
  manifesto: string;
  architecture: string;
  explanation: string;
  research: Record<string, { report: string; meta: Record<string, unknown> }>;
  specular: SpecularAuditResult;
  l1ght: {
    expandedContracts: number;
    crossNodeIssues: number;
    artifacts: { routeMap?: string; envTemplate?: string; dbSchema?: string };
  };
  qualityGate: { passed: boolean; iterations: number; remainingIssues: string[] };
  meta: {
    totalTimeMs: number;
    stages: Record<string, { durationMs: number; details?: Record<string, unknown> }>;
  };
}

export async function runKompletus(
  prompt: string,
  onProgress: (event: KompletusEvent) => void,
): Promise<KompletusResult> {
  const res = await fetch('/api/ai/kompletus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, model: activeModel() }),
  });

  if (!res.ok && res.headers.get('content-type')?.includes('application/json')) {
    await throwApiError(res, 'KOMPLETUS pipeline failed');
  }

  return new Promise((resolve, reject) => {
    const reader = res.body?.getReader();
    if (!reader) return reject(new Error('No response body'));

    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult: KompletusResult | null = null;
    let lastError: string | null = null;
    // CRITICAL: eventType must persist across chunk boundaries
    let eventType = '';

    function processLines(text: string) {
      buffer += text;
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // keep incomplete last line

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.substring(7).trim();
        } else if (line.startsWith('data: ') && eventType) {
          const raw = line.substring(6);
          try {
            const data = JSON.parse(raw);
            if (eventType === 'progress') {
              onProgress(data as KompletusEvent);
            } else if (eventType === 'result') {
              finalResult = data as KompletusResult;
            } else if (eventType === 'error') {
              lastError = data.error || 'Pipeline error';
            }
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'parse error';
            console.warn(`[KOMPLETUS SSE] Failed to parse ${eventType} (${raw.length} chars): ${msg}`);
            if (eventType === 'result') {
              lastError = `Result JSON parse failed (${raw.length} chars): ${msg}`;
            }
          }
          eventType = '';
        } else if (line === '') {
          // SSE blank line separator — reset event type
          eventType = '';
        }
      }
    }

    async function pump() {
      try {
        while (true) {
          const { done, value } = await reader!.read();
          if (done) break;
          processLines(decoder.decode(value, { stream: true }));
        }
        // Flush remaining buffer — reset first to prevent doubling
        if (buffer.trim()) {
          const remaining = buffer;
          buffer = '';
          processLines(remaining + '\n');
        }
        if (lastError && !finalResult) {
          reject(new Error(lastError));
        } else if (finalResult) {
          resolve(finalResult);
        } else {
          reject(new Error('Pipeline stream ended without result event'));
        }
      } catch (e) {
        reject(e);
      }
    }

    pump();
  });
}
