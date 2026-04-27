#!/usr/bin/env tsx
import express from 'express';
import { createSpecularRouter } from '../src/server/routes/specular.ts';
import { createSession, deleteSession, type SessionDocument } from '../src/server/session-store.ts';

function expect(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function truncate(text: string, max = 220) {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractSpecularTruthManifest(html: string) {
  const match = html.match(/<script id="rb-specular-truth" type="application\/json">([\s\S]*?)<\/script>/);
  return match ? safeJson(match[1]) as Record<string, unknown> | null : null;
}

async function withSpecularServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use(createSpecularRouter());

  const server = await new Promise<import('node:http').Server>((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Failed to resolve SPECULAR test server port.');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    return await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function createFrontendSession(): Promise<SessionDocument> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return createSession({
    name: `Specular Route ${stamp}`,
    source: 'manual',
    manifesto: 'Design interfaces from blueprint truth.',
    architecture: 'Frontend nodes get contract-bound UIX previews before build.',
    projectContext: 'SPECULAR CREATE route contract test.',
    graph: {
      nodes: [
        {
          id: 'ops-dashboard',
          label: 'Ops Dashboard',
          description: 'A control surface for operators to inspect status and intervene safely.',
          status: 'pending',
          type: 'frontend',
          group: 1,
          priority: 1,
          data_contract: 'Input: { status: string, incidents: number, owner: string } Output: { panels: string[], actions: string[] }',
          acceptance_criteria: [
            'Operators can see live status in one glance.',
            'Operators can trigger the main corrective action without searching.',
          ],
          error_handling: [
            'Render degraded-state copy when incident feeds fail.',
          ],
        },
      ],
      links: [],
    },
  });
}

async function test_specular_generate_returns_21st_payload_for_saved_session() {
  const session = await createFrontendSession();
  try {
    await withSpecularServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/specular/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, nodeId: 'ops-dashboard' }),
      });
      const text = await response.text();
      const data = safeJson(text) as Record<string, unknown> | null;

      expect(response.status === 200, `Expected specular generate route to succeed. Got ${response.status}: ${truncate(text)}`);
      expect(data?.designProfile === '21st', `Expected designProfile='21st'. Got: ${String(data?.designProfile)}`);
      expect(Array.isArray(data?.variantCandidates) && (data?.variantCandidates as unknown[]).length >= 3, `Expected at least three UIX variants. Got: ${truncate(text)}`);
      expect(Array.isArray(data?.selectedProductDnaPackIds) && (data?.selectedProductDnaPackIds as unknown[]).length >= 1, `Expected SPECULAR generate route to include selected Product DNA pack ids. Got: ${truncate(text)}`);
      expect((data?.activeProductDnaContract as Record<string, unknown> | undefined)?.contractVersion === 'active-product-dna-contract@1', `Expected SPECULAR generate route to include active Product DNA contract. Got: ${truncate(text)}`);
      const knowledge = data?.knowledgeContextBundle as Record<string, unknown> | undefined;
      expect(knowledge?.schemaVersion === 'knowledge-bank@1', `Expected SPECULAR generate route to include Knowledge Bank context. Got: ${truncate(text)}`);
      expect(typeof (knowledge?.receipt as Record<string, unknown> | undefined)?.receiptId === 'string', `Expected SPECULAR generate route to include Knowledge Bank receipt id. Got: ${truncate(text)}`);
      expect(typeof (data?.previewArtifact as Record<string, unknown> | undefined)?.tsx === 'string', `Expected previewArtifact.tsx to exist. Got: ${truncate(text)}`);
      expect(typeof (data?.designVerdict as Record<string, unknown> | undefined)?.score === 'number', `Expected designVerdict.score to be numeric. Got: ${truncate(text)}`);
    });
  } finally {
    await deleteSession(session.id);
  }
}

async function test_specular_generate_accepts_ephemeral_draft_payload() {
  await withSpecularServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/specular/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodeId: 'draft-landing',
        draft: {
          name: 'Draft Session',
          source: 'manual',
          manifesto: 'Design before build.',
          architecture: 'UI previews are generated from contract truth.',
          projectContext: 'Draft-only specular test',
          importMeta: null,
          graph: {
            nodes: [
              {
                id: 'draft-landing',
                label: 'Draft Landing',
                description: 'A marketing-facing landing surface for the system thesis.',
                status: 'pending',
                type: 'frontend',
                group: 1,
                data_contract: 'Input: { story: string, proof: string[] } Output: { sections: string[] }',
                acceptance_criteria: ['The landing page explains the system thesis clearly.', 'The call to action is visible above the fold.'],
                error_handling: ['Fallback copy is shown when external proof is unavailable.'],
              },
            ],
            links: [],
          },
        },
      }),
    });
    const text = await response.text();
    const data = safeJson(text) as Record<string, unknown> | null;

    expect(response.status === 200, `Expected draft-based specular generate route to succeed. Got ${response.status}: ${truncate(text)}`);
    expect(data?.nodeId === 'draft-landing', `Expected draft nodeId to be preserved. Got: ${truncate(text)}`);
      expect(typeof (data?.previewArtifact as Record<string, unknown> | undefined)?.summary === 'string', `Expected draft response to include preview summary. Got: ${truncate(text)}`);
      expect((data?.activeProductDnaContract as Record<string, unknown> | undefined)?.contractVersion === 'active-product-dna-contract@1', `Expected draft response to include active Product DNA contract. Got: ${truncate(text)}`);
      expect((data?.knowledgeContextBundle as Record<string, unknown> | undefined)?.schemaVersion === 'knowledge-bank@1', `Expected draft response to include Knowledge Bank context. Got: ${truncate(text)}`);
  });
}

async function test_specular_preview_route_hydrates_saved_session_node() {
  const session = await createFrontendSession();
  try {
    await withSpecularServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/specular/preview/${session.id}/ops-dashboard`);
      const text = await response.text();
      const data = safeJson(text) as Record<string, unknown> | null;

      expect(response.status === 200, `Expected specular preview route to succeed. Got ${response.status}: ${truncate(text)}`);
      expect(data?.nodeId === 'ops-dashboard', `Expected preview route to target the requested node. Got: ${truncate(text)}`);
      expect(Array.isArray((data?.previewArtifact as Record<string, unknown> | undefined)?.blocks), `Expected preview route to return preview blocks. Got: ${truncate(text)}`);
      expect((data?.knowledgeContextBundle as Record<string, unknown> | undefined)?.schemaVersion === 'knowledge-bank@1', `Expected preview route to include Knowledge Bank context. Got: ${truncate(text)}`);
    });
  } finally {
    await deleteSession(session.id);
  }
}

async function test_specular_showcase_route_renders_product_grade_html() {
  const session = await createFrontendSession();
  try {
    await withSpecularServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/specular/showcase/${session.id}`);
      const text = await response.text();

      expect(response.status === 200, `Expected specular showcase route to succeed. Got ${response.status}: ${truncate(text)}`);
      expect(text.includes('Retrobuilder SPECULAR showcase'), `Expected showcase chrome to identify SPECULAR QA. Got: ${truncate(text)}`);
      expect(text.includes('Specular Route'), `Expected showcase to render the session name. Got: ${truncate(text)}`);
      expect(text.includes('rb-surface'), `Expected showcase to render product surface cards. Got: ${truncate(text)}`);
      expect(text.includes('rb-hero'), `Expected showcase to render high-impact hero blocks. Got: ${truncate(text)}`);
      expect(text.includes('avg score'), `Expected showcase to expose quality score metadata. Got: ${truncate(text)}`);
      expect(text.includes('id="rb-specular-truth"'), `Expected showcase to expose a browser-readable truth manifest. Got: ${truncate(text)}`);
      expect(text.includes('data-specular-surface-id="ops-dashboard"'), `Expected showcase DOM surface to carry the backend node id. Got: ${truncate(text)}`);
      expect(text.includes('data-product-dna-packs='), `Expected showcase DOM surface to expose Product DNA pack metadata. Got: ${truncate(text)}`);
      expect(text.includes('data-knowledge-receipt-id="kb-receipt-'), `Expected showcase DOM surface to expose Knowledge Bank receipt metadata. Got: ${truncate(text)}`);
      expect(text.includes('Knowledge Bank') || text.includes('KB:'), `Expected showcase to expose compact Knowledge Bank evidence. Got: ${truncate(text)}`);
      expect(!/bg-black\/30|bg-black\/25|bg-white\/5|text-slate-|radial-gradient\(circle_at_top_left/.test(text), `Expected showcase to avoid generic legacy dark-glass preview tokens. Got: ${truncate(text)}`);
      expect(!/deps:|stack adapters:|mobile:/.test(text), `Expected showcase to hide technical pattern notes from the product-facing view. Got: ${truncate(text)}`);

      const manifest = extractSpecularTruthManifest(text);
      const surfaces = manifest?.surfaces as Array<Record<string, unknown>> | undefined;
      expect(manifest?.sessionId === session.id, `Expected truth manifest to preserve session id. Got: ${JSON.stringify(manifest)}`);
      expect(manifest?.surfaceCount === 1, `Expected truth manifest to count one user-facing surface. Got: ${JSON.stringify(manifest)}`);
      expect(Array.isArray(surfaces) && surfaces[0]?.nodeId === 'ops-dashboard', `Expected truth manifest to include ops-dashboard surface. Got: ${JSON.stringify(manifest)}`);
      expect(surfaces?.[0]?.designProfile === '21st', `Expected truth manifest to preserve 21st design profile. Got: ${JSON.stringify(manifest)}`);
      expect(typeof surfaces?.[0]?.score === 'number', `Expected truth manifest to expose numeric design score. Got: ${JSON.stringify(manifest)}`);
      expect(Array.isArray(surfaces?.[0]?.productDnaPackIds) && (surfaces?.[0]?.productDnaPackIds as unknown[]).length >= 1, `Expected truth manifest to expose Product DNA pack ids. Got: ${JSON.stringify(manifest)}`);
      expect(typeof surfaces?.[0]?.requiredReceiptCount === 'number', `Expected truth manifest to expose Product DNA receipt count. Got: ${JSON.stringify(manifest)}`);
      expect(typeof surfaces?.[0]?.retrievalReceiptId === 'string', `Expected truth manifest to expose Knowledge Bank receipt id. Got: ${JSON.stringify(manifest)}`);
      expect(typeof surfaces?.[0]?.retrievalEvidenceCount === 'number', `Expected truth manifest to expose Knowledge Bank evidence count. Got: ${JSON.stringify(manifest)}`);
    });
  } finally {
    await deleteSession(session.id);
  }
}

async function test_specular_verdict_route_returns_design_verdict_for_saved_session() {
  const session = await createFrontendSession();
  try {
    await withSpecularServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/specular/verdict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, nodeId: 'ops-dashboard' }),
      });
      const text = await response.text();
      const data = safeJson(text) as Record<string, unknown> | null;
      const verdict = data?.designVerdict as Record<string, unknown> | undefined;

      expect(response.status === 200, `Expected specular verdict route to succeed. Got ${response.status}: ${truncate(text)}`);
      expect(typeof verdict?.score === 'number', `Expected verdict score to be numeric. Got: ${truncate(text)}`);
      expect((data?.activeProductDnaContract as Record<string, unknown> | undefined)?.contractVersion === 'active-product-dna-contract@1', `Expected verdict response to include active Product DNA contract. Got: ${truncate(text)}`);
      expect((data?.knowledgeContextBundle as Record<string, unknown> | undefined)?.schemaVersion === 'knowledge-bank@1', `Expected verdict response to include Knowledge Bank context. Got: ${truncate(text)}`);
      expect(verdict?.status === 'passed' || verdict?.status === 'failed', `Expected verdict status to be passed or failed. Got: ${truncate(text)}`);
      expect(Array.isArray(verdict?.evidence), `Expected verdict evidence to be an array. Got: ${truncate(text)}`);
    });
  } finally {
    await deleteSession(session.id);
  }
}

async function test_specular_generate_rejects_malformed_draft_graph() {
  await withSpecularServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/specular/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodeId: 'broken-node',
        draft: {
          name: 'Broken Draft',
          source: 'manual',
          manifesto: 'Broken',
          architecture: 'Broken',
          projectContext: 'Broken',
          graph: {
            nodes: null,
            links: [],
          },
        },
      }),
    });
    const text = await response.text();
    const data = safeJson(text) as { error?: string } | null;

    expect(response.status === 400, `Expected malformed draft graph to be rejected with 400. Got ${response.status}: ${truncate(text)}`);
    expect(typeof data?.error === 'string' && data.error.length > 0, `Expected malformed draft rejection to include an error message. Got: ${truncate(text)}`);
  });
}

async function run() {
  const tests = [
    test_specular_generate_returns_21st_payload_for_saved_session,
    test_specular_generate_accepts_ephemeral_draft_payload,
    test_specular_preview_route_hydrates_saved_session_node,
    test_specular_showcase_route_renders_product_grade_html,
    test_specular_verdict_route_returns_design_verdict_for_saved_session,
    test_specular_generate_rejects_malformed_draft_graph,
  ];

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
