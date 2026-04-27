#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const bridge = readFileSync(path.join(ROOT, 'src/server/providers/bridge.ts'), 'utf8');

function run() {
  expect(bridge.includes('listGithubCopilotDirectModels'), 'Expected bridge provider to expose a GitHub Copilot direct model inventory helper.');
  expect(bridge.includes('https://api.individual.githubcopilot.com/models'), 'Expected bridge provider to query the live GitHub Copilot model inventory endpoint.');
  expect(bridge.includes("id: `github-copilot/${modelId}`"), 'Expected bridge provider to namespace direct GitHub model ids under github-copilot/.');
  console.log('PASS bridge github model inventory contract');
}

run();
