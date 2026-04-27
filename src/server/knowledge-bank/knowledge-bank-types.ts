export type KnowledgeBankSchemaVersion = 'knowledge-bank@1';
export type KnowledgeSourceKind =
  | 'product-dna-pack'
  | 'donor-doc'
  | 'web-research'
  | 'internal-doc'
  | 'runtime-receipt'
  | 'asset';
export type KnowledgeTrustLevel = 'quarantine' | 'staged' | 'verified' | 'blocked';
export type KnowledgeReviewStatus = 'pending' | 'approved' | 'rejected';
export type KnowledgeStage =
  | 'product-dna'
  | 'specular-create'
  | 'kompletus-research'
  | 'kompletus-quality'
  | 'omx-build'
  | 'general';

export interface KnowledgeLicense {
  spdx?: string;
  allowed: boolean;
  notes?: string;
}

export interface KnowledgeSourceDocument {
  schemaVersion: KnowledgeBankSchemaVersion;
  docId: string;
  title: string;
  sourceKind: KnowledgeSourceKind;
  sourceUri: string;
  capturedAt: string;
  trustLevel: KnowledgeTrustLevel;
  reviewStatus: KnowledgeReviewStatus;
  rightsBasis: string;
  objectSha: string;
  tags: string[];
  sourceUrls: string[];
  packId?: string;
  family?: string;
  license?: KnowledgeLicense;
  metadata?: Record<string, unknown>;
}

export interface ExternalKnowledgeEntryInput {
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
  license?: KnowledgeLicense;
  metadata?: Record<string, unknown>;
  chunking?: {
    maxChars?: number;
    overlapChars?: number;
    keywords?: string[];
  };
}

export interface KnowledgeReviewTransition {
  trustLevel: KnowledgeTrustLevel;
  reviewStatus: KnowledgeReviewStatus;
  reviewer: string;
  reviewedAt?: string;
  notes?: string;
  rightsBasis?: string;
  license?: KnowledgeLicense;
}

export interface KnowledgeChunk {
  schemaVersion: KnowledgeBankSchemaVersion;
  chunkId: string;
  docId: string;
  ordinal: number;
  text: string;
  sectionPath: string[];
  keywords: string[];
  tokenEstimate: number;
  fingerprint: string;
}

export interface KnowledgeBankSnapshot {
  schemaVersion: KnowledgeBankSchemaVersion;
  generatedAt: string;
  documents: KnowledgeSourceDocument[];
  chunks: KnowledgeChunk[];
}

export interface KnowledgeNodeRef {
  id: string;
  type?: string;
  screenType?: string;
  label?: string;
}

export interface KnowledgeQuerySpec {
  query: string;
  stage?: KnowledgeStage;
  nodeRef?: KnowledgeNodeRef;
  selectedPackIds?: string[];
  families?: string[];
  sourceKinds?: KnowledgeSourceKind[];
  trustLevels?: KnowledgeTrustLevel[];
  topK?: number;
  maxChunksPerDocument?: number;
  generatedAt?: string;
}

export interface KnowledgeScoreBreakdown {
  lexical: number;
  keyword: number;
  packAffinity: number;
  trust: number;
  stagePrior: number;
  duplicationPenalty: number;
  total: number;
}

export interface KnowledgeSearchResult {
  document: KnowledgeSourceDocument;
  chunk: KnowledgeChunk;
  score: KnowledgeScoreBreakdown;
}

export interface KnowledgeRetrievalReceipt {
  schemaVersion: KnowledgeBankSchemaVersion;
  receiptId: string;
  generatedAt: string;
  query: string;
  stage: KnowledgeStage;
  nodeRef?: KnowledgeNodeRef;
  filters: {
    selectedPackIds: string[];
    families: string[];
    sourceKinds: KnowledgeSourceKind[];
    trustLevels: KnowledgeTrustLevel[];
    topK: number;
    maxChunksPerDocument: number;
  };
  selectedChunkIds: string[];
  selectedDocIds: string[];
  scoreBreakdown: Record<string, KnowledgeScoreBreakdown>;
}

export interface KnowledgeEvidenceBinding {
  chunkId: string;
  docId: string;
  sourceUri: string;
  title: string;
  score: number;
  trustLevel: KnowledgeTrustLevel;
}

export interface KnowledgeContextBundle {
  schemaVersion: KnowledgeBankSchemaVersion;
  query: KnowledgeQuerySpec;
  documents: KnowledgeSourceDocument[];
  chunks: KnowledgeChunk[];
  evidence: KnowledgeEvidenceBinding[];
  receipt: KnowledgeRetrievalReceipt;
  promptContext: string;
}
