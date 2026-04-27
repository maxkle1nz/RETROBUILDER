#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const api = readFileSync(path.join(ROOT, 'src/lib/api.ts'), 'utf8');
const runtime = readFileSync(path.join(ROOT, 'src/server/provider-runtime.ts'), 'utf8');
const modal = readFileSync(path.join(ROOT, 'src/components/EnvConfigModal.tsx'), 'utf8');

function run() {
  expect(api.includes('runtime?: {'), 'Expected ProviderInfo to expose bridge runtime diagnostics.');
  expect(runtime.includes('runtime: probe.runtime'), 'Expected collectProviderStates to project probe runtime diagnostics to the frontend.');
  expect(modal.includes('provider.runtime.baseUrl'), 'Expected EnvConfigModal to surface bridge runtime baseUrl.');
  expect(modal.includes('provider.runtime.command'), 'Expected EnvConfigModal to surface bridge runtime command.');
    expect(modal.includes('provider.runtime.installed'), 'Expected EnvConfigModal to surface bridge runtime installed status.');
    expect(modal.includes('provider.runtime.autoStart'), 'Expected EnvConfigModal to surface bridge runtime auto-start status.');
    expect(modal.includes('provider.runtime.autoStarted'), 'Expected EnvConfigModal to surface bridge runtime launch event status.');
    expect(modal.includes('provider.runtime.protocol'), 'Expected EnvConfigModal to surface bridge runtime protocol.');
  expect(modal.includes('provider.runtime.source'), 'Expected EnvConfigModal to surface bridge runtime source.');
  console.log('PASS bridge runtime visibility contract');
}

run();
