#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');

function read(relativePath: string) {
  return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function expectIncludes(relativePath: string, text: string) {
  expect(read(relativePath).includes(text), `Expected ${relativePath} to include ${text}.`);
}

function run() {
    expectIncludes('AGENTS.md', 'Think before coding');
    expectIncludes('.codex/config.toml', 'Behavioral baseline');
    expectIncludes('.codex/config.toml', 'Frontend baseline');
    expectIncludes('.codex/config.toml', 'Retrobuilder vanguard pattern database');
    expectIncludes('.codex/config.toml', 'COBE globe/map systems');
    expectIncludes('.codex/config.toml', 'shader/dither/ripple/canvas backgrounds');

  for (const relativePath of [
    '.codex/prompts/designer.md',
    '.codex/agents/designer.toml',
  ]) {
      expectIncludes(relativePath, 'product_realism_gate');
      expectIncludes(relativePath, 'Build the user-facing product');
      expectIncludes(relativePath, '21st references are mandatory design inputs');
      expectIncludes(relativePath, 'Retrobuilder vanguard pattern database');
      expectIncludes(relativePath, 'Stack translation is mandatory');
      expectIncludes(relativePath, 'COBE globe/map systems');
      expectIncludes(relativePath, 'story/chat surfaces');
      expectIncludes(relativePath, 'shader/dither/ripple/canvas backgrounds');
    }

  for (const relativePath of [
    '.codex/prompts/executor.md',
    '.codex/agents/executor.toml',
  ]) {
    expectIncludes(relativePath, 'behavioral_guidelines');
      expectIncludes(relativePath, 'frontend_product_gate');
      expectIncludes(relativePath, 'Never render raw JSON');
      expectIncludes(relativePath, 'Retrobuilder vanguard pattern database');
      expectIncludes(relativePath, 'Stack translation is required');
      expectIncludes(relativePath, 'Base UI');
      expectIncludes(relativePath, 'Paper shaders');
      expectIncludes(relativePath, 'visx');
    }

  console.log('PASS omx agent guidelines contract');
}

run();
