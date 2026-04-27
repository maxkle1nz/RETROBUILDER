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
  const fakeBinDir = await mkdtemp(path.join(tmpdir(), 'omx-system-runtime-smoke-fake-codex-'));
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
    name: `OMX System Runtime Smoke ${Date.now()}`,
    source: 'manual',
    manifesto: 'Final system verify should perform runtime smoke when start + health route exist.',
    architecture: 'Persisted resumable build with passing root verify and runtime health route.',
    projectContext: 'system runtime smoke contract',
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
  const buildId = 'system-runtime-smoke-build-1';
  const workspacePath = path.join(runtimeDir, `build-${buildId}`);
  await rm(runtimeDir, { recursive: true, force: true }).catch(() => {});
  const moduleDir = path.join(workspacePath, 'modules', 'main-frontend');
  await mkdir(path.join(moduleDir, 'app', 'api', 'health'), { recursive: true });
  await mkdir(path.join(moduleDir, 'scripts'), { recursive: true });
  await mkdir(path.join(moduleDir, 'src'), { recursive: true });
  await writeFsFile(path.join(moduleDir, 'module.spec.json'), JSON.stringify({ id: 'main-frontend' }, null, 2), 'utf8');
  await writeFsFile(path.join(moduleDir, 'app', 'api', 'health', 'route.ts'), "export async function GET() { return Response.json({ status: 'ready' }); }\n", 'utf8');
  await writeFsFile(path.join(moduleDir, 'src', 'index.js'), [
    "'use strict';",
    "exports.renderApp = () => '<main data-runtime-smoke=\"ready\">ready</main>';",
    "exports.process = () => ({ ok: true, status: 'ready' });",
    '',
  ].join('\n'), 'utf8');
  await writeFsFile(path.join(moduleDir, 'scripts', 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  await writeFsFile(path.join(moduleDir, 'scripts', 'start-server.cjs'), [
    "const http = require('node:http');",
    "const port = Number(process.env.PORT || 7777);",
    "const server = http.createServer((req, res) => {",
    "  if (req.url === '/api/health') {",
    "    res.writeHead(200, { 'Content-Type': 'application/json' });",
    "    res.end(JSON.stringify({ status: 'ready' }));",
    "    return;",
    "  }",
    "  res.writeHead(200, { 'Content-Type': 'text/plain' });",
    "  res.end('ok');",
    "});",
    "server.listen(port, '127.0.0.1');",
    "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
    "process.on('SIGINT', () => server.close(() => process.exit(0)));",
    '',
  ].join('\n'), 'utf8');
  await writeFsFile(path.join(moduleDir, 'package.json'), JSON.stringify({
    name: '@retrobuilder/generated-runtime-smoke-frontend',
    private: true,
    main: 'src/index.js',
    scripts: {
      verify: 'node scripts/verify.cjs',
      start: 'node scripts/start-server.cjs',
    },
  }, null, 2), 'utf8');

    const verifyReceipts = {
      'task:main-frontend': {
        taskId: 'task:main-frontend',
        passed: true,
        command: 'npm run verify --prefix modules/main-frontend',
        summary: 'Main frontend verify passed.',
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

        const deadline = Date.now() + 30000;
        let lastStatusText = '';
        while (Date.now() < deadline) {
          const statusRes = await fetch(`${baseUrl}/api/omx/status/${session.id}`);
          const statusText = await statusRes.text();
          lastStatusText = statusText;
          const status = safeJson(statusText) as Record<string, unknown> | null;
          const result = (status?.result as any) || null;
            if (status?.status === 'succeeded' && result?.systemVerify?.status === 'passed') {
              const summary = result?.systemVerify?.summary || '';
              expect(result?.systemVerify?.command === 'npm run smoke', `Expected final system verify to prefer npm run smoke when available. Got: ${statusText}`);
              expect(String(summary).includes('ready') || String(summary).includes('Runtime smoke'), `Expected runtime smoke evidence in final system verify. Got: ${statusText}`);
              return;
            }
            expect(status?.status !== 'failed' && status?.status !== 'stopped', `Expected runtime smoke build to succeed. Got terminal status: ${statusText}`);
            expect(!(status?.status === 'succeeded' && !result?.systemVerify), `Expected succeeded status to wait for final system verify. Got: ${statusText}`);
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error(`Timed out waiting for runtime smoke success. Last status: ${lastStatusText}`);
      });
    });
  } finally {
    await deleteSession(session.id).catch(() => {});
  }
}

run().then(() => console.log('PASS omx system verify runtime smoke contract')).catch((error) => {
  console.error('FAIL omx system verify runtime smoke contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
