#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');

function checkIgnored(relativePath: string) {
  const result = spawnSync('git', ['check-ignore', '--quiet', '--no-index', relativePath], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  expect(result.status === 0, `Expected ${relativePath} to be ignored by .gitignore.`);
}

function run() {
  const gitignore = readFileSync(path.join(ROOT, '.gitignore'), 'utf8');

  for (const requiredPattern of [
    '.omx-codex-app-bridge/',
    'artifacts/',
    'doc/reports/',
    '.codex/prompts/ingest_roots.json',
    '**/__pycache__/',
    '*.py[cod]',
    'retrobuilder-*.png',
  ]) {
    expect(gitignore.includes(requiredPattern), `Expected .gitignore to include ${requiredPattern}.`);
  }

  for (const ignoredPath of [
    '.omx-codex-app-bridge/vendor/oh-my-codex/node_modules/typescript/lib/typescript.js',
    '.omx-codex-app-bridge/runs/20260423-070241-omx.log',
    'artifacts/specular/screenshot.png',
    'doc/reports/retrobuilder-stress-campaign-bakeryit-2026-04-23.json',
    'doc/reports/bakeryit-preview-2026-04-23.png',
    'doc/reports/casacare-mobile-preview.html',
    'doc/reports/retrobuilder-design-system-audit-2026-04-24.md',
    '.codex/prompts/ingest_roots.json',
    'tests/__pycache__/chromium_binary.cpython-314.pyc',
    'retrobuilder-cut-crown-21st-final.png',
    'retrobuilder-home-snapshot.md',
  ]) {
    checkIgnored(ignoredPath);
  }

  console.log('PASS git hygiene contract');
}

run();
