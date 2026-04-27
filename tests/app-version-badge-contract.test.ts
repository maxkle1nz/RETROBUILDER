#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { version: string };
const app = readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
const viteConfig = readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');
const versionDeclaration = readFileSync(path.join(ROOT, 'src/version.d.ts'), 'utf8');
const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const currentState = readFileSync(path.join(ROOT, 'doc/02-current-state.md'), 'utf8');
const roadmap = readFileSync(path.join(ROOT, 'doc/04-roadmap.md'), 'utf8');

function run() {
  expect(packageJson.version === '0.6.1', `Unexpected package version fixture: ${packageJson.version}`);
  expect(
    app.includes('__APP_VERSION__') && !app.includes('v2.5.0'),
    'Expected header version badge to use the compile-time app version constant, not a stale hardcoded version.',
  );
  expect(
    viteConfig.includes('__APP_VERSION__') && viteConfig.includes('packageJson.version'),
    'Expected Vite config to expose package.json version as the app version constant.',
  );
  expect(
    versionDeclaration.includes('declare const __APP_VERSION__: string'),
    'Expected TypeScript declaration for the app version constant.',
  );
  expect(
    !currentState.includes('header version badge is still hardcoded') &&
      !readme.includes('header version badge in `src/App.tsx` is still hardcoded') &&
      !roadmap.includes('header badge in `src/App.tsx` still renders `v2.5.0`'),
    'Expected docs to stop listing the fixed version badge drift as pending.',
  );

  console.log('PASS app version badge contract');
}

run();
