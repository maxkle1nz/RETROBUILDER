#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const packageJson = readFileSync(path.join(ROOT, 'package.json'), 'utf8');
const smoke = readFileSync(path.join(ROOT, 'tests/bridge-dual-lane-smoke.test.ts'), 'utf8');
const localCodexSmoke = readFileSync(path.join(ROOT, 'tests/bridge-local-codex-live-smoke.test.ts'), 'utf8');
const envExample = readFileSync(path.join(ROOT, '.env.example'), 'utf8');
const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const providerSsot = readFileSync(path.join(ROOT, 'doc/l1ght/provider-ssot.md'), 'utf8');
const currentState = readFileSync(path.join(ROOT, 'doc/02-current-state.md'), 'utf8');

function run() {
  expect(
    smoke.includes('BRIDGE_REQUIRE_LIVE_PROFILES'),
    'Expected bridge dual-lane smoke to support strict live-profile enforcement.',
  );
  expect(
    smoke.includes('OPENCLAW_AUTH_PROFILES_PATH'),
    'Expected bridge dual-lane smoke failure guidance to mention OPENCLAW_AUTH_PROFILES_PATH.',
  );
    expect(
      packageJson.includes('verify:providers:live'),
      'Expected package.json to expose a strict live provider verification command.',
    );
    expect(
      packageJson.includes('verify:providers:codex-live') &&
        packageJson.includes('bridge-local-codex-live-smoke.test.ts') &&
        packageJson.includes('npm run verify:providers:codex-live && BRIDGE_REQUIRE_LIVE_PROFILES=1'),
      'Expected package.json to expose local Codex live proof separately before strict profile-backed verification.',
    );
    expect(
      localCodexSmoke.includes('createBridgeProvider') &&
        localCodexSmoke.includes('bridge-local-ok') &&
        localCodexSmoke.includes('BRIDGE_FALLBACK_MARKERS') &&
        localCodexSmoke.includes('resilient fallback summary') &&
        !localCodexSmoke.includes('authProfile:'),
      'Expected local Codex live smoke to prove THE BRIDGE without requiring an OpenClaw auth profile.',
    );
  expect(
    envExample.includes('THEBRIDGE_AUTH_PROFILE'),
    'Expected .env.example to document selected bridge auth profile.',
  );
  expect(
    envExample.includes('OPENCLAW_AUTH_PROFILES_PATH'),
    'Expected .env.example to document auth profile store override.',
  );
    expect(
      readme.includes('npm run verify:providers:live') &&
        readme.includes('npm run verify:providers:codex-live') &&
        readme.includes('BRIDGE_REQUIRE_LIVE_PROFILES=1') &&
        readme.includes('missing profiles as an explicit skip'),
      'Expected README to distinguish default provider smoke from strict live Bridge proof.',
    );
    expect(
      providerSsot.includes('npm run verify:providers:codex-live') &&
        providerSsot.includes('Expected strict live outcome') &&
        providerSsot.includes('OPENCLAW_AUTH_PROFILES_PATH') &&
        providerSsot.includes('gpt-5.5') &&
        providerSsot.includes('bridge-local-ok'),
      'Expected provider SSOT docs to define strict live Bridge readiness and the current local Codex gpt-5.5 proof.',
    );
    expect(
      currentState.includes('missing local OpenClaw auth profiles are reported as explicit live-lane skips') &&
        currentState.includes('npm run verify:providers:codex-live') &&
        currentState.includes('npm run verify:providers:live') &&
        currentState.includes('gpt-5.5') &&
        currentState.includes('openai-codex/gpt-5.5'),
      'Expected current-state docs to distinguish runtime readiness from strict live Bridge proof.',
    );
  console.log('PASS bridge live readiness contract');
}

run();
