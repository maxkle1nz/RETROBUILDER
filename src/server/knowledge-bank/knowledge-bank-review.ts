import {
  applyKnowledgeReviewTransition,
  buildKnowledgeBankSnapshot,
} from './knowledge-bank-store.js';
import type {
  KnowledgeBankSnapshot,
  KnowledgeChunk,
  KnowledgeReviewStatus,
  KnowledgeReviewTransition,
  KnowledgeSourceDocument,
  KnowledgeTrustLevel,
} from './knowledge-bank-types.js';

export interface KnowledgeReviewQueueItem {
  docId: string;
  title: string;
  sourceKind: string;
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

function itemFromDocument(document: KnowledgeSourceDocument, chunks: KnowledgeChunk[]): KnowledgeReviewQueueItem {
  const documentChunks = chunks.filter((chunk) => chunk.docId === document.docId);
  return {
    docId: document.docId,
    title: document.title,
    sourceKind: document.sourceKind,
    sourceUri: document.sourceUri,
    capturedAt: document.capturedAt,
    trustLevel: document.trustLevel,
    reviewStatus: document.reviewStatus,
    rightsBasis: document.rightsBasis,
    objectSha: document.objectSha,
    sourceUrls: document.sourceUrls,
    tags: document.tags,
    chunkCount: documentChunks.length,
    tokenEstimate: documentChunks.reduce((sum, chunk) => sum + chunk.tokenEstimate, 0),
    review: document.metadata?.review as Record<string, unknown> | undefined,
  };
}

function needsReview(document: KnowledgeSourceDocument) {
  if (document.trustLevel === 'blocked') return true;
  if (document.reviewStatus !== 'approved') return true;
  return document.trustLevel !== 'verified';
}

export function listKnowledgeReviewQueue(
  snapshot: KnowledgeBankSnapshot,
  options: { includeReviewed?: boolean; trustLevels?: KnowledgeTrustLevel[] } = {},
): KnowledgeReviewQueueItem[] {
  const trustLevels = options.trustLevels?.length ? new Set(options.trustLevels) : null;
  return snapshot.documents
    .filter((document) => (options.includeReviewed ? true : needsReview(document)))
    .filter((document) => (trustLevels ? trustLevels.has(document.trustLevel) : true))
    .map((document) => itemFromDocument(document, snapshot.chunks))
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt) || a.docId.localeCompare(b.docId));
}

export function applyKnowledgeReviewToSnapshot(
  snapshot: KnowledgeBankSnapshot,
  docId: string,
  transition: KnowledgeReviewTransition,
): { snapshot: KnowledgeBankSnapshot; item: KnowledgeReviewQueueItem } {
  const target = snapshot.documents.find((document) => document.docId === docId);
  if (!target) {
    throw new Error(`Knowledge source not found: ${docId}`);
  }
  const updated = applyKnowledgeReviewTransition(target, transition);
  const documents = snapshot.documents.map((document) => (document.docId === docId ? updated : document));
  const nextSnapshot = buildKnowledgeBankSnapshot(
    documents.map((document) => ({
      document,
      chunks: snapshot.chunks.filter((chunk) => chunk.docId === document.docId),
    })),
    transition.reviewedAt || new Date().toISOString(),
  );
  return {
    snapshot: nextSnapshot,
    item: itemFromDocument(updated, snapshot.chunks),
  };
}

export function upsertKnowledgeReviewEntry(
  snapshot: KnowledgeBankSnapshot,
  entry: { document: KnowledgeSourceDocument; chunks: KnowledgeChunk[] },
  generatedAt = new Date().toISOString(),
): KnowledgeBankSnapshot {
  const documents = snapshot.documents.filter((document) => document.docId !== entry.document.docId);
  const chunks = snapshot.chunks.filter((chunk) => chunk.docId !== entry.document.docId);
  return buildKnowledgeBankSnapshot([
    ...documents.map((document) => ({
      document,
      chunks: chunks.filter((chunk) => chunk.docId === document.docId),
    })),
    entry,
  ], generatedAt);
}
