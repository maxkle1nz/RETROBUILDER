#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const viteConfig = readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');
const server = readFileSync(path.join(ROOT, 'server.ts'), 'utf8');

function assertWatchIgnores(source: string, label: string) {
  expect(source.includes('RETROBUILDER_WATCH_IGNORES'), `Expected ${label} to define Retrobuilder watcher ignores.`);
  for (const ignoredPath of [
    '**/.retrobuilder/**',
    '**/.omx/**',
    '**/artifacts/**',
    '**/generated-workspace/**',
  ]) {
    expect(source.includes(ignoredPath), `Expected ${label} watcher ignores to include ${ignoredPath}.`);
  }
  expect(
    source.includes('watch: { ignored: RETROBUILDER_WATCH_IGNORES }'),
    `Expected ${label} to apply watcher ignores while HMR is enabled.`,
  );
}

function test_vite_config_ignores_generated_build_outputs() {
  assertWatchIgnores(viteConfig, 'vite.config.ts');
  expect(viteConfig.includes('watch: null'), 'Expected vite.config.ts to keep disabling file watching when DISABLE_HMR=true.');
}

function test_vite_middleware_ignores_generated_build_outputs() {
  assertWatchIgnores(server, 'server.ts');
  expect(server.includes('watch: null'), 'Expected server.ts to keep disabling file watching when DISABLE_HMR=true.');
}

function run() {
  const tests = [
    test_vite_config_ignores_generated_build_outputs,
    test_vite_middleware_ignores_generated_build_outputs,
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
