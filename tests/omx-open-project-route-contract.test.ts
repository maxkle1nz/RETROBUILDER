#!/usr/bin/env tsx
import express from 'express';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
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

async function createOpenProjectSession(): Promise<SessionDocument> {
  return createSession({
    name: `OMX Open Project ${Date.now()}`,
    source: 'manual',
    manifesto: 'Open project route containment contract.',
    architecture: 'The local folder opener must never follow generated workspace symlinks outside the session runtime.',
    projectContext: 'open project route contract',
    graph: { nodes: [], links: [] },
  });
}

async function seedStatus(session: SessionDocument, workspacePath: string) {
  const runtimeDir = getRuntimeDirectory(session.id);
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(
    path.join(runtimeDir, 'omx-status.json'),
    JSON.stringify({
      sessionId: session.id,
      buildId: `open-project-${Date.now()}`,
      status: 'succeeded',
      workspacePath,
      transport: { kind: 'codex-cli', command: 'codex exec --json --skip-git-repo-check', available: true },
      source: 'persisted-session',
      result: { totalFiles: 1, totalLines: 1, elapsedMs: 1 },
      terminalMessage: 'BUILD SUCCEEDED',
    }, null, 2),
    'utf8',
  );
}

async function test_open_project_rejects_symlink_escape_before_os_spawn() {
  const session = await createOpenProjectSession();
  const outsideDir = await mkdtemp(path.join(tmpdir(), 'omx-open-project-outside-'));
  try {
    const runtimeDir = getRuntimeDirectory(session.id);
    await rm(runtimeDir, { force: true, recursive: true }).catch(() => {});
    await mkdir(runtimeDir, { recursive: true });
    const linkedWorkspace = path.join(runtimeDir, 'build-linked-outside');
    await symlink(outsideDir, linkedWorkspace);
    await seedStatus(session, linkedWorkspace);

    await withOmxServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/omx/open-project/${session.id}`, { method: 'POST' });
      const text = await response.text();
      const data = safeJson(text) as { error?: string } | null;
      expect(response.status === 409, `Expected symlink workspace escape to be rejected. Got ${response.status}: ${text}`);
      expect(/safe generated workspace/i.test(String(data?.error || '')), `Expected safe workspace error. Got: ${text}`);
    });
  } finally {
    await rm(outsideDir, { force: true, recursive: true }).catch(() => {});
    await deleteSession(session.id).catch(() => {});
  }
}

async function test_open_project_reports_missing_inside_runtime_as_not_found() {
  const session = await createOpenProjectSession();
  try {
    const runtimeDir = getRuntimeDirectory(session.id);
    await rm(runtimeDir, { force: true, recursive: true }).catch(() => {});
    await mkdir(runtimeDir, { recursive: true });
    await seedStatus(session, path.join(runtimeDir, 'build-missing'));

    await withOmxServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/omx/open-project/${session.id}`, { method: 'POST' });
      const text = await response.text();
      expect(response.status === 404, `Expected missing in-runtime workspace to return 404. Got ${response.status}: ${text}`);
    });
  } finally {
    await deleteSession(session.id).catch(() => {});
  }
}

async function run() {
  await test_open_project_rejects_symlink_escape_before_os_spawn();
  await test_open_project_reports_missing_inside_runtime_as_not_found();
  console.log('PASS omx open-project route contract');
}

run().catch((error) => {
  console.error('FAIL omx open-project route contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
