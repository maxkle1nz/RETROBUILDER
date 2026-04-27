#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');

function read(relPath: string) {
  return readFileSync(path.join(ROOT, relPath), 'utf8');
}

function test_right_panel_exposes_knowledge_bank_tab() {
  const source = read('src/components/RightPanel.tsx');

  expect(source.includes("import KnowledgeBankPanel from './KnowledgeBankPanel';"), 'Expected RightPanel to import KnowledgeBankPanel.');
  expect(source.includes("'knowledge'"), 'Expected PanelTab union to include knowledge.');
  expect(source.includes("label: 'Knowledge'"), 'Expected RightPanel tab registry to expose Knowledge tab.');
  expect(source.includes('<KnowledgeBankPanel />'), 'Expected RightPanel to render the Knowledge Bank panel.');
}

function test_knowledge_bank_panel_supports_queue_ingest_and_review_actions() {
  const source = read('src/components/KnowledgeBankPanel.tsx');

  expect(source.includes('fetchKnowledgeReviewQueue'), 'Expected KnowledgeBankPanel to fetch the review queue.');
  expect(source.includes('ingestKnowledgeSource'), 'Expected KnowledgeBankPanel to ingest sources into quarantine.');
  expect(source.includes('reviewKnowledgeSource'), 'Expected KnowledgeBankPanel to review sources.');
  expect(source.includes('Approve'), 'Expected KnowledgeBankPanel to expose approve action.');
  expect(source.includes('Stage'), 'Expected KnowledgeBankPanel to expose stage action.');
  expect(source.includes('Block'), 'Expected KnowledgeBankPanel to expose block action.');
  expect(source.includes('Default retrieval only uses `verified` sources'), 'Expected KnowledgeBankPanel to explain the safety rule.');
}

function test_frontend_api_exposes_knowledge_bank_review_helpers() {
  const source = read('src/lib/api.ts');

  expect(source.includes('export interface KnowledgeReviewQueueItem'), 'Expected api.ts to expose KnowledgeReviewQueueItem.');
  expect(source.includes('fetchKnowledgeReviewQueue'), 'Expected api.ts to expose fetchKnowledgeReviewQueue.');
  expect(source.includes('/api/knowledge-bank/review'), 'Expected api.ts to call Knowledge Bank review route.');
  expect(source.includes('reviewKnowledgeSource'), 'Expected api.ts to expose reviewKnowledgeSource.');
  expect(source.includes('ingestKnowledgeSource'), 'Expected api.ts to expose ingestKnowledgeSource.');
  expect(source.includes('/api/knowledge-bank/ingest'), 'Expected api.ts to call Knowledge Bank ingest route.');
}

function run() {
  const tests = [
    test_right_panel_exposes_knowledge_bank_tab,
    test_knowledge_bank_panel_supports_queue_ingest_and_review_actions,
    test_frontend_api_exposes_knowledge_bank_review_helpers,
  ];

  let passed = 0;
  for (const test of tests) {
    try {
      test();
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

run();
