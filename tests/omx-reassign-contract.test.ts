#!/usr/bin/env tsx
import express from 'express';
import { chmod, mkdtemp, rm, writeFile as writeFsFile } from 'node:fs/promises';
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
  const fakeBinDir = await mkdtemp(path.join(tmpdir(), 'omx-reassign-fake-codex-'));
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

async function createReassignSession(): Promise<SessionDocument> {
  return createSession({
    name: `OMX Reassign ${Date.now()}`,
    source: 'manual',
    manifesto: 'Reassign shared-owner lane to failed task.',
    architecture: 'Owner arbitration should be durable and rerunnable from the same build.',
    projectContext: 'reassign contract',
    graph: {
      nodes: [
        {
          id: 'main-frontend',
          label: 'Main Frontend',
          description: 'Frontend task with shared artifacts.',
          status: 'pending',
          type: 'frontend',
          group: 1,
          priority: 1,
          data_contract: 'Input: app payload. Output: rendered shared app shell.',
          acceptance_criteria: ['Shows shell.', 'Shows primary action.'],
          error_handling: ['Shows fallback.'],
          designProfile: '21st',
          referenceCandidates: [],
          selectedReferenceIds: [],
          variantCandidates: [],
          selectedVariantId: 'seeded',
          previewArtifact: {
            kind: 'tsx',
            componentName: 'MainFrontendPreview',
            screenType: 'dashboard',
            summary: 'seeded preview',
            blocks: [
              { id: 'hero', kind: 'hero', title: 'Main Frontend' },
              { id: 'metrics', kind: 'metrics', title: 'Metrics', items: ['state'] },
              { id: 'cta', kind: 'cta', title: 'Continue' },
            ],
            tsx: 'export const MainFrontendPreview = () => null;',
          },
          previewState: { density: 'compact', emphasis: 'dashboard' },
          designVerdict: { status: 'passed', score: 90, findings: [], evidence: ['seeded'] },
        },
      ],
      links: [],
    },
  });
}

async function seedFailedBuild(session: SessionDocument) {
  const runtimeDir = getRuntimeDirectory(session.id);
  const buildId = 'reassign-build-1';
  const workspacePath = path.join(runtimeDir, `build-${buildId}`);
  await rm(runtimeDir, { recursive: true, force: true }).catch(() => {});
  await import('node:fs/promises').then(async ({ mkdir, writeFile }) => {
    await mkdir(runtimeDir, { recursive: true });
    await mkdir(path.join(workspacePath, 'modules', 'main-frontend'), { recursive: true });
    await writeFile(path.join(workspacePath, 'modules', 'main-frontend', 'module.spec.json'), JSON.stringify({ id: 'main-frontend' }, null, 2), 'utf8');
    const executionGraph = {
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
        sharedArtifacts: ['app/**', 'components/**', 'package.json'],
        verifyCommand: 'auto',
        completionGate: { verify: true, ownership: true, artifacts: true },
        estimatedCost: 6,
        status: 'failed',
      }],
      waves: [{ waveId: 'wave-1', taskIds: ['task:main-frontend'], status: 'failed' }],
      ownership: {
        ledgerVersion: 1,
        rules: [
          { pathPattern: '.omx/**', classification: 'system', ownerTaskId: 'system' },
          { pathPattern: 'modules/main-frontend/**', classification: 'exclusive', ownerTaskId: 'task:main-frontend' },
          { pathPattern: 'app/**', classification: 'shared-owner', ownerTaskId: 'task:shell-owner' },
          { pathPattern: 'components/**', classification: 'shared-owner', ownerTaskId: 'task:shell-owner' },
        ],
      },
    };
    await writeFile(path.join(runtimeDir, 'omx-status.json'), JSON.stringify({
      sessionId: session.id,
      buildId,
      status: 'failed',
      workspacePath,
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
      executionGraph,
      verifyReceipts: {},
      mergeReceipts: {
        'task:main-frontend': {
          taskId: 'task:main-frontend',
          applied: false,
          appliedPaths: [],
          rejectedPaths: ['app/page.tsx', 'components/atlas-shell.tsx'],
          reason: 'ownership violation',
          ownerCandidates: ['task:shell-owner'],
          mergedAt: new Date().toISOString(),
        },
      },
      activeWaveId: null,
      activeTasks: [],
      workerCount: 1,
      verifyPendingCount: 0,
      mergePendingCount: 0,
      ledgerVersion: 1,
      terminalMessage: 'BUILD FAILED — Merge rejected.',
    }, null, 2), 'utf8');
  });
  return { buildId, workspacePath };
}

async function run() {
  const session = await createReassignSession();
  try {
    const seeded = await seedFailedBuild(session);
    await withFakeCodex(async () => {
      await withOmxServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/omx/reassign/${session.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: 'task:main-frontend' }),
        });
        const text = await response.text();
        const data = safeJson(text) as Record<string, unknown> | null;
        expect(response.status === 202, `Expected reassign route to accept failed task. Got ${response.status}: ${text}`);
        expect(data?.buildId === seeded.buildId, `Expected reassign to reuse buildId. Got: ${text}`);
        expect(data?.workspacePath === seeded.workspacePath, `Expected reassign to reuse workspace. Got: ${text}`);
        expect(data?.activeWaveId === 'wave-1', `Expected reassign to reactivate the failed wave. Got: ${text}`);
      });
    });
  } finally {
    await deleteSession(session.id).catch(() => {});
  }
}

run().then(() => {
  console.log('PASS omx reassign contract');
}).catch((error) => {
  console.error('FAIL omx reassign contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
