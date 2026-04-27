#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const bridge = readFileSync(path.join(ROOT, 'src/server/providers/bridge.ts'), 'utf8');
const providerRuntime = readFileSync(path.join(ROOT, 'src/server/provider-runtime.ts'), 'utf8');

function run() {
  expect(bridge.includes('callGithubCopilotDirectCompletion'), 'Expected bridge provider to expose a direct GitHub Copilot completion helper.');
  expect(bridge.includes('https://api.individual.githubcopilot.com/chat/completions'), 'Expected bridge provider to support the direct GitHub Copilot chat completions endpoint.');
  expect(bridge.includes('https://api.individual.githubcopilot.com/responses'), 'Expected bridge provider to try the direct GitHub Copilot responses endpoint first.');
  expect(bridge.includes("'Copilot-Integration-Id': 'vscode-chat'"), 'Expected bridge provider to include GitHub Copilot integration headers.');
  expect(!providerRuntime.includes('only supports openai-codex OAuth'), 'Expected provider runtime to stop marking github-copilot bridge lanes as universally blocked.');
  console.log('PASS bridge github copilot completions contract');
}

run();
