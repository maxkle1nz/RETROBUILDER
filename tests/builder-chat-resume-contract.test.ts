#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const source = readFileSync(path.join(ROOT, 'src/components/ChatFooter.tsx'), 'utf8');
const api = readFileSync(path.join(ROOT, 'src/lib/api.ts'), 'utf8');

function test_builder_chat_has_resume_intent_gate() {
  expect(source.includes('isBuilderResumePrompt'), 'Expected ChatFooter to define a builder resume intent helper.');
  expect(source.includes('resumeOmxBuild'), 'Expected ChatFooter builder mode to call resumeOmxBuild.');
  expect(source.includes('recordOmxOperationalMessage'), 'Expected ChatFooter builder mode to persist operational resume messages into the OMX ledger.');
  expect(source.includes('Resuming OMX build'), 'Expected ChatFooter to log a resume system message.');
  expect(source.includes('fetchOmxStatus'), 'Expected ChatFooter to inspect OMX status and surface resume availability automatically.');
  expect(source.includes('Resume available:'), 'Expected ChatFooter to emit an automatic resume-available chat message.');
}

function test_api_exposes_resume_omx_build() {
  expect(api.includes('export async function resumeOmxBuild'), 'Expected api.ts to expose resumeOmxBuild.');
  expect(api.includes('/api/omx/resume'), 'Expected api.ts to target /api/omx/resume.');
  expect(api.includes('export async function recordOmxOperationalMessage'), 'Expected api.ts to expose recordOmxOperationalMessage.');
  expect(api.includes('/api/omx/operation/${sessionId}'), 'Expected api.ts to target /api/omx/operation/${sessionId}.');
}

function run() {
  const tests = [test_builder_chat_has_resume_intent_gate, test_api_exposes_resume_omx_build];
  let passed = 0;
  for (const test of tests) {
    try {
      test();
      console.log(`PASS ${test.name}`);
      passed += 1;
    } catch (error) {
      console.error(`FAIL ${test.name}`);
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
  console.log(`\n${passed}/${tests.length} tests passed`);
}

run();
