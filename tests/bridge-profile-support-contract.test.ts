#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const providerRuntime = readFileSync(path.join(ROOT, 'src/server/provider-runtime.ts'), 'utf8');
const bridge = readFileSync(path.join(ROOT, 'src/server/providers/bridge.ts'), 'utf8');

function run() {
  expect(providerRuntime.includes('authProfileProvider'), 'Expected provider runtime diagnostics to expose authProfileProvider.');
  expect(!providerRuntime.includes('only supports openai-codex OAuth'), 'Expected provider runtime to avoid globally blocking github-copilot bridge lanes.');
  expect(bridge.includes('assertStandaloneBridgeProfileSupport'), 'Expected bridge provider to guard standalone donor usage by auth profile support.');
  expect(bridge.includes('only supports openai-codex OAuth'), 'Expected bridge provider to explain why github-copilot cannot use the standalone donor lane.');
  expect(bridge.includes('callGithubCopilotDirectCompletion'), 'Expected bridge provider to support direct GitHub Copilot completions.');
  console.log('PASS bridge profile support contract');
}

run();
