#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const ROOT = path.resolve(import.meta.dirname, '..');

function read(relPath: string) {
  return readFileSync(path.join(ROOT, relPath), 'utf8');
}

function test_build_console_surfaces_merge_rejections() {
  const source = read('src/components/BuildConsole.tsx');

  expect(source.includes('mergeReceipts'), 'Expected BuildConsole to read mergeReceipts from the build store.');
  expect(source.includes('rejectedMerges'), 'Expected BuildConsole to derive a rejectedMerges collection.');
  expect(source.includes('Merge Rejections'), 'Expected BuildConsole to render a dedicated merge rejection section.');
  expect(source.includes('receipt.rejectedPaths'), 'Expected BuildConsole to show rejected paths for merge failures.');
  expect(source.includes('retryOmxTask'), 'Expected BuildConsole merge rejection section to support retrying a rejected task.');
  expect(source.includes('Retry task'), 'Expected BuildConsole merge rejection section to render a retry CTA.');
  expect(source.includes('reassignOmxTaskOwnership'), 'Expected BuildConsole merge rejection section to support ownership reassignment.');
  expect(source.includes('Take ownership & retry'), 'Expected BuildConsole merge rejection section to render an ownership reassignment CTA.');
}

function test_build_view_surfaces_merge_rejection_badge() {
  const source = read('src/components/BuildView.tsx');

  expect(source.includes('rejectedMergeCount'), 'Expected BuildView to derive a rejected merge count from mergeReceipts.');
  expect(source.includes('merge rejected · {rejectedMergeCount}'), 'Expected BuildView header to render a merge rejection badge.');
}

function run() {
  const tests = [
    test_build_console_surfaces_merge_rejections,
    test_build_view_surfaces_merge_rejection_badge,
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
