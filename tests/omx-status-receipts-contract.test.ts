#!/usr/bin/env tsx
import express from 'express';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { createOmxRouter } from '../src/server/routes/omx.ts';
import { createSession, deleteSession, getRuntimeDirectory, type SessionDocument } from '../src/server/session-store.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function safeJson(text: string) {
  try { return JSON.parse(text); } catch { return null; }
}

async function withOmxServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use(createOmxRouter());
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

async function createStatusSession(): Promise<SessionDocument> {
  return createSession({
    name: `OMX Status Receipts ${Date.now()}`,
    source: 'manual',
    manifesto: 'Status should expose verify and merge receipts for builder reentry.',
    architecture: 'Persisted OMX status must carry receipts.',
    projectContext: 'status receipts contract',
    graph: {
      nodes: [
        { id: 'main-frontend', label: 'Main Frontend', description: 'Frontend', status: 'pending', type: 'frontend', group: 1, priority: 1, data_contract: 'x', acceptance_criteria: ['a', 'b'], error_handling: ['e'] },
      ],
      links: [],
    },
  });
}

async function seedStatus(session: SessionDocument) {
  const runtimeDir = getRuntimeDirectory(session.id);
  await rm(runtimeDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(path.join(runtimeDir, 'omx-status.json'), JSON.stringify({
    sessionId: session.id,
    buildId: 'status-build-1',
    status: 'failed',
    workspacePath: path.join(runtimeDir, 'build-status-1'),
    transport: { kind: 'codex-cli', command: 'codex exec --json --skip-git-repo-check --sandbox workspace-write', available: true },
    source: 'persisted-session',
    totalNodes: 1,
    completedNodes: 0,
    buildProgress: 0,
    activeNodeId: null,
    nodeStates: { 'main-frontend': 'error' },
    designProfile: '21st',
    designGateStatus: 'passed',
    designScore: 90,
    designFindings: [],
    designEvidence: ['seeded'],
    resumeAvailable: true,
    resumeReason: 'failed',
    wavesTotal: 1,
    wavesCompleted: 0,
    activeWaveId: null,
    activeTasks: [],
    workerCount: 1,
    verifyPendingCount: 0,
    mergePendingCount: 0,
    ledgerVersion: 1,
    verifyReceipts: {
      'task:main-frontend': {
        taskId: 'task:main-frontend',
        passed: false,
        command: 'auto',
        summary: 'verify failed',
        verifiedAt: new Date().toISOString(),
      },
    },
    mergeReceipts: {
      'task:main-frontend': {
        taskId: 'task:main-frontend',
        applied: false,
        appliedPaths: [],
        rejectedPaths: ['app/page.tsx'],
        reason: 'ownership violation',
        ownerCandidates: ['task:shell-owner'],
        mergedAt: new Date().toISOString(),
      },
    },
    terminalMessage: 'BUILD FAILED — Merge rejected.',
  }, null, 2), 'utf8');
}

async function run() {
  const session = await createStatusSession();
  try {
    await seedStatus(session);
    await withOmxServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/omx/status/${session.id}`);
      const text = await response.text();
      const data = safeJson(text) as Record<string, unknown> | null;
      expect(response.status === 200, `Expected status route to succeed. Got ${response.status}: ${text}`);
      expect(data?.verifyReceipts, `Expected status payload to expose verifyReceipts. Got: ${text}`);
      expect(data?.mergeReceipts, `Expected status payload to expose mergeReceipts. Got: ${text}`);
      expect((data?.mergeReceipts as any)['task:main-frontend']?.rejectedPaths?.[0] === 'app/page.tsx', `Expected merge receipt payload to survive status projection. Got: ${text}`);
    });
  } finally {
    await deleteSession(session.id).catch(() => {});
  }
}

run().then(() => console.log('PASS omx status receipts contract')).catch((error) => {
  console.error('FAIL omx status receipts contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
