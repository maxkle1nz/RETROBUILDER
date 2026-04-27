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
  const fakeBinDir = await mkdtemp(path.join(tmpdir(), 'omx-parallel-stop-fake-codex-'));
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
      '  args="$*"',
      '  if printf "%s" "$args" | grep -q "Artist Service"; then',
      '    sleep 0',
      '  elif printf "%s" "$args" | grep -q "Catalog Service"; then',
      '    sleep 5',
      '  elif printf "%s" "$args" | grep -q "Compliance Manager"; then',
      '    sleep 5',
      '  else',
      '    sleep 2',
      '  fi',
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
  if (!address || typeof address === 'string') throw new Error('No port');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function createParallelSession(): Promise<SessionDocument> {
  return createSession({
    name: `OMX Parallel Stop Resume ${Date.now()}`,
    source: 'manual',
    manifesto: 'Parallel stop and resume contract.',
    architecture: 'Same-wave tasks must stop cleanly and resume from persisted truth.',
    projectContext: 'parallel stop resume contract',
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

async function pollStatus(baseUrl: string, sessionId: string, predicate: (status: any) => boolean, attempts = 20) {
  for (let i = 0; i < attempts; i += 1) {
    const response = await fetch(`${baseUrl}/api/omx/status/${sessionId}`);
    const text = await response.text();
    const data = safeJson(text);
    if (response.status === 200 && predicate(data)) return data;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Timed out waiting for OMX status predicate.');
}

async function readHistory(baseUrl: string, sessionId: string) {
  const response = await fetch(`${baseUrl}/api/omx/history/${sessionId}`);
  const text = await response.text();
  const data = safeJson(text) as { events?: Array<Record<string, unknown>> } | null;
  expect(response.status === 200, `Expected history read. Got ${response.status}: ${text}`);
  return data?.events || [];
}

async function pollHistory(
  baseUrl: string,
  sessionId: string,
  predicate: (events: Array<Record<string, unknown>>) => boolean,
  attempts = 20,
) {
  for (let i = 0; i < attempts; i += 1) {
    const events = await readHistory(baseUrl, sessionId);
    if (predicate(events)) return events;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Timed out waiting for OMX history predicate.');
}

async function run() {
  const session = await createParallelSession();
  try {
    await withFakeCodex(async () => {
      await withOmxServer(async (baseUrl) => {
        const startRes = await fetch(`${baseUrl}/api/omx/build`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id }),
        });
        const startText = await startRes.text();
        const startData = safeJson(startText) as Record<string, unknown> | null;
        expect(startRes.status === 202, `Expected build start. Got ${startRes.status}: ${startText}`);
        expect((startData?.workerCount as number) === 2, `Expected workerCount=2. Got: ${startText}`);

        const activeStatus = await pollStatus(
          baseUrl,
          session.id,
          (status) => typeof status?.completedNodes === 'number' && status.completedNodes >= 1 && Array.isArray(status?.activeTasks) && status.activeTasks.length >= 1,
          40,
        );
        expect(activeStatus.completedNodes === 1, `Expected one task to finish before stop. Got: ${JSON.stringify(activeStatus)}`);
        expect(activeStatus.activeWaveId, 'Expected activeWaveId while multiple tasks are running.');

        const stopRes = await fetch(`${baseUrl}/api/omx/stop/${session.id}`, { method: 'POST' });
        const stopText = await stopRes.text();
        expect(stopRes.status === 202, `Expected stop request to be accepted. Got ${stopRes.status}: ${stopText}`);

        const stoppedStatus = await pollStatus(baseUrl, session.id, (status) => status?.status === 'stopped');
        expect(stoppedStatus.resumeAvailable === true, 'Expected stopped parallel build to be resumable.');
        expect(stoppedStatus.completedNodes === 1, `Expected stopped build to preserve one completed task. Got: ${JSON.stringify(stoppedStatus)}`);
        expect(Array.isArray(stoppedStatus.activeTasks) && stoppedStatus.activeTasks.length === 0, 'Expected stopped status not to keep active tasks alive.');

        const stoppedHistory = await readHistory(baseUrl, session.id);
        const preResumeCompletedTaskIds = new Set(
          stoppedHistory
            .filter((event) => event.type === 'task_completed' && typeof event.taskId === 'string')
            .map((event) => String(event.taskId)),
        );
        expect(preResumeCompletedTaskIds.size >= 1, 'Expected at least one task to finish before resume.');

        const resumeRes = await fetch(`${baseUrl}/api/omx/resume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id }),
        });
        const resumeText = await resumeRes.text();
        const resumeData = safeJson(resumeText) as Record<string, unknown> | null;
        expect(resumeRes.status === 202, `Expected resume start. Got ${resumeRes.status}: ${resumeText}`);
        expect(
          Array.isArray(resumeData?.activeTasks) && resumeData.activeTasks.length === 0,
          `Expected immediate resume response not to expose stale pre-resume active tasks. Got: ${resumeText}`,
        );

        const resumedStatus = await pollStatus(baseUrl, session.id, (status) => status?.status === 'running' && Array.isArray(status?.activeTasks) && status.activeTasks.length >= 1);
        expect(resumedStatus.activeWaveId, 'Expected resumed build to restore activeWaveId.');

        const history = await pollHistory(
          baseUrl,
          session.id,
          (events) => {
            const resumeIndex = events.findIndex((event) => event.type === 'resume_rehydrated');
            if (resumeIndex === -1) return false;
            return events.slice(resumeIndex + 1).some((event) => event.type === 'task_leased' && typeof event.taskId === 'string');
          },
          40,
        );
        const eventTypes = new Set(history.map((event) => String(event.type || '')));
        expect(eventTypes.has('wave_started'), 'Expected history to include wave_started.');
        expect(eventTypes.has('task_leased'), 'Expected history to include task_leased.');
        expect(eventTypes.has('worker_started'), 'Expected history to include worker_started.');
        expect(eventTypes.has('operational_message'), 'Expected history to include operational messages for stop/resume truth.');

        const resumeIndex = history.findIndex((event) => event.type === 'resume_rehydrated');
        expect(resumeIndex >= 0, 'Expected history to include resume_rehydrated.');
        const postResumeLeasedTaskIds = history
          .slice(resumeIndex + 1)
          .filter((event) => event.type === 'task_leased' && typeof event.taskId === 'string')
          .map((event) => String(event.taskId));
        expect(postResumeLeasedTaskIds.length >= 1, 'Expected at least one unfinished task to be re-leased after resume.');

        for (const taskId of preResumeCompletedTaskIds) {
          expect(
            !postResumeLeasedTaskIds.includes(taskId),
            `Expected completed task ${taskId} not to be re-leased after resume.`,
          );
        }

        const retriedTaskIds = new Set(
          postResumeLeasedTaskIds.filter((taskId) => !preResumeCompletedTaskIds.has(taskId)),
        );
        expect(
          retriedTaskIds.size >= 1,
          `Expected unfinished tasks to resume after stop. Got: ${JSON.stringify(postResumeLeasedTaskIds)}`,
        );
      });
    });
  } finally {
    await deleteSession(session.id).catch(() => {});
  }
}

run().then(() => {
  console.log('PASS omx parallel stop-resume contract');
}).catch((error) => {
  console.error('FAIL omx parallel stop-resume contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
