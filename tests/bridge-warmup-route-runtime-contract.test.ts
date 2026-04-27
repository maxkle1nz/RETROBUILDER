#!/usr/bin/env tsx
import express from 'express';
import { createAiRouter } from '../src/server/routes/ai.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use(createAiRouter());
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
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ai/warmup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'bridge',
        authProfile: 'github-copilot:github',
        model: 'github-copilot/gpt-5.4',
      }),
    });
    const payload = await response.json() as {
      status: string;
      provider?: string;
      authProfile?: string | null;
      model?: string;
    };

    expect(response.status === 200, `Expected warmup route success, got ${response.status}`);
    expect(payload.status === 'warming', `Expected warmup route to return warming, got ${payload.status}`);
    expect(payload.provider === 'bridge', `Expected warmup route provider bridge, got ${payload.provider}`);
    expect(payload.authProfile === 'github-copilot:github', `Expected warmup route authProfile echo, got ${payload.authProfile}`);
    expect(payload.model === 'github-copilot/gpt-5.4', `Expected warmup route model echo, got ${payload.model}`);
  });

  console.log('PASS bridge warmup route runtime contract');
}

run().catch((error) => {
  console.error('FAIL bridge warmup route runtime contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
