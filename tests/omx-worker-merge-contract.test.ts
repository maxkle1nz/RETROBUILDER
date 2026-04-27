#!/usr/bin/env tsx
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deriveOmxOwnershipManifest } from '../src/server/omx-ownership.ts';
import { collectArtifactManifest, mergeTaskArtifacts } from '../src/server/omx-worker.ts';
import type { OmxExecutionTask } from '../src/server/omx-scheduler.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function run() {
  const root = await mkdtemp(path.join(tmpdir(), 'omx-worker-merge-'));
  const buildWorkspace = path.join(root, 'workspace');
  const overlay = path.join(root, 'overlay');

  const task: OmxExecutionTask = {
    taskId: 'task:main-frontend',
    nodeId: 'main-frontend',
    waveId: 'wave-1',
    label: 'Main Frontend',
    type: 'frontend',
    priority: 1,
    dependsOnTaskIds: [],
    readSet: ['.omx/**'],
    writeSet: ['modules/main-frontend/**'],
    sharedArtifacts: ['app/**', 'components/**'],
    verifyCommand: 'auto',
    completionGate: { verify: true, ownership: true, artifacts: true },
    estimatedCost: 6,
    status: 'pending',
  };

  await mkdir(path.join(buildWorkspace, 'modules', 'main-frontend'), { recursive: true });
  await mkdir(path.join(overlay, 'modules', 'main-frontend'), { recursive: true });
  await mkdir(path.join(overlay, 'app'), { recursive: true });
  await mkdir(path.join(overlay, 'components'), { recursive: true });

  await writeFile(path.join(overlay, 'modules', 'main-frontend', 'README.md'), '# Frontend\n', 'utf8');
  await writeFile(path.join(overlay, 'app', 'page.tsx'), 'export default function Page() { return null; }\n', 'utf8');
  await writeFile(path.join(overlay, 'components', 'atlas-shell.tsx'), 'export function AtlasShell() { return null; }\n', 'utf8');

  const manifest = await collectArtifactManifest(overlay, task);
  const ownership = deriveOmxOwnershipManifest([task]);
  const receipt = await mergeTaskArtifacts(buildWorkspace, overlay, task, manifest, ownership);

  expect(receipt.applied === true, 'Expected merge receipt to apply when shared owner paths belong to the task.');
  expect(receipt.appliedPaths.includes('app/page.tsx'), 'Expected app/page.tsx to be promoted through the merge lane.');
  expect(receipt.appliedPaths.includes('components/atlas-shell.tsx'), 'Expected shared component artifact to be promoted through the merge lane.');

  const mergedPage = await readFile(path.join(buildWorkspace, 'app', 'page.tsx'), 'utf8');
  const mergedComponent = await readFile(path.join(buildWorkspace, 'components', 'atlas-shell.tsx'), 'utf8');
  expect(/Page/.test(mergedPage), 'Expected merged app/page.tsx to exist in workspace truth.');
  expect(/AtlasShell/.test(mergedComponent), 'Expected merged shared component to exist in workspace truth.');

  console.log('PASS omx worker merge contract');
  await rm(root, { recursive: true, force: true }).catch(() => {});
}

run().catch((error) => {
  console.error('FAIL omx worker merge contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
