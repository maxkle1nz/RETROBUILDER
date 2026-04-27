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
  const fakeBinDir = await mkdtemp(path.join(tmpdir(), 'omx-docs-gate-fake-codex-'));
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
      '  echo "{\\"ok\\":true,\\"source\\":\\"fake-codex\\"}"',
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

async function createDocsGateSession(kind: 'warning' | 'blocking'): Promise<SessionDocument> {
  return createSession({
    name: `OMX Docs Gate ${kind} ${Date.now()}`,
    source: 'manual',
    manifesto: kind === 'blocking'
      ? 'Documentation integrity should block certification when verify evidence is missing.'
      : 'Documentation depth warnings should not block certification when the build is runnable.',
    architecture: 'Persisted resumable build that jumps directly into finalization and documentation synthesis.',
    projectContext: 'docs quality gate runtime contract',
    graph: {
      nodes: [
        {
          id: 'bakery-core',
          label: 'Bakery Core',
          description: 'Handles daily bakery delivery orchestration.',
          status: 'pending',
          type: 'backend',
          group: 1,
          priority: 1,
          data_contract: 'Input: normalized order intent. Output: persisted bakery delivery plan.',
          acceptance_criteria: kind === 'warning' ? [] : ['Creates daily delivery plans', 'Returns structured delivery summaries'],
          error_handling: ['Returns structured errors for invalid orders.'],
        },
      ],
      links: [],
    },
  });
}

async function seedPersistedMergedBuild(
  session: SessionDocument,
  options: { buildId: string; includeVerifyReceipts: boolean },
) {
  const runtimeDir = getRuntimeDirectory(session.id);
  const workspacePath = path.join(runtimeDir, `build-${options.buildId}`);
  await rm(runtimeDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(path.join(workspacePath, 'modules', 'bakery-core', 'scripts'), { recursive: true });
  await mkdir(path.join(workspacePath, 'modules', 'bakery-core', 'src'), { recursive: true });

  await writeFsFile(
    path.join(workspacePath, 'modules', 'bakery-core', 'module.spec.json'),
    JSON.stringify({ id: 'bakery-core' }, null, 2),
    'utf8',
  );
  await writeFsFile(
    path.join(workspacePath, 'modules', 'bakery-core', 'README.md'),
    '# Bakery Core\n\nCoordinates daily bakery deliveries.\n',
    'utf8',
  );
  await writeFsFile(
    path.join(workspacePath, 'modules', 'bakery-core', 'package.json'),
    JSON.stringify({
      name: '@retrobuilder/bakery-core',
      private: true,
      type: 'commonjs',
      scripts: {
        verify: 'node scripts/verify.cjs',
      },
    }, null, 2),
    'utf8',
  );
  await writeFsFile(
    path.join(workspacePath, 'modules', 'bakery-core', 'scripts', 'verify.cjs'),
    'console.log("bakery-core verify ok"); process.exit(0);\n',
    'utf8',
  );
  await writeFsFile(
    path.join(workspacePath, 'modules', 'bakery-core', 'src', 'index.js'),
    [
      'module.exports = {',
      '  process(input) {',
      '    return {',
      '      status: "ready",',
      '      channel: input?.booking_intent?.service || "bakery-delivery",',
      '    };',
      '  },',
      '};',
      '',
    ].join('\n'),
    'utf8',
  );

  const verifyReceipts = options.includeVerifyReceipts
    ? {
        'task:bakery-core': {
          taskId: 'task:bakery-core',
          passed: true,
          command: 'npm run verify --prefix modules/bakery-core',
          summary: 'Bakery core verify passed.',
          verifiedAt: new Date().toISOString(),
        },
      }
    : {};

  await writeFsFile(
    path.join(runtimeDir, 'omx-status.json'),
    JSON.stringify({
      sessionId: session.id,
      buildId: options.buildId,
      status: 'stopped',
      workspacePath,
      transport: { kind: 'codex-cli', command: 'codex exec --json --skip-git-repo-check --sandbox workspace-write', available: true },
      source: 'persisted-session',
      totalNodes: 1,
      completedNodes: 1,
      buildProgress: 100,
      activeNodeId: null,
      nodeStates: { 'bakery-core': 'complete' },
      designProfile: '21st',
      designGateStatus: 'passed',
      designScore: 91,
      designFindings: [],
      designEvidence: ['seeded'],
      resumeAvailable: true,
      resumeReason: 'stopped',
      executionGraph: {
        ledgerVersion: 1,
        workerCount: 1,
        tasks: [{
          taskId: 'task:bakery-core',
          nodeId: 'bakery-core',
          waveId: 'wave-1',
          label: 'Bakery Core',
          type: 'backend',
          priority: 1,
          dependsOnTaskIds: [],
          readSet: ['.omx/**'],
          writeSet: ['modules/bakery-core/**'],
          sharedArtifacts: [],
          verifyCommand: 'npm run verify --prefix modules/bakery-core',
          completionGate: { verify: true, ownership: true, artifacts: true },
          estimatedCost: 4,
          status: 'merged',
        }],
        waves: [{ waveId: 'wave-1', taskIds: ['task:bakery-core'], status: 'merged' }],
        ownership: {
          ledgerVersion: 1,
          rules: [
            { pathPattern: '.omx/**', classification: 'system', ownerTaskId: 'system' },
            { pathPattern: 'modules/bakery-core/**', classification: 'exclusive', ownerTaskId: 'task:bakery-core' },
          ],
        },
      },
      verifyReceipts,
      mergeReceipts: {
        'task:bakery-core': {
          taskId: 'task:bakery-core',
          applied: true,
          appliedPaths: ['modules/bakery-core/README.md'],
          rejectedPaths: [],
          mergedAt: new Date().toISOString(),
        },
      },
      activeWaveId: null,
      activeTasks: [],
      workerCount: 1,
      verifyPendingCount: 0,
      mergePendingCount: 0,
      ledgerVersion: 1,
      terminalMessage: 'BUILD STOPPED — seed',
    }, null, 2),
    'utf8',
  );

  return { buildId: options.buildId };
}

async function waitForTerminalStatus(
  baseUrl: string,
  sessionId: string,
  expectedStatus: 'succeeded' | 'failed',
) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/api/omx/status/${sessionId}`);
    const text = await response.text();
    const data = safeJson(text) as Record<string, any> | null;
    if (response.status === 200 && data?.status === expectedStatus && data?.result?.documentation) {
      return data;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for OMX terminal status ${expectedStatus}.`);
}

async function readHistory(baseUrl: string, sessionId: string) {
  const response = await fetch(`${baseUrl}/api/omx/history/${sessionId}`);
  const text = await response.text();
  const data = safeJson(text) as { events?: Array<Record<string, unknown>> } | null;
  expect(response.status === 200, `Expected history read. Got ${response.status}: ${text}`);
  return data?.events || [];
}

async function runBlockingScenario(baseUrl: string) {
  const session = await createDocsGateSession('blocking');
  try {
    const seeded = await seedPersistedMergedBuild(session, {
      buildId: 'docs-gate-blocking-build-1',
      includeVerifyReceipts: false,
    });

    const response = await fetch(`${baseUrl}/api/omx/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.id }),
    });
    const text = await response.text();
    const data = safeJson(text) as Record<string, unknown> | null;
    expect(response.status === 202, `Expected resume route to accept blocking docs build. Got ${response.status}: ${text}`);
    expect(data?.buildId === seeded.buildId, `Expected resume to reuse buildId. Got: ${text}`);

    const terminal = await waitForTerminalStatus(baseUrl, session.id, 'failed');
    expect(terminal.result.documentation.quality.status === 'failed', `Expected documentation quality to fail. Got: ${JSON.stringify(terminal.result.documentation.quality)}`);
    expect(terminal.result.documentation.quality.findings.some((entry: string) => entry.includes('Verification evidence')), `Expected verification evidence failure. Got: ${JSON.stringify(terminal.result.documentation.quality.findings)}`);
    expect(terminal.result.systemVerify?.status === 'passed', `Expected root system verify to pass while docs gate blocks. Got: ${JSON.stringify(terminal.result.systemVerify)}`);
    expect(String(terminal.terminalMessage || '').includes('Documentation quality gate failed.'), `Expected terminal message to mention docs gate failure. Got: ${JSON.stringify(terminal)}`);
  } finally {
    await deleteSession(session.id).catch(() => {});
  }
}

async function runWarningScenario(baseUrl: string) {
  const session = await createDocsGateSession('warning');
  try {
    const seeded = await seedPersistedMergedBuild(session, {
      buildId: 'docs-gate-warning-build-1',
      includeVerifyReceipts: true,
    });

    const response = await fetch(`${baseUrl}/api/omx/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.id }),
    });
    const text = await response.text();
    const data = safeJson(text) as Record<string, unknown> | null;
    expect(response.status === 202, `Expected resume route to accept warning docs build. Got ${response.status}: ${text}`);
    expect(data?.buildId === seeded.buildId, `Expected resume to reuse buildId. Got: ${text}`);

    const terminal = await waitForTerminalStatus(baseUrl, session.id, 'succeeded');
    expect(terminal.result.documentation.quality.status === 'needs_review', `Expected documentation quality to warn, not fail. Got: ${JSON.stringify(terminal.result.documentation.quality)}`);
    expect(terminal.result.documentation.quality.findings.some((entry: string) => entry.includes('Module contracts')), `Expected warning quality findings to mention module contracts. Got: ${JSON.stringify(terminal.result.documentation.quality.findings)}`);
    expect(terminal.result.systemVerify?.status === 'passed', `Expected root system verify to pass. Got: ${JSON.stringify(terminal.result.systemVerify)}`);

    const events = await readHistory(baseUrl, session.id);
    const warningMessages = events
      .filter((event) => event.type === 'warning' && typeof event.message === 'string')
      .map((event) => String(event.message));
    expect(
      warningMessages.some((message) => message.includes('Documentation quality gate needs_review')),
      `Expected runtime history to record a docs quality warning. Got: ${JSON.stringify(warningMessages)}`,
    );
  } finally {
    await deleteSession(session.id).catch(() => {});
  }
}

async function run() {
  await withFakeCodex(async () => {
    await withOmxServer(async (baseUrl) => {
      await runBlockingScenario(baseUrl);
      await runWarningScenario(baseUrl);
    });
  });
}

run().then(() => console.log('PASS omx docs quality gate runtime contract')).catch((error) => {
  console.error('FAIL omx docs quality gate runtime contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
