#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const bridge = readFileSync(path.join(ROOT, 'src/server/providers/bridge.ts'), 'utf8');

function run() {
  expect(bridge.includes('const providerDefaultModel = (() => {'), 'Expected bridge provider to derive a profile-aware providerDefaultModel.');
  expect(bridge.includes("if (profileId?.startsWith('github-copilot'))"), 'Expected bridge provider to switch default model when a GitHub Copilot auth profile is selected.');
  expect(bridge.includes('defaultModel: providerDefaultModel'), 'Expected bridge provider to expose the resolved profile-aware default model.');
  console.log('PASS bridge default model contract');
}

run();
