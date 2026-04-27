#!/usr/bin/env tsx
import express from 'express';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createConfigRouter } from '../src/server/routes/config.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(createConfigRouter());
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function run() {
  const fixtureDir = await mkdtemp(path.join(tmpdir(), 'retrobuilder-auth-profiles-runtime-'));
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

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ai/auth-profiles?provider=bridge`);
    const data = await response.json() as { profiles?: Array<{ id: string; provider: string; type: string }> };
    expect(response.status === 200, `Expected auth profile route success, got ${response.status}`);
    expect(Array.isArray(data.profiles), 'Expected profiles array.');
    expect(data.profiles!.some((profile) => profile.id === 'openai-codex:default'), 'Expected bridge profile list to include openai-codex:default.');
    expect(data.profiles!.some((profile) => profile.id === 'github-copilot-default'), 'Expected bridge profile list to include github-copilot-default.');
  });
  console.log('PASS auth profile store runtime contract');
}

run().catch((error) => {
  console.error('FAIL auth profile store runtime contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
