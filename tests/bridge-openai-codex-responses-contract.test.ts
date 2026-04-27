#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const bridge = readFileSync(path.join(ROOT, 'src/server/providers/bridge.ts'), 'utf8');
const configRoute = readFileSync(path.join(ROOT, 'src/server/routes/config.ts'), 'utf8');

function run() {
  expect(bridge.includes("const BRIDGE_DEFAULT_MODEL = process.env.THEBRIDGE_MODEL || 'gpt-5.5';"), 'Expected bridge provider to default to gpt-5.5 for openai-codex responses when no override is set.');
  expect(bridge.includes('instructions: toStandaloneBridgeInstructions(messages)'), 'Expected standalone bridge response calls to include required instructions.');
  expect(configRoute.includes('resolvedDefaultModel'), 'Expected AI models route to pick a default model that actually exists in the returned model list.');
  console.log('PASS bridge openai codex responses contract');
}

run();
