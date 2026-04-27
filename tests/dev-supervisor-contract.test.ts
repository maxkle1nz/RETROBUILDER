#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const supervisor = readFileSync(path.join(ROOT, 'scripts/dev-supervisor.sh'), 'utf8');

function test_package_json_exposes_dev_supervisor_scripts() {
  expect(pkg.scripts['dev:supervisor:start'], 'Expected package.json to expose dev:supervisor:start');
  expect(pkg.scripts['dev:supervisor:stop'], 'Expected package.json to expose dev:supervisor:stop');
  expect(pkg.scripts['dev:supervisor:restart'], 'Expected package.json to expose dev:supervisor:restart');
  expect(pkg.scripts['dev:supervisor:status'], 'Expected package.json to expose dev:supervisor:status');
}

function test_supervisor_persists_pid_and_log_state() {
  expect(supervisor.includes('dev-supervisor.pid'), 'Expected supervisor to persist a PID file.');
  expect(supervisor.includes('dev-supervisor.log'), 'Expected supervisor to persist a log file.');
  expect(supervisor.includes('health_check'), 'Expected supervisor script to perform health checks.');
  expect(supervisor.includes('restarting server'), 'Expected supervisor to restart the server after unexpected exit.');
  expect(supervisor.includes('wait_for_port_release'), 'Expected supervisor to wait for port release before restarting.');
}

function run() {
  const tests = [
    test_package_json_exposes_dev_supervisor_scripts,
    test_supervisor_persists_pid_and_log_state,
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
