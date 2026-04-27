#!/usr/bin/env tsx
import express from 'express';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { createKnowledgeBankRouter } from '../src/server/routes/knowledge-bank.ts';
import {
  buildKnowledgeBankSnapshot,
  createExternalKnowledgeEntry,
  persistKnowledgeBankSnapshot,
  queryKnowledgeBank,
  readKnowledgeBankSnapshot,
} from '../src/server/knowledge-bank/knowledge-bank-store.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function truncate(text: string, max = 240) {
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

async function withKnowledgeServer<T>(rootDir: string, run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(createKnowledgeBankRouter({ rootDir }));

  const server = await new Promise<import('node:http').Server>((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Failed to resolve Knowledge Bank test server port.');
  }

  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function test_review_route_lists_quarantine_and_promotes_source() {
  const root = mkdtempSync(path.join(tmpdir(), 'retrobuilder-kb-review-'));
  try {
    const entry = createExternalKnowledgeEntry({
      docId: 'web-research:openlovable-design',
      title: 'OpenLovable Design Donor Notes',
      sourceKind: 'web-research',
      sourceUri: 'https://example.com/openlovable-design',
      capturedAt: '2026-04-26T13:00:00.000Z',
      body: 'OpenLovable style donor notes for frontend design motion, component composition, and taste calibration.',
      tags: ['design', 'frontend', 'motion'],
    });
    await persistKnowledgeBankSnapshot(buildKnowledgeBankSnapshot([entry], '2026-04-26T13:00:01.000Z'), root);

    await withKnowledgeServer(root, async (baseUrl) => {
      const queueResponse = await fetch(`${baseUrl}/api/knowledge-bank/review`);
      const queueText = await queueResponse.text();
      const queue = safeJson(queueText) as Record<string, any> | null;

      expect(queueResponse.status === 200, `Expected review queue to succeed. Got ${queueResponse.status}: ${truncate(queueText)}`);
      expect(queue?.pendingCount === 1, `Expected one pending review item. Got: ${truncate(queueText)}`);
      expect(queue?.items?.[0]?.docId === entry.document.docId, `Expected queue item doc id. Got: ${truncate(queueText)}`);
      expect(queue?.items?.[0]?.trustLevel === 'quarantine', `Expected quarantine item. Got: ${truncate(queueText)}`);

      const reviewResponse = await fetch(`${baseUrl}/api/knowledge-bank/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docId: entry.document.docId,
          trustLevel: 'verified',
          reviewStatus: 'approved',
          reviewer: 'codex',
          reviewedAt: '2026-04-26T13:01:00.000Z',
          rightsBasis: 'manual review approved donor notes for internal guidance',
          license: { allowed: true, notes: 'Synthetic route-test source.' },
          notes: 'Approved after trust and license check.',
        }),
      });
      const reviewText = await reviewResponse.text();
      const review = safeJson(reviewText) as Record<string, any> | null;

      expect(reviewResponse.status === 200, `Expected review transition to succeed. Got ${reviewResponse.status}: ${truncate(reviewText)}`);
      expect(review?.pendingCount === 0, `Expected queue to be empty after approval. Got: ${truncate(reviewText)}`);
      expect(review?.item?.trustLevel === 'verified', `Expected reviewed item to be verified. Got: ${truncate(reviewText)}`);
      expect(review?.item?.reviewStatus === 'approved', `Expected reviewed item to be approved. Got: ${truncate(reviewText)}`);

      const afterResponse = await fetch(`${baseUrl}/api/knowledge-bank/review`);
      const afterText = await afterResponse.text();
      const after = safeJson(afterText) as Record<string, any> | null;
      expect(after?.items?.length === 0, `Expected default queue to hide approved verified docs. Got: ${truncate(afterText)}`);
    });

    const snapshot = await readKnowledgeBankSnapshot(root);
    const { results } = queryKnowledgeBank(snapshot, {
      query: 'frontend design motion component donor notes',
      stage: 'general',
      topK: 2,
      generatedAt: '2026-04-26T13:02:00.000Z',
    });
    expect(results.some((result) => result.document.docId === entry.document.docId), 'Expected approved source to become retrievable by default.');
    expect(existsSync(path.join(root, 'snapshot.json')), 'Expected review route to persist the updated snapshot.');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function test_ingest_route_creates_quarantined_review_item() {
  const root = mkdtempSync(path.join(tmpdir(), 'retrobuilder-kb-ingest-'));
  try {
    await withKnowledgeServer(root, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/knowledge-bank/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Playable Game Donor Notes',
          sourceKind: 'donor-doc',
          sourceUri: 'https://example.com/game-donor',
          capturedAt: '2026-04-26T13:03:00.000Z',
          body: 'Playable game donor notes for generated assets, input traces, progression state, and browser smoke checks.',
          tags: ['game', 'assets', 'verification'],
        }),
      });
      const text = await response.text();
      const data = safeJson(text) as Record<string, any> | null;

      expect(response.status === 201, `Expected ingest route to create source. Got ${response.status}: ${truncate(text)}`);
      expect(data?.pendingCount === 1, `Expected ingested source to enter review queue. Got: ${truncate(text)}`);
      expect(data?.item?.trustLevel === 'quarantine', `Expected ingested source to be quarantined. Got: ${truncate(text)}`);
      expect(data?.item?.reviewStatus === 'pending', `Expected ingested source to be pending. Got: ${truncate(text)}`);
      expect(data?.item?.chunkCount >= 1, `Expected ingested source to be chunked. Got: ${truncate(text)}`);
    });

    const snapshot = await readKnowledgeBankSnapshot(root);
    expect(snapshot.documents.length === 1, `Expected persisted snapshot to contain one document. Got: ${snapshot.documents.length}.`);
    expect(snapshot.documents[0].trustLevel === 'quarantine', `Expected persisted source to be quarantined. Got: ${snapshot.documents[0].trustLevel}.`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function test_review_route_rejects_missing_doc_id() {
  const root = mkdtempSync(path.join(tmpdir(), 'retrobuilder-kb-review-invalid-'));
  try {
    await withKnowledgeServer(root, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/knowledge-bank/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trustLevel: 'verified', reviewStatus: 'approved', reviewer: 'codex' }),
      });
      const text = await response.text();
      const data = safeJson(text) as { error?: string } | null;

      expect(response.status === 400, `Expected missing docId to be rejected. Got ${response.status}: ${truncate(text)}`);
      expect(typeof data?.error === 'string' && data.error.includes('docId'), `Expected missing docId error. Got: ${truncate(text)}`);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function run() {
  const tests = [
    test_review_route_lists_quarantine_and_promotes_source,
    test_ingest_route_creates_quarantined_review_item,
    test_review_route_rejects_missing_doc_id,
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
  console.error('FAIL knowledge bank review route contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
