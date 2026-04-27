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

async function fetchProviders(baseUrl: string, authProfile: string) {
  delete process.env.THEBRIDGE_AUTO_START;
  process.env.THEBRIDGE_AUTH_PROFILE = authProfile;
  const response = await fetch(`${baseUrl}/api/ai/providers`);
  const payload = await response.json() as {
    active: string;
    providers: Array<{
      name: string;
      status?: string;
      runtime?: {
        authProfile?: string | null;
        authProfileProvider?: string | null;
        protocol?: string;
          source?: string;
          healthy?: boolean;
          autoStart?: boolean;
          autoStarted?: boolean;
        };
      }>;
  };
  expect(response.status === 200, `Expected provider route success for ${authProfile}, got ${response.status}`);
  const bridge = payload.providers.find((provider) => provider.name === 'bridge');
  expect(bridge, `Expected bridge provider entry for ${authProfile}`);
  expect(bridge!.status === 'ready', `Expected bridge provider ready for ${authProfile}, got ${bridge!.status}`);
  expect(bridge!.runtime?.authProfile === authProfile, `Expected bridge runtime authProfile echo for ${authProfile}`);
    expect(bridge!.runtime?.healthy === true, `Expected bridge runtime healthy for ${authProfile}`);
    expect(bridge!.runtime?.autoStart === true, `Expected bridge runtime autoStart=true for ${authProfile}`);
    expect(typeof bridge!.runtime?.autoStarted === 'boolean', `Expected bridge runtime autoStarted diagnostic for ${authProfile}`);
  expect(
    bridge!.runtime?.protocol === 'standalone' || bridge!.runtime?.protocol === 'openai_compat',
    `Expected bridge runtime protocol for ${authProfile}, got ${bridge!.runtime?.protocol}`,
  );
  expect(
    bridge!.runtime?.source === 'donor' || bridge!.runtime?.source === 'path' || bridge!.runtime?.source === 'env',
    `Expected bridge runtime source for ${authProfile}, got ${bridge!.runtime?.source}`,
  );
  return bridge!;
}

async function run() {
  const fixtureDir = await mkdtemp(path.join(tmpdir(), 'retrobuilder-bridge-providers-'));
  const fixturePath = path.join(fixtureDir, 'auth-profiles.json');
  process.env.OPENCLAW_AUTH_PROFILES_PATH = fixturePath;
  await writeFile(fixturePath, JSON.stringify({
    profiles: {
      'openai-codex:default': {
        provider: 'openai-codex',
        type: 'oauth',
        accountId: 'codex-local',
      },
      'github-copilot:github': {
        provider: 'github-copilot',
        type: 'token',
        accountId: 'copilot-local',
      },
    },
  }));

  await withServer(async (baseUrl) => {
    const codex = await fetchProviders(baseUrl, 'openai-codex:default');
    expect(codex.runtime?.authProfileProvider === 'openai-codex', `Expected openai-codex auth provider, got ${codex.runtime?.authProfileProvider}`);

    const copilot = await fetchProviders(baseUrl, 'github-copilot:github');
    expect(copilot.runtime?.authProfileProvider === 'github-copilot', `Expected github-copilot auth provider, got ${copilot.runtime?.authProfileProvider}`);
  });

  console.log('PASS bridge providers route runtime contract');
}

run().catch((error) => {
  console.error('FAIL bridge providers route runtime contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
