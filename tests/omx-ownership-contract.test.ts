#!/usr/bin/env tsx
import { assertTaskOwnership, deriveOmxOwnershipManifest } from '../src/server/omx-ownership.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function run() {
  const manifest = deriveOmxOwnershipManifest([
    {
      taskId: 'task:marketing-frontend',
      writeSet: ['modules/marketing-frontend/**'],
      sharedArtifacts: ['app/**'],
    },
    {
      taskId: 'task:main-frontend',
      writeSet: ['modules/main-frontend/**'],
      sharedArtifacts: ['app/**'],
    },
  ]);

  const allowed = assertTaskOwnership(manifest, 'task:marketing-frontend', [
    'modules/marketing-frontend/src/index.ts',
    'modules/marketing-frontend/README.md',
  ]);
  const rejected = assertTaskOwnership(manifest, 'task:marketing-frontend', [
    'modules/artist-service/src/index.ts',
  ]);
  const sharedOwnerRule = manifest.rules.find((rule) => rule.pathPattern === 'app/**' && rule.classification === 'shared-owner');
  const sharedMergeOnlyRule = manifest.rules.find((rule) => rule.pathPattern === 'app/**' && rule.classification === 'merge-only');
  const sharedAllowed = assertTaskOwnership(manifest, String(sharedOwnerRule?.ownerTaskId), ['app/page.tsx']);
  const sharedRejected = assertTaskOwnership(manifest, String(sharedMergeOnlyRule?.ownerTaskId), ['app/page.tsx']);

  expect(allowed.rejectedPaths.length === 0, 'Expected owned module paths to pass ownership checks.');
  expect(rejected.rejectedPaths.length === 1, 'Expected foreign module paths to be rejected.');
  expect(rejected.violations.length === 1, 'Expected ownership violation to explain why the path is invalid for the task.');
  expect(sharedOwnerRule, 'Expected exactly one shared-owner rule for app/**.');
  expect(sharedMergeOnlyRule, 'Expected exactly one merge-only rule for app/**.');
  expect(sharedAllowed.rejectedPaths.length === 0, 'Expected matching shared-owner paths to pass for the owning task.');
  expect(sharedRejected.rejectedPaths.length === 1, 'Expected merge-only shared paths to be rejected for non-owner tasks until arbitration occurs.');
  console.log('PASS omx ownership contract');
}

run();
