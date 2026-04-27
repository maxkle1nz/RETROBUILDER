#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const server = readFileSync(path.join(ROOT, 'server.ts'), 'utf8');
const bootstrap = readFileSync(path.join(ROOT, 'src/server/bridge-bootstrap.ts'), 'utf8');
const envExample = readFileSync(path.join(ROOT, '.env.example'), 'utf8');
const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8');

function test_bridge_autostarts_by_default_with_opt_out() {
  expect(
    bootstrap.includes("process.env.THEBRIDGE_AUTO_START !== '0'"),
    'Expected THE BRIDGE auto-start to be enabled by default and disabled only by THEBRIDGE_AUTO_START=0.',
  );
  expect(
    server.includes("process.env.THEBRIDGE_AUTO_START !== '0'"),
    'Expected server boot companion to share the same THEBRIDGE_AUTO_START=0 opt-out.',
  );
    expect(
      bootstrap.includes("path.join(homedir(), '.local/src/thebridge-gpt55/target/release/thebridge')"),
      'Expected THE BRIDGE auto-start discovery to prefer the writable local gpt-5.5 runtime before donor paths.',
    );
}

function test_server_boots_and_keeps_bridge_companion_alive() {
  expect(server.includes('import { ensureBridgeRuntime }'), 'Expected server.ts to import ensureBridgeRuntime.');
  expect(server.includes("ensureBridgeCompanion('boot')"), 'Expected server boot to ensure THE BRIDGE before listening.');
  expect(server.includes('startBridgeCompanionLoop()'), 'Expected server boot to start the bridge keepalive loop.');
  expect(server.includes("ensureBridgeCompanion('keepalive')"), 'Expected keepalive loop to re-check THE BRIDGE runtime.');
  expect(server.includes('THEBRIDGE_KEEPALIVE_INTERVAL_MS'), 'Expected keepalive interval to be configurable.');
}

function test_provider_runtime_distinguishes_autostart_config_from_launch_event() {
  const providerRuntime = readFileSync(path.join(ROOT, 'src/server/provider-runtime.ts'), 'utf8');
  expect(
    providerRuntime.includes('autoStart: bridgeRuntime.autoStart'),
    'Expected provider runtime to expose configured bridge autoStart state, not the last launch event.',
  );
  expect(
    providerRuntime.includes('autoStarted: bridgeRuntime.autoStarted'),
    'Expected provider runtime to expose whether the current probe launched THE BRIDGE.',
  );
}

function test_docs_explain_bridge_companion_contract() {
  expect(envExample.includes('THEBRIDGE_COMMAND'), 'Expected .env.example to document THEBRIDGE_COMMAND.');
  expect(envExample.includes('THEBRIDGE_MODEL="gpt-5.5"'), 'Expected .env.example to document the current Codex Bridge default.');
  expect(envExample.includes('CODEX_BINARY'), 'Expected .env.example to document Codex binary override for newly released models.');
    expect(envExample.includes('RETROBUILDER_CODEX_EXEC_TIMEOUT_MS'), 'Expected .env.example to document Bridge Codex execution timeout.');
    expect(envExample.includes('RETROBUILDER_ENABLE_LOCAL_CODEX_FALLBACK=0'), 'Expected .env.example to document the trusted-only local Codex fallback opt-in.');
  expect(envExample.includes('THEBRIDGE_AUTO_START="0"'), 'Expected .env.example to document THEBRIDGE_AUTO_START opt-out.');
  expect(envExample.includes('THEBRIDGE_KEEPALIVE_INTERVAL_MS'), 'Expected .env.example to document keepalive interval.');
  expect(readme.includes('companion runtime'), 'Expected README to describe THE BRIDGE as a companion runtime.');
  expect(readme.includes('THEBRIDGE_AUTO_START="0"'), 'Expected README to document the bridge auto-start opt-out.');
}

function run() {
  const tests = [
    test_bridge_autostarts_by_default_with_opt_out,
    test_server_boots_and_keeps_bridge_companion_alive,
    test_provider_runtime_distinguishes_autostart_config_from_launch_event,
    test_docs_explain_bridge_companion_contract,
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
