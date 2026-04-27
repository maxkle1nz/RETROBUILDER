#!/usr/bin/env tsx
import express from 'express';
import { createM1ndRouter } from '../src/server/routes/m1nd.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function safeJson(text: string) {
  try { return JSON.parse(text); } catch { return null; }
}

async function withM1ndServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use(createM1ndRouter());
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

async function postJson(baseUrl: string, route: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { response, text, data: safeJson(text) as { code?: string; error?: string } | null };
}

async function expectDenied(baseUrl: string, route: string, body: Record<string, unknown>) {
  const { response, text, data } = await postJson(baseUrl, route, body);
  expect(response.status === 403, `Expected ${route} to reject denied path. Got ${response.status}: ${text}`);
  expect(data?.code === 'denied', `Expected denied code for ${route}. Got: ${text}`);
}

async function test_m1nd_path_routes_deny_outside_roots_before_bridge_work() {
  await withM1ndServer(async (baseUrl) => {
    await expectDenied(baseUrl, '/api/m1nd/ingest', { path: '/etc', adapter: 'code' });
    await expectDenied(baseUrl, '/api/m1nd/structural-context', { file_path: '/etc/passwd' });
    await expectDenied(baseUrl, '/api/m1nd/document/resolve', { path: '/etc/passwd' });
    await expectDenied(baseUrl, '/api/m1nd/document/bindings', { path: '/etc/passwd' });
    await expectDenied(baseUrl, '/api/m1nd/document/drift', { path: '/etc/passwd' });
  });
}

async function run() {
  await test_m1nd_path_routes_deny_outside_roots_before_bridge_work();
  console.log('PASS m1nd ingest path guard contract');
}

run().catch((error) => {
  console.error('FAIL m1nd ingest path guard contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
