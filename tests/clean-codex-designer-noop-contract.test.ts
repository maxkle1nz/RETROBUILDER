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

async function withFakeCleanCodex<T>(run: () => Promise<T>): Promise<T> {
  const fakeBinDir = await mkdtemp(path.join(tmpdir(), 'clean-designer-fake-codex-'));
  const fakeCodexPath = path.join(fakeBinDir, 'codex');
  const originalPath = process.env.PATH || '';
  const originalWorkerCount = process.env.OMX_WORKER_COUNT;
  const originalDesignerModel = process.env.CODEX_DESIGNER_MODEL;
  const originalDesignerEffort = process.env.CODEX_DESIGNER_REASONING_EFFORT;
  const originalDesignerTimeout = process.env.CODEX_DESIGNER_TASK_TIMEOUT_MS;
  const originalDesignerHome = process.env.CODEX_DESIGNER_HOME;

  await writeFsFile(
    fakeCodexPath,
    [
      '#!/bin/sh',
      'if [ "$1" = "--version" ]; then',
      '  echo "codex 0.0-clean-designer-test"',
      '  exit 0',
      'fi',
      'if [ "$1" = "exec" ]; then',
      '  if [ -z "$CODEX_HOME" ]; then',
      '    echo "missing clean CODEX_HOME" >&2',
      '    exit 7',
      '  fi',
      '  if [ -f "$CODEX_HOME/AGENTS.md" ] || [ -d "$CODEX_HOME/skills" ] || [ -d "$CODEX_HOME/plugins" ]; then',
      '    echo "dirty CODEX_HOME leaked prompt/tool surfaces" >&2',
      '    exit 8',
      '  fi',
      '  case "$*" in',
      '    *"gpt-5.4-mini"* ) ;;',
      '    * ) echo "expected gpt-5.4-mini designer model" >&2; exit 9 ;;',
      '  esac',
      '  case "$*" in',
      '    *"model_reasoning_effort=\\"high\\""* ) ;;',
      '    * ) echo "expected high designer reasoning effort" >&2; exit 10 ;;',
      '  esac',
      '  echo "{\\"ok\\":true,\\"source\\":\\"fake-clean-codex-noop\\"}"',
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
  delete process.env.CODEX_DESIGNER_MODEL;
  delete process.env.CODEX_DESIGNER_REASONING_EFFORT;
  delete process.env.CODEX_DESIGNER_TASK_TIMEOUT_MS;
  delete process.env.CODEX_DESIGNER_HOME;

  try {
    return await run();
  } finally {
    process.env.PATH = originalPath;
    if (originalWorkerCount === undefined) delete process.env.OMX_WORKER_COUNT;
    else process.env.OMX_WORKER_COUNT = originalWorkerCount;
    if (originalDesignerModel === undefined) delete process.env.CODEX_DESIGNER_MODEL;
    else process.env.CODEX_DESIGNER_MODEL = originalDesignerModel;
    if (originalDesignerEffort === undefined) delete process.env.CODEX_DESIGNER_REASONING_EFFORT;
    else process.env.CODEX_DESIGNER_REASONING_EFFORT = originalDesignerEffort;
    if (originalDesignerTimeout === undefined) delete process.env.CODEX_DESIGNER_TASK_TIMEOUT_MS;
    else process.env.CODEX_DESIGNER_TASK_TIMEOUT_MS = originalDesignerTimeout;
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
    name: `Clean Designer Noop ${Date.now()}`,
    source: 'manual',
    manifesto: 'Clean designer lane should be isolated and transparently measured.',
    architecture: 'A single frontend task should keep a product baseline if the clean designer exits without renderable changes.',
    projectContext: 'clean designer noop contract',
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
  for (let i = 0; i < 80; i += 1) {
    const response = await fetch(`${baseUrl}/api/omx/status/${sessionId}`);
    const text = await response.text();
    const status = safeJson(text) as Record<string, unknown> | null;
    if (response.status === 200 && ['succeeded', 'failed', 'stopped'].includes(String(status?.status))) {
      return { response, text, status };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for clean designer no-op build.');
}

async function run() {
  const session = await createFrontendSession();
  try {
    await withFakeCleanCodex(async () => {
      await withOmxServer(async (baseUrl) => {
        const startResponse = await fetch(`${baseUrl}/api/omx/build`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id }),
        });
        const startText = await startResponse.text();
        expect(startResponse.status === 202, `Expected clean designer build start. Got ${startResponse.status}: ${startText}`);

        const { text, status } = await pollStatus(baseUrl, session.id);
        expect(status?.status === 'succeeded', `Expected no-op clean designer build to succeed via baseline. Got: ${text}`);

        const historyResponse = await fetch(`${baseUrl}/api/omx/history/${session.id}`);
        const historyText = await historyResponse.text();
        const history = safeJson(historyText) as { events?: Array<Record<string, unknown>> } | null;
        expect(historyResponse.status === 200, `Expected history read. Got ${historyResponse.status}: ${historyText}`);
        const fallbackEvents = history?.events?.filter((event) => event.type === 'worker_fallback') || [];
        expect(
          fallbackEvents.some((event) => String(event.reason || '').includes('Clean designer made no module artifact changes')),
          `Expected clean designer no-op fallback event. Got: ${historyText}`,
        );
      });
    });
  } finally {
    await deleteSession(session.id).catch(() => {});
  }
}

run().then(() => {
  console.log('PASS clean Codex designer no-op contract');
}).catch((error) => {
  console.error('FAIL clean Codex designer no-op contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
