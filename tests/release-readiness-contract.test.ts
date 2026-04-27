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

function run() {
  const packageJson = JSON.parse(read('package.json')) as { scripts?: Record<string, string> };
  const readinessScript = read('scripts/verify-readiness.sh');
  const specularScript = read('scripts/verify-specular-suite.sh');
  const readme = read('README.md');
  const currentState = read('doc/02-current-state.md');
  const roadmap = read('doc/04-roadmap.md');

  expect(
    packageJson.scripts?.['verify:readiness'] === 'bash scripts/verify-readiness.sh',
    'Expected package.json to expose npm run verify:readiness.',
  );
  expect(
    readinessScript.includes('npm run verify:generated-workspace') &&
      readinessScript.includes('npm run verify:specular'),
    'Expected verify-readiness.sh to compose generated workspace and SPECULAR/browser truth verification.',
  );
  expect(
    specularScript.includes('tests/release-readiness-contract.test.ts') &&
      specularScript.includes('npm run verify:git') &&
      specularScript.includes('npm run smoke:m1nd'),
    'Expected verify:specular to guard git hygiene, readiness docs/scripts, and include m1nd runtime smoke while the server is alive.',
  );
  expect(
    readme.includes('npm run verify:readiness') &&
      currentState.includes('npm run verify:readiness') &&
      roadmap.includes('verify:readiness'),
    'Expected README, current-state docs, and roadmap to document the canonical readiness gate.',
  );

  console.log('PASS release readiness contract');
}

run();
