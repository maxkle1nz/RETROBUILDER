#!/usr/bin/env tsx
import express from 'express';
import { readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { appendOmxLedgerEvent, readOmxLedgerEvents } from '../src/server/omx-ledger.ts';
import { createOmxRouter } from '../src/server/routes/omx.ts';
import { createSession, deleteSession, getRuntimeDirectory, type SessionDocument } from '../src/server/session-store.ts';

const REDACTED = '[retrobuilder-internal-command]';
const RAW_CODEX_COMMAND = 'codex exec --json --skip-git-repo-check --sandbox workspace-write';
const RAW_VERIFY_COMMAND = 'npm run verify --prefix modules/private-surface';

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
  if (!address || typeof address === 'string') throw new Error('No test server port.');
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function createRedactionSession(): Promise<SessionDocument> {
  return createSession({
    name: `OMX Public Redaction ${Date.now()}`,
    source: 'manual',
    manifesto: 'Public OMX surfaces must not leak internal Codex commands.',
    architecture: 'Status and history are browser-facing projections; persisted runtime files remain diagnostic truth.',
    projectContext: 'public redaction contract',
    graph: {
      nodes: [
        {
          id: 'private-surface',
          label: 'Private Surface',
          description: 'Frontend module',
          status: 'pending',
          type: 'frontend',
          group: 1,
          priority: 1,
          data_contract: 'x',
          acceptance_criteria: ['a', 'b'],
          error_handling: ['e'],
        },
      ],
      links: [],
    },
  });
}

async function seedRuntime(session: SessionDocument) {
  const runtimeDir = getRuntimeDirectory(session.id);
  await rm(runtimeDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(path.join(runtimeDir, 'omx-status.json'), JSON.stringify({
    sessionId: session.id,
    buildId: 'public-redaction-build',
    status: 'failed',
    workspacePath: path.join(runtimeDir, 'build-public-redaction'),
    transport: { kind: 'codex-cli', command: RAW_CODEX_COMMAND, available: true },
    source: 'persisted-session',
    totalNodes: 1,
    completedNodes: 0,
    buildProgress: 0,
    activeNodeId: null,
    nodeStates: { 'private-surface': 'error' },
    designProfile: '21st',
    designGateStatus: 'passed',
    designScore: 90,
    designFindings: [],
    designEvidence: ['seeded'],
    wavesTotal: 1,
    wavesCompleted: 0,
    activeWaveId: null,
    activeTasks: [],
    workerCount: 1,
    verifyPendingCount: 0,
    mergePendingCount: 0,
    verifyReceipts: {
      'task:private-surface': {
        taskId: 'task:private-surface',
        passed: false,
        command: RAW_VERIFY_COMMAND,
        summary: 'verify failed',
        verifiedAt: new Date().toISOString(),
      },
    },
    mergeReceipts: {
      'task:private-surface': {
        taskId: 'task:private-surface',
        applied: false,
        appliedPaths: [],
        rejectedPaths: ['modules/private-surface/src/index.js'],
        reason: 'ownership violation',
        ownerCandidates: ['task:shell-owner'],
        mergedAt: new Date().toISOString(),
      },
    },
    terminalMessage: 'BUILD FAILED - verify failed.',
  }, null, 2), 'utf8');

  await appendOmxLedgerEvent(runtimeDir, 'verify', 'verify_passed', {
    type: 'verify_passed',
    buildId: 'public-redaction-build',
    taskId: 'task:private-surface',
    command: RAW_VERIFY_COMMAND,
    summary: 'ok',
  });
  await appendOmxLedgerEvent(runtimeDir, 'build', 'build_compiled', {
    type: 'build_compiled',
    buildId: 'public-redaction-build',
    tasks: [
      { taskId: 'task:private-surface', verifyCommand: RAW_VERIFY_COMMAND },
    ],
  });
  return runtimeDir;
}

function assertStaticRuntimeBoundary() {
  const source = readFileSync(path.resolve(import.meta.dirname, '../src/server/omx-runtime.ts'), 'utf8');
  expect(
    source.includes('emitToSubscribers(build, redactPublicOmxPayload(enrichedPayload), eventName)'),
    'Expected SSE frames to use the public redaction projection.',
  );
  expect(
    source.includes('transport: build.transport,\n    source: build.source,'),
    'Expected persisted snapshots to retain raw transport diagnostics.',
  );
  expect(
    source.includes('transport: redactTransport(build.transport),\n    source: build.source,'),
    'Expected active status responses to redact transport before leaving the runtime.',
  );
  expect(
    source.includes('appendOmxLedgerEvent(build.runtimeDir') && source.includes('enrichedPayload)'),
    'Expected OMX ledger appends to keep the raw enriched payload for internal diagnostics.',
  );
  expect(
    source.includes('transport: redactTransport(getTransport(await codexAvailable()))'),
    'Expected idle status transport to be redacted before reaching browser clients.',
  );
}

async function run() {
  assertStaticRuntimeBoundary();
  const session = await createRedactionSession();
  try {
    const runtimeDir = await seedRuntime(session);
    await withOmxServer(async (baseUrl) => {
      const statusResponse = await fetch(`${baseUrl}/api/omx/status/${session.id}`);
      const statusText = await statusResponse.text();
      const status = safeJson(statusText) as any;
      expect(statusResponse.status === 200, `Expected status route to succeed. Got ${statusResponse.status}: ${statusText}`);
      expect(status.transport?.command === REDACTED, `Expected public transport command to be redacted. Got: ${statusText}`);
      expect(
        status.verifyReceipts?.['task:private-surface']?.command === REDACTED,
        `Expected public verify receipt command to be redacted. Got: ${statusText}`,
      );
      expect(
        status.mergeReceipts?.['task:private-surface']?.rejectedPaths?.[0] === 'modules/private-surface/src/index.js',
        `Expected non-sensitive merge receipt detail to survive redaction. Got: ${statusText}`,
      );

      const historyResponse = await fetch(`${baseUrl}/api/omx/history/${session.id}?buildId=public-redaction-build`);
      const historyText = await historyResponse.text();
      const history = safeJson(historyText) as { events?: Array<Record<string, any>> } | null;
      expect(historyResponse.status === 200, `Expected history route to succeed. Got ${historyResponse.status}: ${historyText}`);
      const verifyEvent = history?.events?.find((event) => event.type === 'verify_passed');
      const compiledEvent = history?.events?.find((event) => event.type === 'build_compiled');
      expect(verifyEvent?.command === REDACTED, `Expected public verify event command to be redacted. Got: ${historyText}`);
      expect(compiledEvent?.tasks?.[0]?.verifyCommand === REDACTED, `Expected public task verifyCommand to be redacted. Got: ${historyText}`);
    });

    const rawLedger = await readOmxLedgerEvents(runtimeDir);
    expect(
      rawLedger.some((event) => event.payload.command === RAW_VERIFY_COMMAND),
      'Expected internal ledger to preserve the raw verify command for diagnostics.',
    );
  } finally {
    await deleteSession(session.id).catch(() => {});
  }
}

run().then(() => console.log('PASS omx public redaction contract')).catch((error) => {
  console.error('FAIL omx public redaction contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
