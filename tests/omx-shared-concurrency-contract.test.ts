#!/usr/bin/env tsx
import { compileExecutionGraph } from '../src/server/omx-scheduler.ts';
import type { SessionDocument } from '../src/server/session-store.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function createSession(): SessionDocument {
  return {
    id: 'session-shared-concurrency',
    name: 'Shared Concurrency',
    source: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    manifesto: 'Shared artifacts may be produced concurrently but merged under owner lanes.',
    architecture: 'OMX 2 shared-file concurrency control',
    projectContext: 'test',
    graph: {
      nodes: [
        { id: 'marketing-frontend', label: 'Marketing Frontend', type: 'frontend', priority: 1 },
        { id: 'atlas-frontend', label: 'Atlas Frontend', type: 'frontend', priority: 1 },
      ],
      links: [],
    },
  } as SessionDocument;
}

function run() {
  const graph = compileExecutionGraph(createSession(), 2);
  expect(graph.workerCount === 2, 'Expected scheduler to preserve requested workerCount.');
  expect(graph.waves.length === 1, 'Expected both frontends to enter the same wave when only shared artifacts overlap.');
  expect(graph.waves[0]?.taskIds.length === 2, 'Expected both frontend tasks in the same execution wave.');
  const appRules = graph.ownership.rules.filter((rule) => rule.pathPattern === 'app/**');
  expect(appRules.filter((rule) => rule.classification === 'shared-owner').length === 1, 'Expected exactly one active shared owner for app/**.');
  expect(appRules.filter((rule) => rule.classification === 'merge-only').length === 1, 'Expected exactly one merge-only candidate for app/**.');
  console.log('PASS omx shared concurrency contract');
}

run();
