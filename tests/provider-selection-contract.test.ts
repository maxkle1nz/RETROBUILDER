#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const source = readFileSync(path.join(ROOT, 'src/server/provider-runtime.ts'), 'utf8');

function run() {
  expect(source.includes('strictSelectedProviderModeEnabled'), 'Expected provider runtime to define strict selected-provider mode policy.');
  expect(source.includes('AI_STRICT_PROVIDER_MODE'), 'Expected provider runtime to gate fallback behavior behind AI_STRICT_PROVIDER_MODE.');
  expect(source.includes('failed on selected provider'), 'Expected strict selected-provider mode to fail explicitly on the active provider instead of silently falling back.');
  console.log('PASS provider selection contract');
}

run();
