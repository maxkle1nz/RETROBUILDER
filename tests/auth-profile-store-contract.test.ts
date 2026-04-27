#!/usr/bin/env tsx
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadAuthProfiles, resolveAuthProfile } from '../src/server/auth-profile-store.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function run() {
  const fixtureDir = await mkdtemp(path.join(tmpdir(), 'retrobuilder-auth-profiles-'));
  const fixturePath = path.join(fixtureDir, 'auth-profiles.json');
  process.env.OPENCLAW_AUTH_PROFILES_PATH = fixturePath;
  await writeFile(fixturePath, JSON.stringify({
    profiles: {
      'openai-codex:default': {
        provider: 'openai-codex',
        type: 'oauth',
        accountId: 'codex-local',
      },
      'github-copilot-default': {
        provider: 'github-copilot',
        type: 'token',
        accountId: 'copilot-local',
      },
    },
  }));

  const profiles = await loadAuthProfiles();
  expect(Array.isArray(profiles), 'Expected auth profile store to return an array.');
  expect(profiles.some((profile) => profile.id === 'openai-codex:default'), 'Expected local auth profile discovery to surface openai-codex:default.');
  expect(profiles.some((profile) => profile.id === 'github-copilot-default'), 'Expected local auth profile discovery to surface github-copilot-default.');
  const codex = await resolveAuthProfile('openai-codex:default');
  expect(codex?.provider === 'openai-codex', 'Expected resolveAuthProfile to return openai-codex metadata for openai-codex:default.');
  console.log('PASS auth profile store contract');
}

run().catch((error) => {
  console.error('FAIL auth profile store contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
