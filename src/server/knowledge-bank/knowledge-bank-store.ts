import { mkdir, readFile, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import type {
  KnowledgeBankSnapshot,
  KnowledgeChunk,
  KnowledgeContextBundle,
  KnowledgeEvidenceBinding,
  KnowledgeQuerySpec,
  KnowledgeRetrievalReceipt,
  KnowledgeReviewTransition,
  KnowledgeScoreBreakdown,
  KnowledgeSearchResult,
  KnowledgeSourceDocument,
  KnowledgeTrustLevel,
  ExternalKnowledgeEntryInput,
} from './knowledge-bank-types.js';

export const KNOWLEDGE_BANK_SCHEMA_VERSION = 'knowledge-bank@1';
export const DEFAULT_KNOWLEDGE_BANK_ROOT = path.join(process.cwd(), '.retrobuilder', 'knowledge-bank');

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || 'knowledge';
}

export function tokenizeKnowledgeText(value: string) {
  return value.toLowerCase().match(/[a-z0-9]+/g) || [];
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(tokenizeKnowledgeText(text).length * 1.3));
}

function knowledgeDocId(input: Pick<ExternalKnowledgeEntryInput, 'sourceKind' | 'sourceUri' | 'title'>) {
  return `${input.sourceKind}:${slugify(input.title)}-${sha256(input.sourceUri).slice(0, 10)}`;
}

export function createKnowledgeDocument(
  input: Omit<KnowledgeSourceDocument, 'schemaVersion' | 'objectSha'> & { body: string },
): KnowledgeSourceDocument {
  const { body, ...document } = input;
  const objectSha = sha256(stableJson({
    docId: document.docId,
    sourceUri: document.sourceUri,
    body,
    capturedAt: document.capturedAt,
  }));

  return {
    ...document,
    schemaVersion: KNOWLEDGE_BANK_SCHEMA_VERSION,
    tags: unique(document.tags),
    sourceUrls: unique(document.sourceUrls),
    objectSha,
  };
}

export function chunkKnowledgeDocument(
  document: KnowledgeSourceDocument,
  body: string,
  options: { maxChars?: number; overlapChars?: number; keywords?: string[] } = {},
): KnowledgeChunk[] {
  const maxChars = options.maxChars || 1200;
  const overlapChars = options.overlapChars || 120;
  const paragraphs = body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    if (paragraph.length <= maxChars) {
      current = paragraph;
      continue;
    }
    for (let index = 0; index < paragraph.length; index += Math.max(1, maxChars - overlapChars)) {
      chunks.push(paragraph.slice(index, index + maxChars).trim());
    }
    current = '';
  }
  if (current) chunks.push(current);

  return chunks.map((text, ordinal) => {
    const fingerprint = sha256(`${document.docId}:${ordinal}:${text}`);
    return {
      schemaVersion: KNOWLEDGE_BANK_SCHEMA_VERSION,
      chunkId: `${document.docId}#${ordinal + 1}-${fingerprint.slice(0, 12)}`,
      docId: document.docId,
      ordinal,
      text,
      sectionPath: [document.title],
      keywords: unique([...(options.keywords || []), ...document.tags]),
      tokenEstimate: estimateTokens(text),
      fingerprint,
    };
  });
}

export function createExternalKnowledgeEntry(input: ExternalKnowledgeEntryInput): {
  document: KnowledgeSourceDocument;
  chunks: KnowledgeChunk[];
} {
  const capturedAt = input.capturedAt || new Date().toISOString();
  const sourceUrls = unique([input.sourceUri, ...(input.sourceUrls || [])]);
  const trustLevel = input.trustLevel || 'quarantine';
  const reviewStatus = input.reviewStatus || 'pending';
  const document = createKnowledgeDocument({
    docId: input.docId || knowledgeDocId(input),
    title: input.title,
    sourceKind: input.sourceKind,
    sourceUri: input.sourceUri,
    capturedAt,
    trustLevel,
    reviewStatus,
    rightsBasis: input.rightsBasis || 'unreviewed external source; excluded from default retrieval until approved',
    body: input.body,
    tags: input.tags || [],
    sourceUrls,
    license: input.license || {
      allowed: false,
      notes: 'External source license was not reviewed at ingestion time.',
    },
    metadata: {
      ...input.metadata,
      ingestion: {
        defaultTrustLevel: trustLevel,
        defaultReviewStatus: reviewStatus,
        requiresHumanReview: trustLevel !== 'verified' || reviewStatus !== 'approved',
      },
    },
  });

  return {
    document,
    chunks: chunkKnowledgeDocument(document, input.body, input.chunking || {}),
  };
}

export function applyKnowledgeReviewTransition(
  document: KnowledgeSourceDocument,
  transition: KnowledgeReviewTransition,
): KnowledgeSourceDocument {
  const reviewedAt = transition.reviewedAt || new Date().toISOString();
  return {
    ...document,
    trustLevel: transition.trustLevel,
    reviewStatus: transition.reviewStatus,
    rightsBasis: transition.rightsBasis || document.rightsBasis,
    license: transition.license || document.license,
    metadata: {
      ...document.metadata,
      review: {
        trustLevel: transition.trustLevel,
        reviewStatus: transition.reviewStatus,
        reviewer: transition.reviewer,
        reviewedAt,
        notes: transition.notes,
      },
    },
  };
}

export function buildKnowledgeBankSnapshot(
  entries: Array<{ document: KnowledgeSourceDocument; chunks: KnowledgeChunk[] }>,
  generatedAt = new Date().toISOString(),
): KnowledgeBankSnapshot {
  const documents = entries.map((entry) => entry.document).sort((a, b) => a.docId.localeCompare(b.docId));
  const chunks = entries.flatMap((entry) => entry.chunks).sort((a, b) => a.chunkId.localeCompare(b.chunkId));
  return {
    schemaVersion: KNOWLEDGE_BANK_SCHEMA_VERSION,
    generatedAt,
    documents,
    chunks,
  };
}

function documentMatches(
  document: KnowledgeSourceDocument,
  spec: KnowledgeQuerySpec,
  allowedTrustLevels: KnowledgeTrustLevel[],
) {
  if (document.trustLevel === 'blocked') return false;
  if (!allowedTrustLevels.includes(document.trustLevel)) return false;
  if (document.reviewStatus === 'rejected') return false;
  if (spec.selectedPackIds?.length && (!document.packId || !spec.selectedPackIds.includes(document.packId))) return false;
  if (spec.families?.length && (!document.family || !spec.families.includes(document.family))) return false;
  if (spec.sourceKinds?.length && !spec.sourceKinds.includes(document.sourceKind)) return false;
  return true;
}

function scoreChunk(
  document: KnowledgeSourceDocument,
  chunk: KnowledgeChunk,
  spec: KnowledgeQuerySpec,
  documentHitCount: number,
): KnowledgeScoreBreakdown {
  const queryTokens = tokenizeKnowledgeText([
    spec.query,
    spec.nodeRef?.type || '',
    spec.nodeRef?.screenType || '',
  ].join(' '));
  const querySet = new Set(queryTokens);
  const chunkTokens = tokenizeKnowledgeText(chunk.text);
  const chunkSet = new Set(chunkTokens);
  const tagSet = new Set([...document.tags, ...chunk.keywords].flatMap(tokenizeKnowledgeText));

  const lexical = [...querySet].filter((token) => chunkSet.has(token)).length;
  const keyword = [...querySet].filter((token) => tagSet.has(token)).length * 1.5;
  const packAffinity = spec.selectedPackIds?.includes(document.packId || '') ? 4 : 0;
  const trust = document.trustLevel === 'verified' ? 2 : document.trustLevel === 'staged' ? 1 : 0;
  const stagePrior = spec.stage === 'product-dna' && document.sourceKind === 'product-dna-pack' ? 1 : 0;
  const duplicationPenalty = Math.max(0, documentHitCount - 1) * 0.75;
  const total = lexical + keyword + packAffinity + trust + stagePrior - duplicationPenalty;

  return { lexical, keyword, packAffinity, trust, stagePrior, duplicationPenalty, total };
}

export function queryKnowledgeBank(snapshot: KnowledgeBankSnapshot, spec: KnowledgeQuerySpec): {
  results: KnowledgeSearchResult[];
  receipt: KnowledgeRetrievalReceipt;
} {
  const topK = spec.topK || 8;
  const maxChunksPerDocument = spec.maxChunksPerDocument || 2;
  const trustLevels: KnowledgeTrustLevel[] = spec.trustLevels?.length ? spec.trustLevels : ['verified'];
  const documentsById = new Map(snapshot.documents.map((document) => [document.docId, document]));
  const hitCountsByDoc = new Map<string, number>();

  const candidates = snapshot.chunks
    .map((chunk) => {
      const document = documentsById.get(chunk.docId);
      if (!document || !documentMatches(document, spec, trustLevels)) return null;
      const documentHitCount = hitCountsByDoc.get(document.docId) || 0;
      const score = scoreChunk(document, chunk, spec, documentHitCount);
      hitCountsByDoc.set(document.docId, documentHitCount + 1);
      if (score.total <= 0) return null;
      return { document, chunk, score };
    })
    .filter((entry): entry is KnowledgeSearchResult => Boolean(entry))
    .sort((a, b) => b.score.total - a.score.total || a.chunk.chunkId.localeCompare(b.chunk.chunkId));

  const selected: KnowledgeSearchResult[] = [];
  const selectedCountsByDoc = new Map<string, number>();
  for (const candidate of candidates) {
    const count = selectedCountsByDoc.get(candidate.document.docId) || 0;
    if (count >= maxChunksPerDocument) continue;
    selected.push(candidate);
    selectedCountsByDoc.set(candidate.document.docId, count + 1);
    if (selected.length >= topK) break;
  }

  const generatedAt = spec.generatedAt || new Date().toISOString();
  const receiptSeed = stableJson({
    query: spec.query,
    stage: spec.stage || 'general',
    nodeRef: spec.nodeRef || null,
    selectedChunkIds: selected.map((result) => result.chunk.chunkId),
    generatedAt,
  });
  const receipt: KnowledgeRetrievalReceipt = {
    schemaVersion: KNOWLEDGE_BANK_SCHEMA_VERSION,
    receiptId: `kb-receipt-${sha256(receiptSeed).slice(0, 16)}`,
    generatedAt,
    query: spec.query,
    stage: spec.stage || 'general',
    nodeRef: spec.nodeRef,
    filters: {
      selectedPackIds: spec.selectedPackIds || [],
      families: spec.families || [],
      sourceKinds: spec.sourceKinds || [],
      trustLevels,
      topK,
      maxChunksPerDocument,
    },
    selectedChunkIds: selected.map((result) => result.chunk.chunkId),
    selectedDocIds: unique(selected.map((result) => result.document.docId)),
    scoreBreakdown: Object.fromEntries(selected.map((result) => [result.chunk.chunkId, result.score])),
  };

  return { results: selected, receipt };
}

export function buildKnowledgeContextBundle(
  snapshot: KnowledgeBankSnapshot,
  spec: KnowledgeQuerySpec,
): KnowledgeContextBundle {
  const { results, receipt } = queryKnowledgeBank(snapshot, spec);
  const documentsById = new Map(results.map((result) => [result.document.docId, result.document]));
  const evidence: KnowledgeEvidenceBinding[] = results.map((result) => ({
    chunkId: result.chunk.chunkId,
    docId: result.document.docId,
    sourceUri: result.document.sourceUri,
    title: result.document.title,
    score: result.score.total,
    trustLevel: result.document.trustLevel,
  }));
  const promptContext = results.map((result, index) => [
    `Source ${index + 1}: ${result.document.title}`,
    `Trust: ${result.document.trustLevel} | Doc: ${result.document.docId} | Chunk: ${result.chunk.chunkId}`,
    result.chunk.text,
  ].join('\n')).join('\n\n---\n\n');

  return {
    schemaVersion: KNOWLEDGE_BANK_SCHEMA_VERSION,
    query: spec,
    documents: [...documentsById.values()],
    chunks: results.map((result) => result.chunk),
    evidence,
    receipt,
    promptContext,
  };
}

export async function persistKnowledgeBankSnapshot(
  snapshot: KnowledgeBankSnapshot,
  rootDir = DEFAULT_KNOWLEDGE_BANK_ROOT,
) {
  const objectsDir = path.join(rootDir, 'objects');
  const documentsDir = path.join(rootDir, 'documents');
  const chunksDir = path.join(rootDir, 'chunks');
  await Promise.all([
    mkdir(objectsDir, { recursive: true }),
    mkdir(documentsDir, { recursive: true }),
    mkdir(chunksDir, { recursive: true }),
  ]);

  await writeFile(path.join(rootDir, 'snapshot.json'), JSON.stringify(snapshot, null, 2));
  await Promise.all(snapshot.documents.map(async (document) => {
    await writeFile(path.join(objectsDir, `${document.objectSha}.json`), JSON.stringify(document, null, 2));
    await writeFile(path.join(documentsDir, `${slugify(document.docId)}.json`), JSON.stringify(document, null, 2));
  }));
  await Promise.all(snapshot.chunks.map(async (chunk) => {
    await writeFile(path.join(chunksDir, `${slugify(chunk.chunkId)}.json`), JSON.stringify(chunk, null, 2));
  }));
}

export async function readKnowledgeBankSnapshot(rootDir = DEFAULT_KNOWLEDGE_BANK_ROOT): Promise<KnowledgeBankSnapshot> {
  const raw = await readFile(path.join(rootDir, 'snapshot.json'), 'utf8');
  return JSON.parse(raw) as KnowledgeBankSnapshot;
}

export async function persistRetrievalReceipt(
  receipt: KnowledgeRetrievalReceipt,
  rootDir = DEFAULT_KNOWLEDGE_BANK_ROOT,
) {
  const receiptDir = path.join(rootDir, 'receipts', receipt.nodeRef?.id || 'global', receipt.stage);
  await mkdir(receiptDir, { recursive: true });
  await writeFile(path.join(receiptDir, `${receipt.receiptId}.json`), JSON.stringify(receipt, null, 2));
}
