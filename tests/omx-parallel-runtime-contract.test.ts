#!/usr/bin/env tsx
import express from 'express';
import { chmod, mkdtemp, rm, writeFile as writeFsFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { createOmxRouter } from '../src/server/routes/omx.ts';
import { createSession, deleteSession, type SessionDocument } from '../src/server/session-store.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function safeJson(text: string) {
  try { return JSON.parse(text); } catch { return null; }
}

async function withFakeCodex<T>(run: () => Promise<T>): Promise<T> {
  const fakeBinDir = await mkdtemp(path.join(tmpdir(), 'omx-parallel-fake-codex-'));
  const fakeCodexPath = path.join(fakeBinDir, 'codex');
  const originalPath = process.env.PATH || '';
  const originalWorkerCount = process.env.OMX_WORKER_COUNT;

  await writeFsFile(
    fakeCodexPath,
    [
      '#!/bin/sh',
      'if [ "$1" = "--version" ]; then',
      '  echo "codex 0.0-test"',
      '  exit 0',
      'fi',
      'if [ "$1" = "exec" ]; then',
      '  sleep 1',
      '  echo "{\"ok\":true,\"source\":\"fake-codex\"}"',
      '  exit 0',
      'fi',
      'exit 0',
      '',
    ].join('\n'),
    'utf8',
  );
  await chmod(fakeCodexPath, 0o755);
  process.env.PATH = `${fakeBinDir}${path.delimiter}${originalPath}`;
  process.env.OMX_WORKER_COUNT = '2';

  try {
    return await run();
  } finally {
    process.env.PATH = originalPath;
    if (originalWorkerCount === undefined) delete process.env.OMX_WORKER_COUNT;
    else process.env.OMX_WORKER_COUNT = originalWorkerCount;
    await rm(fakeBinDir, { force: true, recursive: true }).catch(() => {});
  }
}

async function withOmxServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use(createOmxRouter());

  const server = await new Promise<import('node:http').Server>((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Failed to resolve OMX test port.');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function createParallelSession(): Promise<SessionDocument> {
  return createSession({
    name: `OMX Parallel ${Date.now()}`,
    source: 'manual',
    manifesto: 'Independent tasks should lease concurrently.',
    architecture: 'OMX 2 should run multiple tasks from the same wave at once when write sets are disjoint.',
    projectContext: 'parallel runtime contract',
    graph: {
      nodes: [
        { id: 'artist-service', label: 'Artist Service', type: 'backend', group: 1, status: 'pending', priority: 1, description: 'Artist logic', data_contract: 'x', acceptance_criteria: ['Stores artists.'], error_handling: ['Returns structured errors.'] },
        { id: 'catalog-service', label: 'Catalog Service', type: 'backend', group: 1, status: 'pending', priority: 1, description: 'Catalog logic', data_contract: 'y', acceptance_criteria: ['Searches catalog.'], error_handling: ['Returns structured errors.'] },
        { id: 'compliance-manager', label: 'Compliance Manager', type: 'backend', group: 1, status: 'pending', priority: 1, description: 'Compliance logic', data_contract: 'z', acceptance_criteria: ['Tracks consent.'], error_handling: ['Returns structured errors.'] },
      ],
      links: [],
    },
  });
}

async function run() {
  const session = await createParallelSession();
  try {
    await withFakeCodex(async () => {
      await withOmxServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/omx/build`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id }),
        });
        const text = await response.text();
        const data = safeJson(text) as Record<string, unknown> | null;
        expect(response.status === 202, `Expected build start. Got ${response.status}: ${text}`);
        expect((data?.workerCount as number) === 2, `Expected workerCount=2 from env override. Got: ${text}`);

        await new Promise((resolve) => setTimeout(resolve, 250));
        const statusRes = await fetch(`${baseUrl}/api/omx/status/${session.id}`);
        const statusText = await statusRes.text();
        const status = safeJson(statusText) as Record<string, unknown> | null;
        expect(statusRes.status === 200, `Expected status read to succeed. Got ${statusRes.status}: ${statusText}`);
        expect(Array.isArray(status?.activeTasks), `Expected activeTasks in OMX status. Got: ${statusText}`);
        expect(((status?.activeTasks as unknown[]) || []).length >= 2, `Expected at least 2 active tasks in the same wave. Got: ${statusText}`);
      });
    });
  } finally {
    await deleteSession(session.id).catch(() => {});
  }
}

run().then(() => {
  console.log('PASS omx parallel runtime contract');
}).catch((error) => {
  console.error('FAIL omx parallel runtime contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
