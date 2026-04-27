#!/usr/bin/env tsx
import express from 'express';
import { chmod, mkdir, mkdtemp, rm, writeFile as writeFsFile } from 'node:fs/promises';
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

async function withFakeCodex<T>(run: () => Promise<T>): Promise<T> {
  const fakeBinDir = await mkdtemp(path.join(tmpdir(), 'omx-system-verify-fake-codex-'));
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

async function createVerifySession(): Promise<SessionDocument> {
  return createSession({
    name: `OMX System Verify ${Date.now()}`,
    source: 'manual',
    manifesto: 'Final system verify should fail the build when workspace verify fails.',
    architecture: 'Persisted resumable build with merged tasks and failing root verify-workspace.',
    projectContext: 'system verify contract',
    graph: {
      nodes: [
        {
          id: 'api-core',
          label: 'API Core',
          description: 'Merged backend task.',
          status: 'pending',
          type: 'backend',
          group: 1,
          priority: 1,
          data_contract: 'Input: x. Output: y.',
          acceptance_criteria: ['One', 'Two'],
          error_handling: ['Structured errors.'],
        },
      ],
      links: [],
    },
  });
}

async function seedPersistedMergedBuild(session: SessionDocument) {
  const runtimeDir = getRuntimeDirectory(session.id);
  const buildId = 'system-verify-build-1';
  const workspacePath = path.join(runtimeDir, `build-${buildId}`);
  await rm(runtimeDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(path.join(workspacePath, 'modules', 'api-core', 'scripts'), { recursive: true });
  await writeFsFile(path.join(workspacePath, 'modules', 'api-core', 'module.spec.json'), JSON.stringify({ id: 'api-core' }, null, 2), 'utf8');
  await writeFsFile(path.join(workspacePath, 'modules', 'api-core', 'package.json'), JSON.stringify({
    name: '@retrobuilder/api-core',
    private: true,
    type: 'commonjs',
    scripts: {
      verify: 'node scripts/verify.cjs',
    },
  }, null, 2), 'utf8');
  await writeFsFile(path.join(workspacePath, 'modules', 'api-core', 'scripts', 'verify.cjs'), 'console.error("module verify failed"); process.exit(1);\n', 'utf8');
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
    nodeStates: { 'api-core': 'complete' },
    designProfile: '21st',
    designGateStatus: 'passed',
    designScore: 90,
    designFindings: [],
    designEvidence: ['seeded'],
    resumeAvailable: true,
    resumeReason: 'stopped',
    executionGraph: {
      ledgerVersion: 1,
      workerCount: 1,
      tasks: [{
        taskId: 'task:api-core',
        nodeId: 'api-core',
        waveId: 'wave-1',
        label: 'API Core',
        type: 'backend',
        priority: 1,
        dependsOnTaskIds: [],
        readSet: ['.omx/**'],
        writeSet: ['modules/api-core/**'],
        sharedArtifacts: [],
        verifyCommand: 'auto',
        completionGate: { verify: true, ownership: true, artifacts: true },
        estimatedCost: 4,
        status: 'merged',
      }],
      waves: [{ waveId: 'wave-1', taskIds: ['task:api-core'], status: 'merged' }],
      ownership: {
        ledgerVersion: 1,
        rules: [
          { pathPattern: '.omx/**', classification: 'system', ownerTaskId: 'system' },
          { pathPattern: 'modules/api-core/**', classification: 'exclusive', ownerTaskId: 'task:api-core' },
        ],
      },
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
  return { buildId, workspacePath };
}

async function run() {
  const session = await createVerifySession();
  try {
    const seeded = await seedPersistedMergedBuild(session);
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
        expect(data?.buildId === seeded.buildId, `Expected resume to reuse buildId. Got: ${text}`);

        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          const statusRes = await fetch(`${baseUrl}/api/omx/status/${session.id}`);
          const statusText = await statusRes.text();
          const status = safeJson(statusText) as Record<string, unknown> | null;
          if (status?.status === 'failed') {
            expect((status?.result as any)?.systemVerify?.status === 'failed', `Expected failed final system verify in status. Got: ${statusText}`);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error('Timed out waiting for system verify failure.');
      });
    });
  } finally {
    await deleteSession(session.id).catch(() => {});
  }
}

run().then(() => console.log('PASS omx system verify contract')).catch((error) => {
  console.error('FAIL omx system verify contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
