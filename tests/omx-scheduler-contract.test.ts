#!/usr/bin/env tsx
import { compileExecutionGraph } from '../src/server/omx-scheduler.ts';
import type { SessionDocument } from '../src/server/session-store.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function createSession(): SessionDocument {
  return {
    id: 'session-1',
    name: 'Scheduler Contract',
    source: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    manifesto: 'Scheduler contract',
    architecture: 'Wave execution',
    projectContext: 'test',
    graph: {
      nodes: [
        { id: 'core-db', label: 'Core DB', type: 'backend', priority: 1 },
        { id: 'artist-service', label: 'Artist Service', type: 'backend', priority: 2 },
        { id: 'main-frontend', label: 'Frontend', type: 'frontend', priority: 3 },
      ],
      links: [
        { source: 'core-db', target: 'artist-service' },
        { source: 'artist-service', target: 'main-frontend' },
      ],
    },
  } as SessionDocument;
}

function run() {
  const graph = compileExecutionGraph(createSession(), 1);
  expect(graph.workerCount === 1, 'Expected workerCount=1 in the conservative OMX 2 slice.');
  expect(graph.tasks.length === 3, 'Expected one task per node in V1 execution graph.');
  expect(graph.waves.length === 3, 'Expected a linear dependency chain to compile into 3 waves.');
  expect(graph.tasks.every((task) => task.verifyCommand === 'auto'), 'Expected tasks to carry auto verify command inference by default.');
  expect(graph.tasks.every((task) => task.writeSet.length === 1 && task.writeSet[0].startsWith('modules/')), 'Expected every task to own exactly one module write set.');
  expect(graph.ownership.rules.some((rule) => rule.pathPattern === '.omx/**' && rule.classification === 'system'), 'Expected ownership manifest to reserve .omx/** for the system lane.');

  const sectionHeavyGraph = compileExecutionGraph({
    ...createSession(),
    graph: {
      nodes: [
        {
          id: 'hero-section',
          label: 'Hero Section',
          type: 'frontend',
          status: 'pending',
          description: 'Landing hero section.',
          data_contract: 'Input: content -> Output: hero',
          decision_rationale: 'The page needs a first impression.',
          acceptance_criteria: ['Hero renders', 'Primary CTA is visible'],
          error_handling: ['Missing content falls back', 'CTA failure retries'],
          priority: 1,
          group: 1,
        },
        {
          id: 'pricing-section',
          label: 'Pricing Section',
          type: 'frontend',
          status: 'pending',
          description: 'Pricing cards section.',
          data_contract: 'Input: plans -> Output: cards',
          decision_rationale: 'The page needs pricing.',
          acceptance_criteria: ['Plans render', 'Featured plan is highlighted'],
          error_handling: ['Missing plans falls back', 'Invalid plans are ignored'],
          priority: 2,
          group: 1,
        },
        {
          id: 'final-cta',
          label: 'Final CTA',
          type: 'frontend',
          status: 'pending',
          description: 'Final page call to action.',
          data_contract: 'Input: action -> Output: CTA',
          decision_rationale: 'The page needs a closing action.',
          acceptance_criteria: ['CTA renders', 'CTA is keyboard accessible'],
          error_handling: ['Missing action falls back', 'Failed action shows retry'],
          priority: 3,
          group: 1,
        },
        {
          id: 'payment-checkout',
          label: 'Payment Checkout',
          type: 'external',
          status: 'pending',
          description: 'Checkout provider.',
          data_contract: 'Input: plan -> Output: session',
          decision_rationale: 'Checkout is delegated.',
          acceptance_criteria: ['Session is created', 'Provider reference is saved'],
          error_handling: ['Timeout returns retry', 'Invalid plan returns 400'],
          priority: 4,
          group: 5,
        },
      ],
      links: [
        { source: 'hero-section', target: 'pricing-section' },
        { source: 'pricing-section', target: 'final-cta' },
        { source: 'final-cta', target: 'payment-checkout' },
      ],
    },
  } as SessionDocument, 2);
  expect(sectionHeavyGraph.tasks.length === 2, `Expected visual sections to compile as one app plus checkout, got ${sectionHeavyGraph.tasks.length} tasks.`);
  expect(sectionHeavyGraph.tasks.some((task) => task.nodeId === 'product-web-app'), 'Expected scheduler to consolidate visual section nodes before creating module tasks.');
  expect(!sectionHeavyGraph.tasks.some((task) => ['hero-section', 'pricing-section', 'final-cta'].includes(task.nodeId)), 'Expected scheduler not to create per-section module tasks.');
  expect(sectionHeavyGraph.tasks.some((task) => task.writeSet[0] === 'modules/product-web-app/**'), 'Expected merged frontend app to own one product-web-app module write set.');

  const frontendConflict = compileExecutionGraph({
    ...createSession(),
    graph: {
      nodes: [
        { id: 'marketing-frontend', label: 'Marketing Frontend', type: 'frontend', priority: 1 },
        { id: 'atlas-frontend', label: 'Atlas Frontend', type: 'frontend', priority: 1 },
      ],
      links: [],
    },
  } as SessionDocument, 2);
  expect(frontendConflict.tasks.every((task) => task.sharedArtifacts.includes('app/**')), 'Expected frontend tasks to infer shared app ownership lanes.');
  expect(frontendConflict.waves.length === 1, 'Expected frontend tasks with disjoint module write sets to share a wave even when shared artifacts overlap.');
  const appRules = frontendConflict.ownership.rules.filter((rule) => rule.pathPattern === 'app/**');
  expect(appRules.some((rule) => rule.classification === 'shared-owner'), 'Expected one shared-owner rule for app/**.');
  expect(appRules.some((rule) => rule.classification === 'merge-only'), 'Expected non-owner frontend tasks to be represented as merge-only candidates for app/**.');
  console.log('PASS omx scheduler contract');
}

run();
