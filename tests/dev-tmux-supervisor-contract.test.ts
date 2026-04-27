#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const script = readFileSync(path.join(ROOT, 'scripts/dev-tmux-supervisor.sh'), 'utf8');

function test_package_json_exposes_dev_tmux_scripts() {
  expect(pkg.scripts['dev:tmux:start'], 'Expected package.json to expose dev:tmux:start');
  expect(pkg.scripts['dev:tmux:stop'], 'Expected package.json to expose dev:tmux:stop');
  expect(pkg.scripts['dev:tmux:restart'], 'Expected package.json to expose dev:tmux:restart');
  expect(pkg.scripts['dev:tmux:status'], 'Expected package.json to expose dev:tmux:status');
}

function test_tmux_supervisor_wraps_dev_supervisor() {
  expect(script.includes('tmux new-session -d'), 'Expected tmux supervisor to launch a detached session.');
  expect(script.includes("bash '$SUPERVISOR_SCRIPT' run"), 'Expected tmux supervisor to run the dev supervisor loop inside tmux.');
  expect(script.includes('attach-session'), 'Expected tmux supervisor to support attaching to the session.');
}

function run() {
  const tests = [
    test_package_json_exposes_dev_tmux_scripts,
    test_tmux_supervisor_wraps_dev_supervisor,
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
