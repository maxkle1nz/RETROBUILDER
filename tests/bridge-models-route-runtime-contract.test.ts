#!/usr/bin/env tsx
import express from 'express';
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

async function fetchJson(baseUrl: string, authProfile: string) {
  process.env.THEBRIDGE_AUTH_PROFILE = authProfile;
  const response = await fetch(`${baseUrl}/api/ai/models?provider=bridge&authProfile=${encodeURIComponent(authProfile)}`);
  const payload = await response.json() as { provider: string; authProfile?: string | null; defaultModel: string; models: Array<{ id: string }> };
  expect(response.status === 200, `Expected models route success for ${authProfile}, got ${response.status}`);
  expect(payload.provider === 'bridge', `Expected bridge provider in response for ${authProfile}`);
  expect(payload.authProfile === authProfile, `Expected authProfile echo for ${authProfile}`);
  expect(Array.isArray(payload.models) && payload.models.length > 0, `Expected non-empty model list for ${authProfile}`);
  expect(payload.models.some((model) => model.id === payload.defaultModel), `Expected defaultModel ${payload.defaultModel} to exist in returned model list for ${authProfile}`);
  return payload;
}

async function run() {
  await withServer(async (baseUrl) => {
      const codex = await fetchJson(baseUrl, 'openai-codex:default');
      expect(
        codex.defaultModel === 'gpt-5.5' || codex.defaultModel === 'openai-codex/gpt-5.5',
        `Expected codex defaultModel gpt-5.5 or openai-codex/gpt-5.5, got ${codex.defaultModel}`,
      );

      const copilot = await fetchJson(baseUrl, 'github-copilot:github');
      const hasCopilotModels = copilot.models.some((model) => model.id.startsWith('github-copilot/'));
      if (hasCopilotModels) {
        expect(
          copilot.defaultModel === 'github-copilot/gpt-5.4',
          `Expected GitHub Copilot defaultModel github-copilot/gpt-5.4, got ${copilot.defaultModel}`,
        );
      }
    });

  console.log('PASS bridge models route runtime contract');
}

run().catch((error) => {
  console.error('FAIL bridge models route runtime contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
