#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const api = readFileSync(path.join(ROOT, 'src/lib/api.ts'), 'utf8');
const store = readFileSync(path.join(ROOT, 'src/store/useBuildStore.ts'), 'utf8');

function run() {
  expect(api.includes('verifyReceipts?: Record<string'), 'Expected OmxBuildStatus to expose verifyReceipts.');
  expect(api.includes('mergeReceipts?: Record<string'), 'Expected OmxBuildStatus to expose mergeReceipts.');
  expect(api.includes("systemVerify?: {"), 'Expected OmxBuildStatus result to expose final system verify state.');
  expect(store.includes('remote.verifyReceipts'), 'Expected hydrateBuildLifecycle to hydrate verifyReceipts from remote status.');
  expect(store.includes('remote.mergeReceipts'), 'Expected hydrateBuildLifecycle to hydrate mergeReceipts from remote status.');
  expect(store.includes('remote.result.systemVerify'), 'Expected hydrateBuildLifecycle to hydrate final system verify state from remote status.');
  expect(store.includes('documentationQualityFailed'), 'Expected live build_complete handling to treat failed documentation quality as a failed build.');
  expect(store.includes("event.documentation?.quality.status === 'failed'"), 'Expected build_complete to inspect documentation quality status.');
  expect(store.includes('const terminalStatus = event.status ||'), 'Expected build_complete to honor terminal status emitted by the runtime.');
  expect(store.includes('specularGateApproved === false || systemVerifyFailed || documentationQualityFailed'), 'Expected build status resolution to combine design, system verify, and documentation gates.');
  console.log('PASS build status reentry contract');
}

run();
