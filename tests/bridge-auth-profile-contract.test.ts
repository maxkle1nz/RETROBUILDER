#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const bridge = readFileSync(path.join(ROOT, 'src/server/providers/bridge.ts'), 'utf8');
const runtime = readFileSync(path.join(ROOT, 'src/server/provider-runtime.ts'), 'utf8');
const modal = readFileSync(path.join(ROOT, 'src/components/EnvConfigModal.tsx'), 'utf8');

function run() {
  expect(bridge.includes('THEBRIDGE_AUTH_PROFILE'), 'Expected bridge provider to read THEBRIDGE_AUTH_PROFILE.');
  expect(bridge.includes('requestBody.profileId = profileId'), 'Expected bridge provider to pass profileId through requestBody when selected.');
  expect(runtime.includes('authProfile: process.env.THEBRIDGE_AUTH_PROFILE || null'), 'Expected provider runtime to expose selected bridge auth profile in runtime diagnostics.');
  expect(modal.includes('authProfile:'), 'Expected EnvConfigModal to surface selected bridge auth profile in provider diagnostics.');
  console.log('PASS bridge auth profile contract');
}

run();
