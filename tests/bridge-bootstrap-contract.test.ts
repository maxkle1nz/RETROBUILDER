#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const bootstrap = readFileSync(path.join(ROOT, 'src/server/bridge-bootstrap.ts'), 'utf8');
const runtime = readFileSync(path.join(ROOT, 'src/server/provider-runtime.ts'), 'utf8');
const bridge = readFileSync(path.join(ROOT, 'src/server/providers/bridge.ts'), 'utf8');

function run() {
  expect(bootstrap.includes('ensureBridgeRuntime'), 'Expected bridge bootstrap helper to expose ensureBridgeRuntime.');
  expect(bootstrap.includes('inspectBridgeRuntime'), 'Expected bridge bootstrap helper to expose inspectBridgeRuntime.');
  expect(bootstrap.includes("protocol: 'standalone'"), 'Expected bridge bootstrap helper to understand standalone donor bridge protocol.');
  expect(bootstrap.includes('defaultDonorEntry'), 'Expected bridge bootstrap helper to discover the local donor bridge CLI when PATH bridge is missing.');
  expect(bootstrap.includes("process.env.THEBRIDGE_AUTO_START !== '0'"), 'Expected bridge bootstrap helper to auto-start by default with opt-out only.');
  expect(bootstrap.includes('toBridgeServeCommand'), 'Expected OpenAI-compatible bridge bootstrap to append the serve subcommand.');
  expect(runtime.includes('bridgeUnavailableMessage'), 'Expected provider runtime to expose bridgeUnavailableMessage helper.');
  expect(bridge.includes('createBridgeRuntimeError'), 'Expected bridge provider to build explicit runtime errors.');
  expect(bridge.includes('callStandaloneBridgeResponse'), 'Expected bridge provider to support standalone donor response protocol when OpenAI-compatible bridge is absent.');
  console.log('PASS bridge bootstrap contract');
}

run();
