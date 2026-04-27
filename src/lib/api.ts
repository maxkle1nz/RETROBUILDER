/**
 * RETROBUILDER API Client
 * 
 * Frontend API functions for communicating with the Express backend.
 * Provider-agnostic — the backend handles AI provider selection via SSOT.
 * Model selection is passed through from the frontend store.
 */

import { localApiAuthHeaders } from './local-api-auth';

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
  position?: { x: number; y: number };
  researchContext?: string;
  researchMeta?: Record<string, unknown>;
  constructionNotes?: string;
  designProfile?: DesignProfile;
  referenceCandidates?: SpecularReferenceCandidate[];
  selectedReferenceIds?: string[];
  selectedProductDnaPackIds?: string[];
  activeProductDnaContract?: ActiveProductDnaContract;
  variantCandidates?: SpecularVariantCandidate[];
  selectedVariantId?: string;
  previewArtifact?: SpecularPreviewArtifact;
  previewState?: SpecularPreviewState;
  designVerdict?: SpecularDesignVerdict;
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

export type DesignProfile = '21st';
export type SpecularScreenType = 'dashboard' | 'form' | 'list' | 'detail' | 'chat' | 'wizard' | 'landing';
export type SpecularDensity = 'comfortable' | 'compact';
export type SpecularEmphasis = 'editorial' | 'product' | 'dashboard';
export type SpecularBlockKind = 'hero' | 'metrics' | 'list' | 'detail' | 'activity' | 'cta';
export type ProductDnaPackFamily = 'design' | 'domain' | 'stack' | 'game' | 'asset' | 'capability' | 'quality';
export type ProductDnaValidatorSeverity = 'info' | 'warn' | 'fail';
export type ProductDnaProvenanceSourceType = 'sidecar-research' | 'manual-curation' | 'internal-code' | 'imported-docs';

export interface ProductDnaPackBinding {
  id: string;
  version: string;
  family: ProductDnaPackFamily;
  title: string;
}

export interface ActiveProductDnaValidator {
  packId: string;
  id: string;
  severity: ProductDnaValidatorSeverity;
  description: string;
  evidence: string;
}

export interface ActiveProductDnaContract {
  contractVersion: 'active-product-dna-contract@1';
  generatedAt: string;
  node: {
    id: string;
    type?: string;
    screenType?: string;
    intent?: string;
  };
  packBindings: ProductDnaPackBinding[];
  promptDirectives: string[];
  requiredElements: string[];
  forbiddenPatterns: string[];
  allowedSubstitutions: string[];
  stackHints: string[];
  validators: ActiveProductDnaValidator[];
  receipts: {
    required: string[];
    optional: string[];
  };
  provenance: Array<{
    packId: string;
    capturedAt: string;
    sourceType: ProductDnaProvenanceSourceType;
    sourceUrls: string[];
  }>;
}

export interface SpecularReferenceCandidate {
  id: string;
  title: string;
  category: string;
  rationale: string;
  tags: string[];
  source: '21st-local' | '21st-catalog' | 'retrobuilder-vanguard';
  componentKey?: string;
  author?: string;
  componentUrl?: string;
  promptUrl?: string;
  previewUrl?: string;
  localPath?: string;
  promptPath?: string;
  dependencies?: string[];
  importSources?: string[];
  patternId?: string;
  sourcePromptName?: string;
  stackAdapters?: Record<string, string[]>;
  implementationNotes?: string[];
  mobileRules?: string[];
  tasteScore?: number;
}

export interface SpecularPreviewBlock {
  id: string;
  kind: SpecularBlockKind;
  title: string;
  eyebrow?: string;
  body?: string;
  items?: string[];
}

export interface SpecularPreviewArtifact {
  kind: 'tsx';
  componentName: string;
  screenType: SpecularScreenType;
  summary: string;
  blocks: SpecularPreviewBlock[];
  tsx: string;
}

export interface SpecularPreviewState {
  density: SpecularDensity;
  emphasis: SpecularEmphasis;
}

export interface SpecularDesignVerdict {
  status: 'pending' | 'passed' | 'failed';
  score: number;
  findings: string[];
  evidence: string[];
}

export interface SpecularVariantCandidate {
  id: string;
  label: string;
  description: string;
  flavor: 'editorial' | 'control' | 'conversational';
  screenType: SpecularScreenType;
  referenceIds: string[];
  previewArtifact: SpecularPreviewArtifact;
  designVerdict: SpecularDesignVerdict;
}

export type KnowledgeTrustLevel = 'quarantine' | 'staged' | 'verified' | 'blocked';
export type KnowledgeSourceKind = 'product-dna-pack' | 'donor-doc' | 'web-research' | 'internal-doc' | 'runtime-receipt' | 'asset';
export type KnowledgeReviewStatus = 'pending' | 'approved' | 'rejected';

export interface KnowledgeEvidenceBinding {
  chunkId: string;
  docId: string;
  sourceUri: string;
  title: string;
  score: number;
  trustLevel: KnowledgeTrustLevel;
}

export interface KnowledgeContextBundle {
  schemaVersion: 'knowledge-bank@1';
  query: Record<string, unknown>;
  documents: Array<{
    docId: string;
    title: string;
    sourceKind: string;
    sourceUri: string;
    trustLevel: KnowledgeTrustLevel;
    reviewStatus: string;
    objectSha: string;
    packId?: string;
    family?: string;
  }>;
  chunks: Array<{
    chunkId: string;
    docId: string;
    sectionPath: string[];
    tokenEstimate: number;
    fingerprint: string;
  }>;
  evidence: KnowledgeEvidenceBinding[];
  receipt: {
    schemaVersion: 'knowledge-bank@1';
    receiptId: string;
    generatedAt: string;
    query: string;
    stage: string;
    selectedChunkIds: string[];
    selectedDocIds: string[];
    scoreBreakdown: Record<string, unknown>;
  };
  promptContext: string;
}

export interface KnowledgeReviewQueueItem {
  docId: string;
  title: string;
  sourceKind: KnowledgeSourceKind | string;
  sourceUri: string;
  capturedAt: string;
  trustLevel: KnowledgeTrustLevel;
  reviewStatus: KnowledgeReviewStatus;
  rightsBasis: string;
  objectSha: string;
  sourceUrls: string[];
  tags: string[];
  chunkCount: number;
  tokenEstimate: number;
  review?: Record<string, unknown>;
}

export interface KnowledgeReviewQueueResponse {
  rootDir: string;
  generatedAt: string;
  totalDocuments: number;
  pendingCount: number;
  items: KnowledgeReviewQueueItem[];
}

export interface KnowledgeReviewTransitionPayload {
  docId: string;
  trustLevel: KnowledgeTrustLevel;
  reviewStatus: KnowledgeReviewStatus;
  reviewer: string;
  reviewedAt?: string;
  notes?: string;
  rightsBasis?: string;
  license?: {
    spdx?: string;
    allowed: boolean;
    notes?: string;
  };
}

export interface KnowledgeExternalIngestPayload {
  docId?: string;
  title: string;
  sourceKind: KnowledgeSourceKind;
  sourceUri: string;
  body: string;
  capturedAt?: string;
  tags?: string[];
  sourceUrls?: string[];
  rightsBasis?: string;
  trustLevel?: KnowledgeTrustLevel;
  reviewStatus?: KnowledgeReviewStatus;
  license?: {
    spdx?: string;
    allowed: boolean;
    notes?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface SpecularCreateResponse {
  nodeId: string;
  designProfile: DesignProfile;
  referenceCandidates: SpecularReferenceCandidate[];
  selectedReferenceIds: string[];
  selectedProductDnaPackIds: string[];
  activeProductDnaContract: ActiveProductDnaContract;
  knowledgeContextBundle: KnowledgeContextBundle;
  variantCandidates: SpecularVariantCandidate[];
  selectedVariantId: string;
  previewArtifact: SpecularPreviewArtifact;
  previewState: SpecularPreviewState;
  designVerdict: SpecularDesignVerdict;
}

export interface SpecularBuildDesignSummary {
  designProfile: DesignProfile;
  designGateStatus: 'pending' | 'passed' | 'failed';
  designScore: number;
  designFindings: string[];
  designEvidence: string[];
  affectedNodeIds: string[];
  failingNodeIds: string[];
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
  runtime?: {
    baseUrl?: string;
    command?: string;
    installed?: boolean;
    autoStart?: boolean;
    autoStarted?: boolean;
    healthy?: boolean;
    authProfile?: string | null;
    authProfileProvider?: string | null;
    protocol?: 'openai_compat' | 'standalone';
    source?: 'env' | 'path' | 'donor';
  };
}

export interface AuthProfileInfo {
  id: string;
  provider: string;
  type: 'token' | 'oauth' | 'unknown';
  accountId?: string;
  source: 'openclaw';
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

export class OmxBuildBlockedError extends Error {
  design?: SpecularBuildDesignSummary;

  constructor(message: string, design?: SpecularBuildDesignSummary) {
    super(message);
    this.name = 'OmxBuildBlockedError';
    this.design = design;
  }
}

export interface OmxTransportInfo {
  kind: 'codex-cli';
  command: string;
  available: boolean;
}

export interface OmxBuildDocumentationTechnology {
  name: string;
  note: string;
}

export interface OmxBuildDocumentationCommand {
  name: string;
  command: string;
  description: string;
}

export interface OmxBuildDocumentationEnvVar {
  name: string;
  required: boolean;
  description: string;
}

export interface OmxBuildLaunchPlan {
  stack: string;
  workingDirectory: string;
  setupCommand?: string;
  runCommand: string;
  buildCommand?: string;
  validationCommand?: string;
  previewUrl?: string;
  healthUrl?: string;
  runScriptPath?: string;
  launchScriptPath?: string;
  copyPasteScript: string;
  notes: string[];
}

export type OmxBuildDocumentationDeliverableKind = 'app' | 'service' | 'data' | 'integration' | 'security' | 'library';

export interface OmxBuildDocumentationDeliverable {
  id: string;
  label: string;
  kind: OmxBuildDocumentationDeliverableKind;
  primary: boolean;
  path: string;
  runCommand?: string;
  previewUrl?: string;
  healthUrl?: string;
  description: string;
  modules: string[];
  evidence: string[];
}

export type OmxRunnableManifestCommandPurpose = 'setup' | 'run' | 'build' | 'validate' | 'inspect';

export interface OmxRunnableManifestCommand {
  name: string;
  command: string;
  description: string;
  purpose: OmxRunnableManifestCommandPurpose;
  primary: boolean;
}

export interface OmxRunnableManifestEndpoint {
  name: 'preview' | 'health' | string;
  url: string;
  method: 'GET';
  purpose: string;
}

export interface OmxRunnableManifestDeliverable {
  id: string;
  label: string;
  kind: OmxBuildDocumentationDeliverableKind;
  primary: boolean;
  path: string;
  runCommand?: string;
  previewUrl?: string;
  healthUrl?: string;
}

export interface OmxRunnableManifest {
  version: 1;
  generatedAt: string;
  projectName: string;
  manifestPath: string;
  workspacePath: string;
  stack: string;
  workingDirectory: string;
  launchScriptPath?: string;
  runScriptPath?: string;
  primaryRunCommand: string;
  setupCommand?: string;
  buildCommand?: string;
  validationCommand?: string;
  copyPasteScript: string;
  commands: OmxRunnableManifestCommand[];
  endpoints: OmxRunnableManifestEndpoint[];
  deliverables: OmxRunnableManifestDeliverable[];
  environment: OmxBuildDocumentationEnvVar[];
  evidence: {
    launchPlanSource: 'generated-launch-plan';
    systemVerifyStatus: 'pending' | 'passed' | 'failed' | 'not_available';
    systemVerifyCommand?: string;
    designGateStatus: 'pending' | 'passed' | 'failed';
    designScore: number;
  };
  warnings: string[];
}

export interface OmxBuildDocumentationModule {
  nodeId: string;
  label: string;
  type: string;
  modulePath: string;
  readmePath: string;
  description: string;
  dataContract: string;
  acceptanceCriteria: string[];
  errorHandling: string[];
  artifactCount: number;
  artifactLines: number;
  filePreview: string[];
  verifyCommand?: string;
  verifySummary?: string;
  mergeSummary?: string;
  scripts: string[];
}

export type OmxBuildDocumentationQualityStatus = 'passed' | 'needs_review' | 'failed';

export interface OmxBuildDocumentationQualityCheck {
  id: string;
  label: string;
  weight: number;
  status: OmxBuildDocumentationQualityStatus;
  detail: string;
}

export interface OmxBuildDocumentationQuality {
  status: OmxBuildDocumentationQualityStatus;
  score: number;
  findings: string[];
  strengths: string[];
  checks: OmxBuildDocumentationQualityCheck[];
}

export interface OmxBuildDocumentation {
  generatedAt: string;
  projectName: string;
  dossierPath: string;
  wikiPath: string;
  wikiBuildSummaryPath: string;
  readmePath: string;
  summary: string;
  workspacePath: string;
  intakeChannels: string[];
  usageModes: string[];
  technologies: OmxBuildDocumentationTechnology[];
  commands: OmxBuildDocumentationCommand[];
  launchPlan?: OmxBuildLaunchPlan;
  runnableManifest?: OmxRunnableManifest;
  deliverables?: OmxBuildDocumentationDeliverable[];
  environmentVariables: OmxBuildDocumentationEnvVar[];
  modules: OmxBuildDocumentationModule[];
  quality: OmxBuildDocumentationQuality;
  verification: {
    designGateStatus: 'pending' | 'passed' | 'failed';
    designScore: number;
    designFindings: string[];
    designEvidence: string[];
    systemVerify: {
      status: 'pending' | 'passed' | 'failed' | 'not_available';
      command?: string;
      summary?: string;
    };
    verifyReceipts: Array<{
      taskId: string;
      passed: boolean;
      command: string;
      summary: string;
    }>;
    mergeReceipts: Array<{
      taskId: string;
      applied: boolean;
      appliedPaths: number;
      rejectedPaths: number;
      reason?: string;
    }>;
  };
  workspace: {
    totalFiles: number;
    totalLines: number;
    elapsedMs: number;
  };
  wikiPages: Array<{
    title: string;
    path: string;
    moduleId?: string;
  }>;
  wikiMarkdown: string;
  readmeMarkdown: string;
}

export interface OmxBuildStatus {
  sessionId: string;
  buildId?: string;
  status: 'idle' | 'queued' | 'running' | 'succeeded' | 'failed' | 'stopping' | 'stopped';
  workspacePath?: string;
  transport: OmxTransportInfo;
  source: 'persisted-session' | 'session-draft';
  totalNodes?: number;
  completedNodes?: number;
  buildProgress?: number;
  activeNodeId?: string | null;
  nodeStates?: Record<string, 'dormant' | 'queued' | 'building' | 'complete' | 'error'>;
  result?: {
    totalFiles: number;
    totalLines: number;
    elapsedMs: number;
    documentation?: OmxBuildDocumentation;
    runnableManifest?: OmxRunnableManifest;
    systemVerify?: {
      status: 'pending' | 'passed' | 'failed' | 'not_available';
      command?: string;
      summary?: string;
    };
  };
  terminalMessage?: string;
  designProfile?: DesignProfile;
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
  verifyReceipts?: Record<string, { taskId: string; passed: boolean; command: string; summary: string; verifiedAt: string }>;
  mergeReceipts?: Record<string, { taskId: string; applied: boolean; appliedPaths: string[]; rejectedPaths: string[]; reason?: string; ownerCandidates?: string[]; mergedAt: string }>;
}

export interface OmxBuildStartResponse extends OmxBuildStatus {
  buildId: string;
  status: 'queued' | 'running' | 'stopping' | 'stopped';
  workspacePath: string;
  streamUrl: string;
  statusUrl: string;
  stopUrl: string;
}

// ─── Provider & Model Config API ─────────────────────────────────────

export async function fetchProviders(): Promise<{ providers: ProviderInfo[]; active: string }> {
  const res = await fetch("/api/ai/providers", { headers: localApiAuthHeaders() });
  if (!res.ok) throw new Error("Failed to fetch providers");
  return res.json();
}

export async function fetchAuthProfiles(provider?: string): Promise<{ profiles: AuthProfileInfo[] }> {
  const query = provider ? `?provider=${encodeURIComponent(provider)}` : '';
  const res = await fetch(`/api/ai/auth-profiles${query}`, { headers: localApiAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch auth profiles');
  return res.json();
}

export async function fetchModels(
  provider?: string,
  authProfile?: string | null,
): Promise<{ provider: string; authProfile?: string | null; defaultModel: string; models: ModelInfo[] }> {
  const params = new URLSearchParams();
  if (provider) params.set('provider', provider);
  if (authProfile) params.set('authProfile', authProfile);
  const url = params.size > 0 ? `/api/ai/models?${params.toString()}` : "/api/ai/models";
  const res = await fetch(url, { headers: localApiAuthHeaders() });
  if (!res.ok) throw new Error("Failed to fetch models");
  return res.json();
}

export async function switchProvider(providerName: string): Promise<{ success: boolean; provider: string; label: string; defaultModel: string }> {
  const res = await fetch("/api/ai/switch-provider", {
    method: "POST",
    headers: localApiAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ provider: providerName })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to switch provider");
  }
  return res.json();
}

export async function fetchEnvConfig(): Promise<EnvConfigState> {
  const res = await fetch('/api/config/env', { headers: localApiAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch env config');
  return res.json();
}

export async function saveEnvConfig(updates: Record<string, string>): Promise<EnvConfigState & { success: boolean; targetFile: string }> {
  const res = await fetch('/api/config/env', {
    method: 'PUT',
    headers: localApiAuthHeaders({ 'Content-Type': 'application/json' }),
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
    headers: localApiAuthHeaders({ 'Content-Type': 'application/json' }),
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
    headers: localApiAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ prompt, currentGraph, currentManifesto, model: activeModel() })
  });
  if (!res.ok) await throwApiError(res, "Failed to generate graph structure");
  return res.json();
}

export async function generateProposal(prompt: string, currentGraph: GraphData, manifesto: string): Promise<string> {
  const res = await fetch("/api/ai/generateProposal", {
    method: "POST",
    headers: localApiAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ prompt, currentGraph, manifesto, model: activeModel() })
  });
  if (!res.ok) await throwApiError(res, "Failed to generate proposal");
  const data = await res.json();
  return data.proposal;
}

export async function applyProposal(prompt: string, currentGraph: GraphData, manifesto: string, proposal: string): Promise<GraphData> {
  const res = await fetch("/api/ai/applyProposal", {
    method: "POST",
    headers: localApiAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ prompt, currentGraph, manifesto, proposal, model: activeModel() })
  });
  if (!res.ok) await throwApiError(res, "Failed to apply proposal");
  return res.json();
}

export async function analyzeArchitecture(graph: GraphData, manifesto: string): Promise<AnalysisResult> {
  const res = await fetch("/api/ai/analyzeArchitecture", {
    method: "POST",
    headers: localApiAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ graph, manifesto, model: activeModel() })
  });
  if (!res.ok) await throwApiError(res, "Failed to analyze architecture");
  return res.json();
}

export async function performDeepResearch(node: NodeData, projectContext: string): Promise<string> {
  const res = await fetch("/api/ai/performDeepResearch", {
    method: "POST",
    headers: localApiAuthHeaders({ "Content-Type": "application/json" }),
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

export async function startOmxBuild(sessionId: string, draft?: SessionDraftPayload): Promise<OmxBuildStartResponse> {
  const res = await fetch('/api/omx/build', {
    method: 'POST',
    headers: localApiAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(draft ? { sessionId, draft } : { sessionId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.design) {
      throw new OmxBuildBlockedError(data.error || 'OMX build blocked by design gate', data.design);
    }
    throw new Error(data.error || 'Failed to start OMX build');
  }
  return res.json();
}

export async function resumeOmxBuild(sessionId: string, draft?: SessionDraftPayload): Promise<OmxBuildStartResponse> {
  const res = await fetch('/api/omx/resume', {
    method: 'POST',
    headers: localApiAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(draft ? { sessionId, draft } : { sessionId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.design) {
      throw new OmxBuildBlockedError(data.error || 'OMX build blocked by design gate', data.design);
    }
    throw new Error(data.error || 'Failed to resume OMX build');
  }
  return res.json();
}

export async function retryOmxTask(sessionId: string, taskId: string, draft?: SessionDraftPayload): Promise<OmxBuildStartResponse> {
  const res = await fetch(`/api/omx/retry/${sessionId}`, {
    method: 'POST',
    headers: localApiAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(draft ? { taskId, draft } : { taskId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.design) {
      throw new OmxBuildBlockedError(data.error || 'OMX build blocked by design gate', data.design);
    }
    throw new Error(data.error || 'Failed to retry OMX task');
  }
  return res.json();
}

export async function reassignOmxTaskOwnership(sessionId: string, taskId: string, draft?: SessionDraftPayload): Promise<OmxBuildStartResponse> {
  const res = await fetch(`/api/omx/reassign/${sessionId}`, {
    method: 'POST',
    headers: localApiAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(draft ? { taskId, draft } : { taskId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.design) {
      throw new OmxBuildBlockedError(data.error || 'OMX build blocked by design gate', data.design);
    }
    throw new Error(data.error || 'Failed to reassign OMX task ownership');
  }
  return res.json();
}

export async function fetchOmxStatus(sessionId: string): Promise<OmxBuildStatus> {
  const res = await fetch(`/api/omx/status/${sessionId}`, { headers: localApiAuthHeaders() });
  if (!res.ok) {
    await throwApiError(res, 'Failed to fetch OMX status');
  }
  return res.json();
}

export async function openOmxProject(sessionId: string): Promise<{ ok: boolean; workspacePath: string }> {
  const res = await fetch(`/api/omx/open-project/${sessionId}`, {
    method: 'POST',
    headers: localApiAuthHeaders(),
  });
  if (!res.ok) {
    await throwApiError(res, 'Failed to open generated project');
  }
  return res.json();
}

export async function fetchOmxHistory(sessionId: string, buildId?: string): Promise<Record<string, unknown>[]> {
  const query = buildId ? `?buildId=${encodeURIComponent(buildId)}` : '';
  const res = await fetch(`/api/omx/history/${sessionId}${query}`, { headers: localApiAuthHeaders() });
  if (!res.ok) {
    await throwApiError(res, 'Failed to fetch OMX history');
  }
  const data = await res.json();
  return Array.isArray(data.events) ? data.events : [];
}

export async function recordOmxOperationalMessage(
  sessionId: string,
  payload: { role: 'user' | 'system'; action: string; message: string },
): Promise<void> {
  const res = await fetch(`/api/omx/operation/${sessionId}`, {
    method: 'POST',
    headers: localApiAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    await throwApiError(res, 'Failed to persist OMX operational message');
  }
}

export async function stopOmxBuild(sessionId: string): Promise<{ sessionId: string; buildId?: string; status: 'idle' | 'stopping' | 'stopped' }> {
  const res = await fetch(`/api/omx/stop/${sessionId}`, {
    method: 'POST',
    headers: localApiAuthHeaders(),
  });
  if (!res.ok) {
    await throwApiError(res, 'Failed to stop OMX build');
  }
  return res.json();
}

export async function generateSpecularPreview(
  sessionId: string | null,
  nodeId: string,
  draft: SessionDraftPayload,
): Promise<SpecularCreateResponse> {
  const res = await fetch('/api/specular/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sessionId ? { sessionId, nodeId, draft } : { nodeId, draft }),
  });
  if (!res.ok) {
    await throwApiError(res, 'Failed to generate SPECULAR UIX preview');
  }
  return res.json();
}

export async function evaluateSpecularPreview(
  sessionId: string | null,
  nodeId: string,
  draft: SessionDraftPayload,
): Promise<SpecularCreateResponse> {
  const res = await fetch('/api/specular/verdict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sessionId ? { sessionId, nodeId, draft } : { nodeId, draft }),
  });
  if (!res.ok) {
    await throwApiError(res, 'Failed to evaluate SPECULAR UIX preview');
  }
  return res.json();
}

export async function fetchSpecularPreview(sessionId: string, nodeId: string): Promise<SpecularCreateResponse> {
  const res = await fetch(`/api/specular/preview/${sessionId}/${nodeId}`);
  if (!res.ok) {
    await throwApiError(res, 'Failed to fetch SPECULAR UIX preview');
  }
  return res.json();
}

export async function fetchKnowledgeReviewQueue(options: {
  includeReviewed?: boolean;
  trustLevels?: KnowledgeTrustLevel[];
} = {}): Promise<KnowledgeReviewQueueResponse> {
  const params = new URLSearchParams();
  if (options.includeReviewed) params.set('includeReviewed', '1');
  if (options.trustLevels?.length) params.set('trustLevels', options.trustLevels.join(','));
  const query = params.size > 0 ? `?${params.toString()}` : '';
  const res = await fetch(`/api/knowledge-bank/review${query}`);
  if (!res.ok) {
    await throwApiError(res, 'Failed to fetch Knowledge Bank review queue');
  }
  return res.json();
}

export async function reviewKnowledgeSource(
  payload: KnowledgeReviewTransitionPayload,
): Promise<{ rootDir: string; item: KnowledgeReviewQueueItem; pendingCount: number }> {
  const res = await fetch('/api/knowledge-bank/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    await throwApiError(res, 'Failed to review Knowledge Bank source');
  }
  return res.json();
}

export async function ingestKnowledgeSource(
  payload: KnowledgeExternalIngestPayload,
): Promise<{ rootDir: string; item: KnowledgeReviewQueueItem; pendingCount: number }> {
  const res = await fetch('/api/knowledge-bank/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    await throwApiError(res, 'Failed to ingest Knowledge Bank source');
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
  specularCreate: {
    designProfile: DesignProfile;
    artifacts: SpecularCreateResponse[];
    gate: SpecularBuildDesignSummary;
    warnings: string[];
  };
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
    headers: localApiAuthHeaders({ 'Content-Type': 'application/json' }),
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
