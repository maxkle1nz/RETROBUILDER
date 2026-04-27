#!/usr/bin/env tsx
import express from 'express';
import { chmod, mkdir, mkdtemp, rm, writeFile as writeFsFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createOmxRouter } from '../src/server/routes/omx.ts';
import { createSession, deleteSession, getRuntimeDirectory, type SessionDocument } from '../src/server/session-store.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function safeJson(text: string) {
  try { return JSON.parse(text); } catch { return null; }
}

async function withFakeCodex<T>(run: () => Promise<T>): Promise<T> {
  const fakeBinDir = await mkdtemp(path.join(tmpdir(), 'omx-resume-rehydration-fake-codex-'));
  const fakeCodexPath = path.join(fakeBinDir, 'codex');
  const originalPath = process.env.PATH || '';

  await writeFsFile(
    fakeCodexPath,
    [
      '#!/bin/sh',
      'if [ "$1" = "--version" ]; then',
      '  echo "codex 0.0-test"',
      '  exit 0',
      'fi',
      'if [ "$1" = "exec" ]; then',
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

  try {
    return await run();
  } finally {
    process.env.PATH = originalPath;
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
  if (!address || typeof address === 'string') throw new Error('No port');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function createResumeSession(name: string): Promise<SessionDocument> {
  return createSession({
    name,
    source: 'manual',
    manifesto: 'Resume rehydration contracts should be explicit.',
    architecture: 'Minimal OMX session for interrupted and stale-result resume coverage.',
    projectContext: 'resume rehydration contract',
    graph: {
      nodes: [
        {
          id: 'catalog-core',
          label: 'Catalog Core',
          description: 'Persist catalog records.',
          status: 'pending',
          type: 'backend',
          group: 1,
          priority: 1,
          data_contract: 'Input catalog payload. Output persisted catalog state.',
          acceptance_criteria: ['Stores catalog items.', 'Exposes lookup.'],
          error_handling: ['Returns structured validation errors.'],
        },
      ],
      links: [],
    },
  });
}

async function runInterruptedStatusScenario() {
  const session = await createResumeSession(`OMX Interrupted Status ${Date.now()}`);
  try {
    const runtimeDir = getRuntimeDirectory(session.id);
    const buildId = 'interrupted-build-1';
    const workspacePath = path.join(runtimeDir, `build-${buildId}`);
    await rm(runtimeDir, { recursive: true, force: true }).catch(() => {});
    await mkdir(workspacePath, { recursive: true });
    await writeFsFile(path.join(runtimeDir, 'omx-status.json'), JSON.stringify({
      sessionId: session.id,
      buildId,
      status: 'running',
      workspacePath,
      transport: { kind: 'codex-cli', command: 'codex exec --json --skip-git-repo-check --sandbox workspace-write', available: true },
      source: 'persisted-session',
      totalNodes: 1,
      completedNodes: 0,
      buildProgress: 40,
      activeNodeId: 'catalog-core',
      nodeStates: { 'catalog-core': 'building' },
      designProfile: '21st',
      designGateStatus: 'passed',
      designScore: 90,
      designFindings: [],
      designEvidence: ['seeded'],
      terminalMessage: 'BUILD INTERRUPTED — seed',
    }, null, 2), 'utf8');

    await withOmxServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/omx/status/${session.id}`);
      const text = await response.text();
      const data = safeJson(text) as Record<string, unknown> | null;
      expect(response.status === 200, `Expected status route to succeed. Got ${response.status}: ${text}`);
      expect(data?.resumeAvailable === true, `Expected interrupted persisted build to advertise resume availability. Got: ${text}`);
      expect(data?.resumeReason === 'interrupted', `Expected interrupted resume reason. Got: ${text}`);
    });
  } finally {
    await deleteSession(session.id).catch(() => {});
  }
}

async function runStaleResultResumeScenario() {
  const session = await createResumeSession(`OMX Resume Rehydration ${Date.now()}`);
  try {
    const runtimeDir = getRuntimeDirectory(session.id);
    const buildId = 'resume-stale-result-build-1';
    const workspacePath = path.join(runtimeDir, `build-${buildId}`);
    await rm(runtimeDir, { recursive: true, force: true }).catch(() => {});
    await mkdir(path.join(workspacePath, 'modules', 'catalog-core'), { recursive: true });
    await writeFsFile(path.join(workspacePath, 'modules', 'catalog-core', 'module.spec.json'), JSON.stringify({ id: 'catalog-core' }, null, 2), 'utf8');
    await writeFsFile(path.join(runtimeDir, 'omx-status.json'), JSON.stringify({
      sessionId: session.id,
      buildId,
      status: 'stopped',
      workspacePath,
      transport: { kind: 'codex-cli', command: 'codex exec --json --skip-git-repo-check --sandbox workspace-write', available: true },
      source: 'persisted-session',
      totalNodes: 1,
      completedNodes: 1,
      buildProgress: 100,
      activeNodeId: null,
      nodeStates: { 'catalog-core': 'complete' },
      designProfile: '21st',
      designGateStatus: 'passed',
      designScore: 90,
      designFindings: [],
      designEvidence: ['seeded'],
      executionGraph: {
        ledgerVersion: 1,
        workerCount: 1,
        tasks: [{
          taskId: 'task:catalog-core',
          nodeId: 'catalog-core',
          waveId: 'wave-1',
          label: 'Catalog Core',
          type: 'backend',
          priority: 1,
          dependsOnTaskIds: [],
          readSet: ['.omx/**'],
          writeSet: ['modules/catalog-core/**'],
          sharedArtifacts: [],
          verifyCommand: 'auto',
          completionGate: { verify: true, ownership: true, artifacts: true },
          estimatedCost: 4,
          status: 'merged',
        }],
        waves: [{ waveId: 'wave-1', taskIds: ['task:catalog-core'], status: 'merged' }],
        ownership: {
          ledgerVersion: 1,
          rules: [
            { pathPattern: '.omx/**', classification: 'system', ownerTaskId: 'system' },
            { pathPattern: 'modules/catalog-core/**', classification: 'exclusive', ownerTaskId: 'task:catalog-core' },
          ],
        },
      },
      result: {
        totalFiles: 12,
        totalLines: 240,
        elapsedMs: 999,
        systemVerify: {
          status: 'passed',
          command: 'npm run smoke',
          summary: 'stale final system verify from a previous run',
        },
      },
      systemVerify: {
        status: 'passed',
        command: 'npm run smoke',
        summary: 'stale final system verify from a previous run',
      },
      verifyReceipts: {},
      mergeReceipts: {},
      activeWaveId: null,
      activeTasks: [],
      workerCount: 1,
      verifyPendingCount: 0,
      mergePendingCount: 0,
      ledgerVersion: 1,
      terminalMessage: 'BUILD STOPPED — seed',
    }, null, 2), 'utf8');

    await withFakeCodex(async () => {
      await withOmxServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/omx/resume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id }),
        });
        const text = await response.text();
        const data = safeJson(text) as Record<string, unknown> | null;

        expect(response.status === 202, `Expected resume route to accept build. Got ${response.status}: ${text}`);
        expect(data?.buildId === buildId, `Expected resume to reuse buildId. Got: ${text}`);
        expect(data?.status === 'queued', `Expected resumed build to be queued. Got: ${text}`);
        expect(!('result' in (data || {})), `Expected resume response to clear stale persisted result. Got: ${text}`);
      });
    });
  } finally {
    await deleteSession(session.id).catch(() => {});
  }
}

await runInterruptedStatusScenario();
await runStaleResultResumeScenario();

console.log('PASS omx resume rehydration contract');
