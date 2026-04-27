#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const ROOT = path.resolve(import.meta.dirname, '..');
const html = readFileSync(path.join(ROOT, 'dist/index.html'), 'utf8');

function test_dist_html_does_not_preload_uix_builder_or_overlays() {
  expect(!html.includes('uix-'), 'Expected dist/index.html to stop preloading the UIX chunk.');
  expect(!html.includes('builder-'), 'Expected dist/index.html to stop preloading the builder chunk.');
  expect(!html.includes('overlays-'), 'Expected dist/index.html to stop preloading the overlays chunk.');
}

function test_dist_html_keeps_core_vendor_preloads() {
  expect(html.includes('vendor-'), 'Expected dist/index.html to preload the shared vendor chunk.');
  expect(html.includes('xyflow-'), 'Expected dist/index.html to preload XYFlow runtime.');
  expect(html.includes('motion-'), 'Expected dist/index.html to preload motion runtime.');
}

function run() {
  const tests = [
    test_dist_html_does_not_preload_uix_builder_or_overlays,
    test_dist_html_keeps_core_vendor_preloads,
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
