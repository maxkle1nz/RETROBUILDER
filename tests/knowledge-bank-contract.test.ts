#!/usr/bin/env tsx
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  compileActiveProductDnaContract,
  loadProductDnaPacks,
} from '../src/server/product-dna/product-dna-bank.ts';
import { buildProductDnaKnowledgeSnapshot } from '../src/server/knowledge-bank/product-dna-knowledge.ts';
import { evaluateKnowledgeBank } from '../src/server/knowledge-bank/knowledge-bank-eval.ts';
import {
  applyKnowledgeReviewTransition,
  buildKnowledgeContextBundle,
  buildKnowledgeBankSnapshot,
  createExternalKnowledgeEntry,
  persistKnowledgeBankSnapshot,
  persistRetrievalReceipt,
  queryKnowledgeBank,
} from '../src/server/knowledge-bank/knowledge-bank-store.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function test_indexes_product_dna_packs_as_verified_knowledge() {
  const packs = await loadProductDnaPacks();
  const snapshot = buildProductDnaKnowledgeSnapshot(packs, '2026-04-26T12:00:00.000Z');

  expect(snapshot.schemaVersion === 'knowledge-bank@1', 'Expected Knowledge Bank schema version.');
  expect(snapshot.generatedAt === '2026-04-26T12:00:00.000Z', 'Expected deterministic snapshot timestamp.');
  expect(snapshot.documents.length === packs.length, `Expected one document per Product DNA pack. Got: ${snapshot.documents.length}.`);
  expect(snapshot.chunks.length >= packs.length, 'Expected at least one chunk per Product DNA pack.');
  expect(snapshot.documents.every((document) => document.trustLevel === 'verified'), 'Expected Product DNA docs to be verified.');
  expect(snapshot.documents.every((document) => document.reviewStatus === 'approved'), 'Expected Product DNA docs to be approved.');
  expect(snapshot.documents.every((document) => /^[a-f0-9]{64}$/.test(document.objectSha)), 'Expected every document to carry a sha256 object hash.');
  expect(snapshot.chunks.every((chunk) => /^[a-f0-9]{64}$/.test(chunk.fingerprint)), 'Expected every chunk to carry a sha256 fingerprint.');
}

async function test_retrieves_game_pack_with_auditable_receipt() {
  const packs = await loadProductDnaPacks();
  const snapshot = buildProductDnaKnowledgeSnapshot(packs, '2026-04-26T12:00:00.000Z');
  const { results, receipt } = queryKnowledgeBank(snapshot, {
    query: 'playable web game with generated art, audio cues, browser verification, input traces and state progression',
    stage: 'product-dna',
    topK: 4,
    generatedAt: '2026-04-26T12:01:00.000Z',
  });

  expect(results.length > 0, 'Expected retrieval results for game query.');
  expect(results.some((result) => result.document.packId === 'game/playable-web-game'), 'Expected game pack evidence.');
  expect(results.some((result) => result.document.packId === 'asset/provenance-safe-media'), 'Expected asset provenance evidence.');
  expect(receipt.receiptId.startsWith('kb-receipt-'), `Expected deterministic receipt id. Got: ${receipt.receiptId}.`);
  expect(receipt.selectedChunkIds.length === results.length, 'Expected receipt to bind every selected chunk.');
  expect(receipt.selectedDocIds.length > 0, 'Expected receipt to bind selected docs.');
  for (const chunkId of receipt.selectedChunkIds) {
    expect(Boolean(receipt.scoreBreakdown[chunkId]), `Expected score breakdown for ${chunkId}.`);
  }
}

async function test_filters_by_pack_and_persists_snapshot_receipt() {
  const packs = await loadProductDnaPacks();
  const snapshot = buildProductDnaKnowledgeSnapshot(packs, '2026-04-26T12:00:00.000Z');
  const bundle = buildKnowledgeContextBundle(snapshot, {
    query: 'license metadata C2PA logo icons stock image provenance',
    stage: 'product-dna',
    selectedPackIds: ['asset/provenance-safe-media'],
    topK: 3,
    generatedAt: '2026-04-26T12:02:00.000Z',
  });

  expect(bundle.documents.length === 1, `Expected selected-pack filter to return one document. Got: ${bundle.documents.length}.`);
  expect(bundle.documents[0].packId === 'asset/provenance-safe-media', `Expected asset pack. Got: ${bundle.documents[0].packId}.`);
  expect(bundle.evidence.every((entry) => entry.docId === bundle.documents[0].docId), 'Expected evidence to point at the filtered document.');
  expect(bundle.promptContext.includes('Trust: verified'), 'Expected prompt context to include trust marker.');

  const root = mkdtempSync(path.join(tmpdir(), 'retrobuilder-kb-'));
  try {
    await persistKnowledgeBankSnapshot(snapshot, root);
    await persistRetrievalReceipt(bundle.receipt, root);
    expect(existsSync(path.join(root, 'snapshot.json')), 'Expected snapshot.json to be persisted.');
    expect(existsSync(path.join(root, 'receipts', 'global', 'product-dna', `${bundle.receipt.receiptId}.json`)), 'Expected retrieval receipt to be persisted.');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function test_product_dna_selector_avoids_substring_slop() {
  const packs = await loadProductDnaPacks();
  const depositionContract = compileActiveProductDnaContract({
    packs,
    generatedAt: '2026-04-26T12:03:00.000Z',
    node: {
      id: 'deposition-viewer',
      intent: 'Court deposition transcript viewer for formal evidence review',
    },
  });
  const depositionPackIds = depositionContract.packBindings.map((binding) => binding.id);
  expect(!depositionPackIds.includes('domain/smb-operations'), `Expected deposition not to match POS/domain pack. Got: ${depositionPackIds.join(', ')}`);

  const posContract = compileActiveProductDnaContract({
    packs,
    generatedAt: '2026-04-26T12:04:00.000Z',
    node: {
      id: 'restaurant-pos',
      intent: 'Restaurant POS invoice payment queue and customer order workflow',
    },
  });
  const posPackIds = posContract.packBindings.map((binding) => binding.id);
  expect(posPackIds.includes('domain/smb-operations'), `Expected explicit POS query to match SMB operations. Got: ${posPackIds.join(', ')}`);
}

async function test_external_sources_start_quarantined_and_are_excluded_by_default() {
  const entry = createExternalKnowledgeEntry({
    title: 'OpenLovable Design Donor Notes',
    sourceKind: 'web-research',
    sourceUri: 'https://example.com/openlovable-design-donor',
    capturedAt: '2026-04-26T12:05:00.000Z',
    body: [
      'OpenLovable design donor systems can guide frontend motion, component composition, and taste calibration.',
      'Use these notes only after source trust, license, and review status are checked.',
    ].join('\n\n'),
    tags: ['design', 'donor', 'frontend', 'motion'],
  });
  const snapshot = buildKnowledgeBankSnapshot([entry], '2026-04-26T12:05:30.000Z');
  const defaultQuery = queryKnowledgeBank(snapshot, {
    query: 'OpenLovable frontend motion design donor',
    stage: 'general',
    topK: 3,
    generatedAt: '2026-04-26T12:06:00.000Z',
  });

  expect(entry.document.trustLevel === 'quarantine', `Expected external source to enter quarantine. Got: ${entry.document.trustLevel}.`);
  expect(entry.document.reviewStatus === 'pending', `Expected external source to start pending review. Got: ${entry.document.reviewStatus}.`);
  expect(defaultQuery.results.length === 0, `Expected default retrieval to exclude quarantined external docs. Got: ${defaultQuery.results.length}.`);
  expect(defaultQuery.receipt.filters.trustLevels.join(',') === 'verified', `Expected default retrieval to allow only verified docs. Got: ${defaultQuery.receipt.filters.trustLevels.join(',')}.`);

  const quarantineQuery = queryKnowledgeBank(snapshot, {
    query: 'OpenLovable frontend motion design donor',
    stage: 'general',
    sourceKinds: ['web-research'],
    trustLevels: ['quarantine'],
    topK: 3,
    generatedAt: '2026-04-26T12:07:00.000Z',
  });

  expect(quarantineQuery.results.length === 1, `Expected explicit quarantine retrieval for review workflows. Got: ${quarantineQuery.results.length}.`);
  expect(quarantineQuery.results[0].document.docId === entry.document.docId, 'Expected quarantine retrieval to return the quarantined source.');
  expect(quarantineQuery.receipt.filters.trustLevels.join(',') === 'quarantine', `Expected receipt to record quarantine filter. Got: ${quarantineQuery.receipt.filters.trustLevels.join(',')}.`);
}

async function test_review_transition_promotes_external_source_to_default_retrieval() {
  const entry = createExternalKnowledgeEntry({
    title: 'Playable Web Game Donor Notes',
    sourceKind: 'donor-doc',
    sourceUri: 'https://example.com/playable-web-game-donor',
    capturedAt: '2026-04-26T12:08:00.000Z',
    body: 'Playable web game donor notes covering progression, input traces, generated assets, sound cues, and browser smoke checks.',
    tags: ['game', 'assets', 'browser', 'verification'],
  });
  const reviewedDocument = applyKnowledgeReviewTransition(entry.document, {
    trustLevel: 'verified',
    reviewStatus: 'approved',
    reviewer: 'codex',
    reviewedAt: '2026-04-26T12:09:00.000Z',
    rightsBasis: 'manual review accepted source notes for internal guidance',
    license: { allowed: true, notes: 'Synthetic test donor source approved for contract coverage.' },
    notes: 'Promoted after review of source trust and intended internal use.',
  });
  const snapshot = buildKnowledgeBankSnapshot([{ document: reviewedDocument, chunks: entry.chunks }], '2026-04-26T12:09:30.000Z');
  const { results, receipt } = queryKnowledgeBank(snapshot, {
    query: 'playable web game generated assets sound browser verification',
    stage: 'general',
    topK: 3,
    generatedAt: '2026-04-26T12:10:00.000Z',
  });
  const review = reviewedDocument.metadata?.review as Record<string, unknown> | undefined;

  expect(results.length === 1, `Expected verified reviewed donor source to be retrievable by default. Got: ${results.length}.`);
  expect(results[0].document.trustLevel === 'verified', `Expected promoted source trust to be verified. Got: ${results[0].document.trustLevel}.`);
  expect(results[0].document.reviewStatus === 'approved', `Expected promoted source review to be approved. Got: ${results[0].document.reviewStatus}.`);
  expect(review?.reviewer === 'codex', `Expected review metadata to preserve reviewer. Got: ${JSON.stringify(review)}.`);
  expect(receipt.selectedDocIds.includes(reviewedDocument.docId), 'Expected retrieval receipt to bind the reviewed source document.');
}

async function test_evaluates_golden_queries_for_retrieval_regressions() {
  const packs = await loadProductDnaPacks();
  const snapshot = buildProductDnaKnowledgeSnapshot(packs, '2026-04-26T12:11:00.000Z');
  const report = evaluateKnowledgeBank(snapshot, [
    {
      id: 'game-generation',
      query: 'playable web game with generated art, audio cues, browser verification, input traces and state progression',
      stage: 'product-dna',
      topK: 4,
      requiredPackIds: ['game/playable-web-game', 'asset/provenance-safe-media'],
      forbiddenPackIds: ['domain/smb-operations'],
    },
    {
      id: 'small-business-ops',
      query: 'restaurant POS invoice payment queue customer order workflow',
      stage: 'product-dna',
      topK: 4,
      requiredPackIds: ['domain/smb-operations'],
      forbiddenPackIds: ['game/playable-web-game'],
    },
  ], { generatedAt: '2026-04-26T12:12:00.000Z' });

  expect(report.schemaVersion === 'knowledge-bank-eval@1', `Expected eval schema version. Got: ${report.schemaVersion}.`);
  expect(report.total === 2, `Expected two golden queries. Got: ${report.total}.`);
  expect(report.passed === 2, `Expected all golden queries to pass. Got: ${JSON.stringify(report.cases)}.`);
  expect(report.failed === 0, `Expected zero failed golden queries. Got: ${report.failed}.`);
  expect(report.score === 100, `Expected perfect eval score. Got: ${report.score}.`);
  expect(report.cases.every((entry) => entry.receiptId.startsWith('kb-receipt-')), 'Expected every eval case to carry a retrieval receipt.');
}

async function test_evaluation_report_exposes_failed_golden_requirements() {
  const packs = await loadProductDnaPacks();
  const snapshot = buildProductDnaKnowledgeSnapshot(packs, '2026-04-26T12:13:00.000Z');
  const report = evaluateKnowledgeBank(snapshot, [
    {
      id: 'impossible-pack',
      query: 'playable web game with generated assets',
      stage: 'product-dna',
      requiredPackIds: ['domain/non-existent-pack'],
    },
  ], { generatedAt: '2026-04-26T12:14:00.000Z' });

  expect(report.passed === 0, `Expected impossible golden query to fail. Got: ${report.passed} pass(es).`);
  expect(report.failed === 1, `Expected one failed golden query. Got: ${report.failed}.`);
  expect(report.score < 100, `Expected failed eval to reduce score. Got: ${report.score}.`);
  expect(report.cases[0].failures.some((failure) => failure.includes('domain/non-existent-pack')), `Expected failure to name missing pack. Got: ${report.cases[0].failures.join(' | ')}.`);
}

async function run() {
  const tests = [
    test_indexes_product_dna_packs_as_verified_knowledge,
    test_retrieves_game_pack_with_auditable_receipt,
    test_filters_by_pack_and_persists_snapshot_receipt,
    test_product_dna_selector_avoids_substring_slop,
    test_external_sources_start_quarantined_and_are_excluded_by_default,
    test_review_transition_promotes_external_source_to_default_retrieval,
    test_evaluates_golden_queries_for_retrieval_regressions,
    test_evaluation_report_exposes_failed_golden_requirements,
  ];

  let passed = 0;
  for (const test of tests) {
    try {
      await test();
      console.log(`PASS ${test.name}`);
      passed += 1;
    } catch (error) {
      console.error(`FAIL ${test.name}`);
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
  console.log(`\n${passed}/${tests.length} tests passed`);
}

run().catch((error) => {
  console.error('FAIL knowledge bank contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
