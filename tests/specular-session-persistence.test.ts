#!/usr/bin/env tsx
import {
  createSession,
  deleteSession,
  loadSession,
  saveSession,
} from '../src/server/session-store.ts';
import { buildSpecularNodePatch } from '../src/server/specular-create/specular-service.ts';

function expect(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function test_specular_fields_survive_session_persistence_roundtrip() {
  const session = await createSession({
    name: `Specular Persistence ${Date.now()}`,
    source: 'manual',
    manifesto: 'Persist UIX with the blueprint.',
    architecture: 'Preview artifacts live on session nodes.',
    projectContext: 'Persistence test',
    graph: {
      nodes: [
        {
          id: 'ops-dashboard',
          label: 'Ops Dashboard',
          description: 'A control surface for operators.',
          status: 'pending',
          type: 'frontend',
          group: 1,
          priority: 1,
          data_contract: 'Input: { status: string, incidents: number, owner: string } Output: { panels: string[] }',
          acceptance_criteria: [
            'Operators can see live status in one glance.',
            'Operators can trigger the main corrective action without searching.',
          ],
          error_handling: ['Render degraded-state copy when incident feeds fail.'],
        },
      ],
      links: [],
    },
  });

  try {
    const node = session.graph.nodes[0];
    const patch = buildSpecularNodePatch(node as any);

    await saveSession(session.id, {
      graph: {
        ...session.graph,
        nodes: session.graph.nodes.map((entry) => (entry.id === node.id ? { ...entry, ...patch } : entry)),
      },
    });

    const reloaded = await loadSession(session.id);
    expect(reloaded, 'Expected session to reload after persistence.');

    const persistedNode = reloaded!.graph.nodes.find((entry) => entry.id === node.id) as any;
    expect(persistedNode?.designProfile === '21st', `Expected designProfile to persist. Got: ${String(persistedNode?.designProfile)}`);
    expect(Array.isArray(persistedNode?.referenceCandidates) && persistedNode.referenceCandidates.length >= 1, 'Expected referenceCandidates to persist.');
    expect(Array.isArray(persistedNode?.variantCandidates) && persistedNode.variantCandidates.length >= 3, 'Expected variantCandidates to persist.');
    expect(Array.isArray(persistedNode?.selectedProductDnaPackIds) && persistedNode.selectedProductDnaPackIds.length >= 1, 'Expected selectedProductDnaPackIds to persist.');
    expect(persistedNode?.activeProductDnaContract?.contractVersion === 'active-product-dna-contract@1', 'Expected activeProductDnaContract to persist.');
    expect(Array.isArray(persistedNode?.activeProductDnaContract?.packBindings) && persistedNode.activeProductDnaContract.packBindings.length >= 1, 'Expected persisted Product DNA contract to include pack bindings.');
    expect(typeof persistedNode?.selectedVariantId === 'string' && persistedNode.selectedVariantId.length > 0, 'Expected selectedVariantId to persist.');
    expect(typeof persistedNode?.previewArtifact?.tsx === 'string' && persistedNode.previewArtifact.tsx.length > 0, 'Expected previewArtifact.tsx to persist.');
    expect(typeof persistedNode?.designVerdict?.score === 'number', 'Expected designVerdict.score to persist.');
  } finally {
    await deleteSession(session.id);
  }
}

async function run() {
  const tests = [test_specular_fields_survive_session_persistence_roundtrip];

  let passed = 0;
  for (const test of tests) {
    try {
      await test();
      console.log(`PASS ${test.name}`);
      passed += 1;
    } catch (error) {
      console.error(`FAIL ${test.name}`);
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  console.log(`\n${passed}/${tests.length} tests passed`);
}

run();
