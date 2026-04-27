#!/usr/bin/env tsx
import express from 'express';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSessionRouter } from '../src/server/routes/sessions.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function safeJson(text: string) {
  try { return JSON.parse(text); } catch { return null; }
}

async function withSessionServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use(createSessionRouter());
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

async function postImport(baseUrl: string, codebasePath: string) {
  const response = await fetch(`${baseUrl}/api/sessions/import/codebase`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: codebasePath }),
  });
  const text = await response.text();
  return { response, text, data: safeJson(text) as { error?: string; code?: string } | null };
}

async function test_import_route_rejects_denied_path_before_ai_work() {
  await withSessionServer(async (baseUrl) => {
    const { response, text, data } = await postImport(baseUrl, '/etc');
    expect(response.status === 403, `Expected /etc import to be denied before import work. Got ${response.status}: ${text}`);
    expect(data?.code === 'denied', `Expected denied code. Got: ${text}`);
  });
}

async function test_import_route_returns_bad_request_for_allowed_non_directory() {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'retrobuilder-import-guard-'));
  const tempFile = path.join(tempDir, 'README.md');
  try {
    await writeFile(tempFile, '# not a directory\n', 'utf8');
    await withSessionServer(async (baseUrl) => {
      const { response, text, data } = await postImport(baseUrl, tempFile);
      expect(response.status === 400, `Expected non-directory import to be a bad request. Got ${response.status}: ${text}`);
      expect(data?.code === 'not_directory', `Expected not_directory code. Got: ${text}`);
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function run() {
  await test_import_route_rejects_denied_path_before_ai_work();
  await test_import_route_returns_bad_request_for_allowed_non_directory();
  console.log('PASS sessions import codebase path guard contract');
}

run().catch((error) => {
  console.error('FAIL sessions import codebase path guard contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
