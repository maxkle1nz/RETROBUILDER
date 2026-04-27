#!/usr/bin/env tsx
import express from 'express';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
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

async function createResumeSession(): Promise<SessionDocument> {
  return createSession({
    name: `OMX Resume ${Date.now()}`,
    source: 'manual',
    manifesto: 'Resume build from persisted workspace truth.',
    architecture: 'OMX should continue incomplete modules instead of restarting from zero.',
    projectContext: 'resume contract test',
    graph: {
      nodes: [
        {
          id: 'artist-registry',
          label: 'Artist Registry',
          description: 'Persist artist records.',
          status: 'pending',
          type: 'backend',
          group: 1,
          priority: 1,
          data_contract: 'Input: artist payload. Output: persisted artist record.',
          acceptance_criteria: ['Stores artist data.', 'Exposes lookup.'],
          error_handling: ['Returns structured errors.'],
        },
        {
          id: 'release-dashboard',
          label: 'Release Dashboard',
          description: 'Surface release information.',
          status: 'pending',
          type: 'frontend',
          group: 1,
          priority: 2,
          data_contract: 'Input: release payload. Output: dashboard panels.',
          acceptance_criteria: ['Shows release state.', 'Shows primary action.'],
          error_handling: ['Shows fallback copy.'],
          designProfile: '21st',
          referenceCandidates: [],
          selectedReferenceIds: [],
          variantCandidates: [],
          selectedVariantId: 'seeded',
          previewArtifact: {
            kind: 'tsx',
            componentName: 'ReleaseDashboardPreview',
            screenType: 'dashboard',
            summary: 'seeded preview',
            blocks: [
              { id: 'hero', kind: 'hero', title: 'Release Dashboard' },
              { id: 'metrics', kind: 'metrics', title: 'Metrics', items: ['state', 'owner'] },
              { id: 'cta', kind: 'cta', title: 'Continue' },
            ],
            tsx: 'export const ReleaseDashboardPreview = () => null;',
          },
          previewState: { density: 'compact', emphasis: 'dashboard' },
          designVerdict: { status: 'passed', score: 90, findings: [], evidence: ['seeded'] },
        },
      ],
      links: [],
    },
  });
}

async function seedPersistedPartialBuild(session: SessionDocument) {
  const runtimeDir = getRuntimeDirectory(session.id);
  const buildId = 'resume-build-1';
  const workspacePath = path.join(runtimeDir, `build-${buildId}`);
  await mkdir(path.join(workspacePath, 'modules', 'artist-registry'), { recursive: true });
  await writeFile(path.join(workspacePath, 'modules', 'artist-registry', 'README.md'), '# Artist Registry\n', 'utf8');
  await writeFile(path.join(runtimeDir, 'omx-status.json'), JSON.stringify({
    sessionId: session.id,
    buildId,
    status: 'stopped',
    workspacePath,
    transport: { kind: 'codex-cli', command: 'codex exec --json --skip-git-repo-check --sandbox workspace-write', available: true },
    source: 'persisted-session',
    totalNodes: 2,
    completedNodes: 1,
    buildProgress: 50,
    activeNodeId: null,
    nodeStates: { 'artist-registry': 'complete', 'release-dashboard': 'error' },
    designProfile: '21st',
    designGateStatus: 'passed',
    designScore: 90,
    designFindings: [],
    designEvidence: ['seeded'],
    terminalMessage: 'BUILD STOPPED — seed',
  }, null, 2), 'utf8');
  return { buildId, workspacePath };
}

async function run() {
  const session = await createResumeSession();
  try {
    const seeded = await seedPersistedPartialBuild(session);
    await withOmxServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/omx/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const text = await response.text();
      const data = safeJson(text) as Record<string, unknown> | null;

      expect(response.status === 202, `Expected resume route to start successfully. Got ${response.status}: ${text}`);
      expect(data?.buildId === seeded.buildId, `Expected resume to reuse the persisted buildId. Got: ${text}`);
      expect(data?.workspacePath === seeded.workspacePath, `Expected resume to reuse the persisted workspace. Got: ${text}`);
      expect(data?.status === 'queued', `Expected resumed build to come back as queued. Got: ${text}`);
      expect(data?.resumeAvailable === undefined || data?.resumeAvailable === false, `Expected live resumed build not to advertise manual resume. Got: ${text}`);
    });
  } finally {
    await deleteSession(session.id).catch(() => {});
  }
}

run().then(() => {
  console.log('PASS omx resume contract');
}).catch((error) => {
  console.error('FAIL omx resume contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
