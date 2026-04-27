#!/usr/bin/env tsx
import express from 'express';
import { chmod, mkdir, mkdtemp, rm, writeFile as writeFsFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { buildOmxRootComposition } from '../src/server/omx-root-composition.ts';
import { createOmxRouter } from '../src/server/routes/omx.ts';
import { createSession, deleteSession, getRuntimeDirectory, type SessionDocument } from '../src/server/session-store.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function safeJson(text: string) {
  try { return JSON.parse(text); } catch { return null; }
}

async function withFakeCodex<T>(run: () => Promise<T>): Promise<T> {
  const fakeBinDir = await mkdtemp(path.join(tmpdir(), 'omx-system-root-smoke-fake-codex-'));
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
    name: `OMX System Root Smoke ${Date.now()}`,
    source: 'manual',
    manifesto: 'Final system verify should prefer the generated root smoke wrapper.',
    architecture: 'Persisted resumable build with root verify and root smoke, but no module-local app/api/health route.',
    projectContext: 'system root smoke contract',
    graph: {
      nodes: [
        {
          id: 'main-frontend',
          label: 'Main Frontend',
          description: 'Merged frontend task.',
          status: 'pending',
          type: 'frontend',
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
  const buildId = 'system-root-smoke-build-1';
  const workspacePath = path.join(runtimeDir, `build-${buildId}`);
  await rm(runtimeDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(workspacePath, { recursive: true });

  const rootFiles = buildOmxRootComposition(session);
  for (const file of rootFiles) {
    const targetPath = path.join(workspacePath, file.path);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFsFile(targetPath, file.content, 'utf8');
  }

  const moduleDir = path.join(workspacePath, 'modules', 'main-frontend');
  await mkdir(path.join(moduleDir, 'src'), { recursive: true });
  await writeFsFile(path.join(moduleDir, 'module.spec.json'), JSON.stringify({ id: 'main-frontend' }, null, 2), 'utf8');
  await writeFsFile(path.join(moduleDir, 'package.json'), JSON.stringify({
    name: '@retrobuilder/generated-root-smoke-frontend',
    private: true,
    scripts: {
      test: 'node --test src/index.test.js',
    },
  }, null, 2), 'utf8');
  await writeFsFile(path.join(moduleDir, 'src', 'index.js'), [
    "exports.process = () => ({ status: 'ready', moduleId: 'main-frontend' });",
    '',
  ].join('\n'), 'utf8');
  await writeFsFile(path.join(moduleDir, 'src', 'index.test.js'), [
    "const test = require('node:test');",
    "const assert = require('node:assert/strict');",
    "const { process } = require('./index.js');",
    '',
    "test('returns ready state', () => {",
    "  assert.deepEqual(process(), { status: 'ready', moduleId: 'main-frontend' });",
    '});',
    '',
  ].join('\n'), 'utf8');

  const verifyReceipts = {
    'task:main-frontend': {
      taskId: 'task:main-frontend',
      passed: true,
      command: 'npm run verify --prefix modules/main-frontend',
      summary: 'Main frontend verify passed before the merged build was stopped.',
      verifiedAt: new Date().toISOString(),
    },
  };

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
    nodeStates: { 'main-frontend': 'complete' },
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
        taskId: 'task:main-frontend',
        nodeId: 'main-frontend',
        waveId: 'wave-1',
        label: 'Main Frontend',
        type: 'frontend',
        priority: 1,
        dependsOnTaskIds: [],
        readSet: ['.omx/**'],
        writeSet: ['modules/main-frontend/**'],
        sharedArtifacts: [],
        verifyCommand: 'auto',
        completionGate: { verify: true, ownership: true, artifacts: true },
        estimatedCost: 4,
        status: 'merged',
      }],
      waves: [{ waveId: 'wave-1', taskIds: ['task:main-frontend'], status: 'merged' }],
      ownership: {
        ledgerVersion: 1,
        rules: [
          { pathPattern: '.omx/**', classification: 'system', ownerTaskId: 'system' },
          { pathPattern: 'modules/main-frontend/**', classification: 'exclusive', ownerTaskId: 'task:main-frontend' },
        ],
      },
    },
    verifyReceipts,
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

        const deadline = Date.now() + 7000;
        while (Date.now() < deadline) {
          const statusRes = await fetch(`${baseUrl}/api/omx/status/${session.id}`);
          const statusText = await statusRes.text();
          const status = safeJson(statusText) as Record<string, unknown> | null;
          const result = (status?.result as any) || null;
          if (status?.status === 'succeeded' && result?.systemVerify?.status === 'passed') {
            const summary = String(result?.systemVerify?.summary || '');
            expect(result?.systemVerify?.command === 'npm run smoke', `Expected final system verify to prefer npm run smoke. Got: ${statusText}`);
            expect(summary.includes('npm run verify:'), `Expected final system verify summary to include the verify gate. Got: ${statusText}`);
            expect(summary.includes('npm run build:'), `Expected final system verify summary to include the build gate. Got: ${statusText}`);
            expect(summary.includes('ready') || summary.includes('Runtime smoke'), `Expected root smoke evidence in final system verify. Got: ${statusText}`);
            return;
          }
          expect(!(status?.status === 'succeeded' && result?.systemVerify?.status === 'not_available'), `Expected root smoke wrapper to avoid not_available status. Got: ${statusText}`);
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error('Timed out waiting for root smoke system verify success.');
      });
    });
  } finally {
    await deleteSession(session.id).catch(() => {});
  }
}

run().then(() => console.log('PASS omx system verify root smoke contract')).catch((error) => {
  console.error('FAIL omx system verify root smoke contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
