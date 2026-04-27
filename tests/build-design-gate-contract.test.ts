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

function test_build_store_hydrates_design_gate_from_remote_lifecycle() {
  const source = read('src/store/useBuildStore.ts');

  expect(source.includes('designProfile?:'), 'Expected build store result state to carry designProfile.');
  expect(source.includes('designGateStatus?:'), 'Expected build store result state to carry designGateStatus.');
  expect(source.includes('designScore?:'), 'Expected build store result state to carry designScore.');
  expect(source.includes('designProfile: remote.designProfile'), 'Expected hydrateBuildLifecycle to copy remote designProfile into buildResult.');
  expect(source.includes('designGateStatus: remote.designGateStatus'), 'Expected hydrateBuildLifecycle to copy remote designGateStatus into buildResult.');
}

function test_build_view_surfaces_design_gate_badge() {
  const source = read('src/components/BuildView.tsx');

  expect(source.includes('buildResult?.designGateStatus'), 'Expected BuildView to read designGateStatus from buildResult.');
  expect(source.includes('21ST {buildResult.designGateStatus}'), 'Expected BuildView header to render a 21st design gate badge.');
}

function test_build_console_surfaces_design_gate_summary() {
  const source = read('src/components/BuildConsole.tsx');

  expect(source.includes('buildResult.designGateStatus'), 'Expected BuildConsole to read designGateStatus from buildResult.');
  expect(source.includes('21st design gate {buildResult.designGateStatus}'), 'Expected BuildConsole completion card to render the design gate summary.');
}

function run() {
  const tests = [
    test_build_store_hydrates_design_gate_from_remote_lifecycle,
    test_build_view_surfaces_design_gate_badge,
    test_build_console_surfaces_design_gate_summary,
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
