#!/usr/bin/env tsx
import express from 'express';
import { chmod, mkdtemp, readFile, rm, writeFile as writeFsFile } from 'node:fs/promises';
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

async function withInvalidPatchCodex<T>(run: () => Promise<T>): Promise<T> {
  const fakeBinDir = await mkdtemp(path.join(tmpdir(), 'clean-designer-invalid-codex-'));
  const fakeCodexPath = path.join(fakeBinDir, 'codex');
  const originalPath = process.env.PATH || '';
  const originalWorkerCount = process.env.OMX_WORKER_COUNT;
  const originalDesignerHome = process.env.CODEX_DESIGNER_HOME;

  await writeFsFile(
    fakeCodexPath,
    [
      '#!/bin/sh',
      'if [ "$1" = "--version" ]; then',
      '  echo "codex 0.0-invalid-designer-test"',
      '  exit 0',
      'fi',
      'if [ "$1" = "exec" ]; then',
      '  if [ -z "$CODEX_HOME" ]; then',
      '    echo "missing clean CODEX_HOME" >&2',
      '    exit 7',
      '  fi',
      '  mkdir -p modules/public-site/src',
      '  cat > modules/public-site/src/index.js <<\\BROKEN',
      "'use strict';",
      'const broken = ;',
      'module.exports = {};',
      'BROKEN',
      '  echo "{\\"ok\\":true,\\"source\\":\\"fake-invalid-designer-patch\\"}"',
      '  exit 0',
      'fi',
      'exit 0',
      '',
    ].join('\n'),
    'utf8',
  );
  await chmod(fakeCodexPath, 0o755);
  process.env.PATH = `${fakeBinDir}${path.delimiter}${originalPath}`;
  process.env.OMX_WORKER_COUNT = '1';
  delete process.env.CODEX_DESIGNER_HOME;

  try {
    return await run();
  } finally {
    process.env.PATH = originalPath;
    if (originalWorkerCount === undefined) delete process.env.OMX_WORKER_COUNT;
    else process.env.OMX_WORKER_COUNT = originalWorkerCount;
    if (originalDesignerHome === undefined) delete process.env.CODEX_DESIGNER_HOME;
    else process.env.CODEX_DESIGNER_HOME = originalDesignerHome;
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
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Failed to resolve OMX test port.');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function createFrontendSession(): Promise<SessionDocument> {
  return createSession({
    name: `Clean Designer Invalid Patch ${Date.now()}`,
    source: 'manual',
    manifesto: 'Invalid clean designer patches should be discarded in favor of the deterministic product baseline.',
    architecture: 'A single frontend task should recover from broken designer output and still produce a verified runtime.',
    projectContext: 'clean designer invalid patch contract',
    graph: {
      nodes: [
        {
          id: 'public-site',
          label: 'Cut & Crown Public Booking Site',
          description: 'Premium barbershop booking site with CRM follow-up.',
          status: 'pending',
          type: 'frontend',
          group: 1,
          priority: 1,
          data_contract: 'Input: booking request. Output: rendered public booking surface.',
          acceptance_criteria: ['Shows services.', 'Shows booking CTA.', 'Works at 390px.'],
          error_handling: ['Keep form usable with fallback slots.'],
          designProfile: '21st',
          referenceCandidates: [],
          selectedReferenceIds: [],
          designVerdict: { status: 'passed', score: 92, findings: [], evidence: ['contract seeded'] },
        },
      ],
      links: [],
    },
  });
}

async function pollStatus(baseUrl: string, sessionId: string) {
  for (let i = 0; i < 100; i += 1) {
    const response = await fetch(`${baseUrl}/api/omx/status/${sessionId}`);
    const text = await response.text();
    const status = safeJson(text) as Record<string, unknown> | null;
    if (response.status === 200 && ['succeeded', 'failed', 'stopped'].includes(String(status?.status))) {
      return { text, status };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for invalid designer patch build.');
}

async function run() {
  const session = await createFrontendSession();
  try {
    await withInvalidPatchCodex(async () => {
      await withOmxServer(async (baseUrl) => {
        const startResponse = await fetch(`${baseUrl}/api/omx/build`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id }),
        });
        const startText = await startResponse.text();
        expect(startResponse.status === 202, `Expected invalid patch build start. Got ${startResponse.status}: ${startText}`);

        const { text, status } = await pollStatus(baseUrl, session.id);
        expect(status?.status === 'succeeded', `Expected invalid designer patch to recover via deterministic baseline. Got: ${text}`);

        const workspacePath = String(status?.workspacePath || '');
        const indexSource = await readFile(path.join(workspacePath, 'modules/public-site/src/index.js'), 'utf8');
        expect(!indexSource.includes('const broken = ;'), 'Expected invalid designer patch to be replaced before merge.');
        expect(indexSource.includes('Confirm booking'), 'Expected restored deterministic baseline to keep booking submit copy.');

        const historyResponse = await fetch(`${baseUrl}/api/omx/history/${session.id}`);
        const historyText = await historyResponse.text();
        const history = safeJson(historyText) as { events?: Array<Record<string, unknown>> } | null;
        const fallbackEvents = history?.events?.filter((event) => event.type === 'worker_fallback') || [];
        expect(
          fallbackEvents.some((event) => String(event.message || '').includes('patch failed module verify')),
          `Expected invalid clean designer patch fallback event. Got: ${historyText}`,
        );
      });
    });
  } finally {
    await deleteSession(session.id).catch(() => {});
  }
}

run().then(() => {
  console.log('PASS clean Codex designer invalid patch contract');
}).catch((error) => {
  console.error('FAIL clean Codex designer invalid patch contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
