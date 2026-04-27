import { queryKnowledgeBank } from './knowledge-bank-store.js';
import type {
  KnowledgeBankSnapshot,
  KnowledgeQuerySpec,
  KnowledgeSourceKind,
  KnowledgeTrustLevel,
} from './knowledge-bank-types.js';

export interface KnowledgeGoldenQuery {
  id: string;
  query: string;
  stage?: KnowledgeQuerySpec['stage'];
  nodeRef?: KnowledgeQuerySpec['nodeRef'];
  selectedPackIds?: string[];
  families?: string[];
  sourceKinds?: KnowledgeSourceKind[];
  trustLevels?: KnowledgeTrustLevel[];
  topK?: number;
  maxChunksPerDocument?: number;
  minResults?: number;
  requiredDocIds?: string[];
  requiredPackIds?: string[];
  forbiddenDocIds?: string[];
  forbiddenPackIds?: string[];
  expectedTopDocId?: string;
}

export interface KnowledgeEvalCaseResult {
  id: string;
  passed: boolean;
  score: number;
  failures: string[];
  selectedDocIds: string[];
  selectedPackIds: string[];
  selectedChunkIds: string[];
  receiptId: string;
}

export interface KnowledgeEvalReport {
  schemaVersion: 'knowledge-bank-eval@1';
  generatedAt: string;
  total: number;
  passed: number;
  failed: number;
  score: number;
  cases: KnowledgeEvalCaseResult[];
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function evaluateCase(snapshot: KnowledgeBankSnapshot, golden: KnowledgeGoldenQuery, generatedAt: string): KnowledgeEvalCaseResult {
  const { results, receipt } = queryKnowledgeBank(snapshot, {
    query: golden.query,
    stage: golden.stage || 'general',
    nodeRef: golden.nodeRef,
    selectedPackIds: golden.selectedPackIds,
    families: golden.families,
    sourceKinds: golden.sourceKinds,
    trustLevels: golden.trustLevels,
    topK: golden.topK,
    maxChunksPerDocument: golden.maxChunksPerDocument,
    generatedAt,
  });
  const selectedDocIds = unique(results.map((result) => result.document.docId));
  const selectedPackIds = unique(results.map((result) => result.document.packId || ''));
  const selectedDocSet = new Set(selectedDocIds);
  const selectedPackSet = new Set(selectedPackIds);
  const failures: string[] = [];
  let checks = 0;

  const check = (condition: boolean, failure: string) => {
    checks += 1;
    if (!condition) failures.push(failure);
  };

  check(results.length >= (golden.minResults ?? 1), `Expected at least ${golden.minResults ?? 1} result(s), got ${results.length}.`);
  for (const docId of golden.requiredDocIds || []) {
    check(selectedDocSet.has(docId), `Expected required doc ${docId}.`);
  }
  for (const packId of golden.requiredPackIds || []) {
    check(selectedPackSet.has(packId), `Expected required pack ${packId}.`);
  }
  for (const docId of golden.forbiddenDocIds || []) {
    check(!selectedDocSet.has(docId), `Forbidden doc ${docId} was selected.`);
  }
  for (const packId of golden.forbiddenPackIds || []) {
    check(!selectedPackSet.has(packId), `Forbidden pack ${packId} was selected.`);
  }
  if (golden.expectedTopDocId) {
    check(results[0]?.document.docId === golden.expectedTopDocId, `Expected top doc ${golden.expectedTopDocId}, got ${results[0]?.document.docId || 'none'}.`);
  }

  const totalChecks = Math.max(1, checks);
  const passedChecks = totalChecks - failures.length;
  return {
    id: golden.id,
    passed: failures.length === 0,
    score: Math.round((passedChecks / totalChecks) * 100),
    failures,
    selectedDocIds,
    selectedPackIds,
    selectedChunkIds: receipt.selectedChunkIds,
    receiptId: receipt.receiptId,
  };
}

export function evaluateKnowledgeBank(
  snapshot: KnowledgeBankSnapshot,
  goldenQueries: KnowledgeGoldenQuery[],
  options: { generatedAt?: string } = {},
): KnowledgeEvalReport {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const cases = goldenQueries.map((golden) => evaluateCase(snapshot, golden, generatedAt));
  const passed = cases.filter((entry) => entry.passed).length;
  const failed = cases.length - passed;
  const score = cases.length === 0
    ? 100
    : Math.round(cases.reduce((sum, entry) => sum + entry.score, 0) / cases.length);

  return {
    schemaVersion: 'knowledge-bank-eval@1',
    generatedAt,
    total: cases.length,
    passed,
    failed,
    score,
    cases,
  };
}
