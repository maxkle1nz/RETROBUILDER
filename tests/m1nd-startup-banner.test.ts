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

function test_server_banner_reports_bootstrap_pending_instead_of_false_degraded_mode() {
  const server = read('server.ts');

  expect(server.includes('bootstrapping · handshake pending'), 'Expected startup banner to report m1nd bootstrap pending instead of degraded mode during non-blocking connect.');
  expect(!server.includes("pad(m1ndBridge.isConnected ? 'graph engine · structural awareness' : 'offline · degraded mode'"), 'Expected startup banner to stop hardcoding offline degraded mode during initial bridge bootstrap.');
}

function test_m1nd_bridge_connect_remains_non_blocking() {
  const bridge = read('src/server/m1nd-bridge.ts');

  expect(bridge.includes("Non-blocking connect — don't hold up server boot"), 'Expected initM1ndBridge to remain non-blocking.');
  expect(bridge.includes('b.connect().then((ok) => {'), 'Expected initM1ndBridge to perform the async bridge connection after boot.');
}

function test_m1nd_stdio_child_disables_embedded_gui_by_default() {
  const bridge = read('src/server/m1nd-bridge.ts');
  const envExample = read('.env.example');

  expect(bridge.includes("return ['--no-gui'];"), 'Expected backend m1nd stdio child to default to --no-gui.');
  expect(bridge.includes('M1ND_MCP_ARGS'), 'Expected backend m1nd args to remain configurable.');
  expect(bridge.includes('spawn(this.m1ndCommand, this.m1ndArgs'), 'Expected m1nd bridge to pass resolved args to the child process.');
  expect(envExample.includes('M1ND_MCP_ARGS="--no-gui"'), 'Expected .env.example to document default m1nd child args.');
}

function run() {
  const tests = [
    test_server_banner_reports_bootstrap_pending_instead_of_false_degraded_mode,
    test_m1nd_bridge_connect_remains_non_blocking,
    test_m1nd_stdio_child_disables_embedded_gui_by_default,
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
