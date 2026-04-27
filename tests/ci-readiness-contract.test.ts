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
  const workflow = read('.github/workflows/readiness.yml');
  const workbenchSmoke = read('tests/ui-workbench-chromium-cdp.ts');
  const showcaseSmoke = read('tests/ui-specular-showcase-chromium-cdp.ts');
  const liveKompletusBrowser = read('tests/live-kompletus-browser-e2e.ts');
  const pythonChromium = read('tests/chromium_binary.py');
  const verifySpecular = read('scripts/verify-specular-suite.sh');

  expect(
    workflow.includes('name: Retrobuilder Readiness') &&
      workflow.includes('pull_request:') &&
      workflow.includes('workflow_dispatch:'),
    'Expected readiness workflow to run on PRs and support manual full-readiness dispatch.',
  );
  expect(
    workflow.includes('npm run verify:generated-workspace') &&
      workflow.includes('npm run verify:security') &&
      workflow.includes('npx tsx tests/release-readiness-contract.test.ts') &&
      workflow.includes('npx tsx tests/ci-readiness-contract.test.ts'),
    'Expected core CI job to run hermetic generated-workspace, security, and readiness contracts.',
  );
  expect(
    workflow.includes("inputs.full_readiness") &&
      workflow.includes('npm run verify:readiness') &&
      workflow.includes('RETROBUILDER_BROWSER_ARTIFACT_DIR') &&
      workflow.includes('retrobuilder-readiness-logs') &&
      workflow.includes('.retrobuilder/browser-artifacts'),
    'Expected manual full-readiness job to run the canonical gate and upload logs plus browser screenshots.',
  );
  for (const browserSource of [workbenchSmoke, showcaseSmoke, pythonChromium, workflow]) {
    expect(
      browserSource.includes('/usr/bin/google-chrome') &&
        browserSource.includes('/usr/bin/chromium'),
      'Expected browser smoke tooling and workflow to discover Linux Chrome/Chromium binaries.',
    );
  }
  expect(
    verifySpecular.includes('tests/ci-readiness-contract.test.ts'),
    'Expected verify:specular to guard CI workflow drift.',
  );
  expect(
    packageJson.scripts?.['verify:live-kompletus-browser'] === 'npx tsx tests/live-kompletus-browser-e2e.ts',
    'Expected package.json to expose the opt-in live KOMPLETUS browser E2E script.',
  );
  expect(
    liveKompletusBrowser.includes("RETROBUILDER_RUN_LIVE_E2E === '1'") &&
      liveKompletusBrowser.includes('SKIP live KOMPLETUS browser E2E') &&
      !verifySpecular.includes('live-kompletus-browser-e2e.ts'),
    'Expected live KOMPLETUS browser E2E to be opt-in and absent from the default readiness gate.',
  );
  expect(
    workbenchSmoke.includes('Page.captureScreenshot') &&
      showcaseSmoke.includes('Page.captureScreenshot') &&
      workbenchSmoke.includes('full-journey-builder-reentry') &&
      showcaseSmoke.includes('specular-showcase-mobile'),
    'Expected browser smoke tests to capture screenshot artifacts for the full journey and SPECULAR showcase.',
  );
  expect(
    workbenchSmoke.includes("join(userDataDir, 'downloads')") &&
      workbenchSmoke.includes('Browser.setDownloadBehavior') &&
      workbenchSmoke.includes('downloadPath: downloadDir'),
    'Expected workbench browser smoke downloads to stay inside the temporary Chromium profile, not the user Downloads folder.',
  );

  console.log('PASS CI readiness contract');
}

run();
