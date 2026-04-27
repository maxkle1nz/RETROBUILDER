#!/usr/bin/env tsx
import express from 'express';
import {
  classifyNonJsonAIResponse,
  consolidatePresentationFrontendNodes,
  hardenGraphForDelivery,
} from '../src/server/ai-workflows.ts';
import { createAiRouter } from '../src/server/routes/ai.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use(createAiRouter());
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

async function run() {
  const hardened = hardenGraphForDelivery({
    nodes: [
      {
        id: 'db',
        label: 'Database',
        type: 'database',
        status: 'pending',
        description: 'Stores system data.',
        data_contract: '',
        decision_rationale: 'Persistence is required.',
        acceptance_criteria: [],
        error_handling: [],
        priority: 1,
        group: 1,
      },
      {
        id: 'jobs',
        label: 'Jobs',
        type: 'backend',
        status: 'pending',
        description: 'Runs background tasks.',
        data_contract: '',
        decision_rationale: 'Async work is required.',
        acceptance_criteria: [],
        error_handling: [],
      } as any,
    ],
    links: [{ source: 'db', target: 'jobs', label: 'feeds jobs' }],
  });

  expect(hardened.nodes.every((node) => Number.isFinite((node as any).priority) && (node as any).priority > 0), 'Expected all hardened nodes to have numeric priority.');
  expect(hardened.nodes.every((node) => Number.isFinite((node as any).group) && (node as any).group > 0), 'Expected all hardened nodes to have numeric group.');
  expect((hardened.nodes.find((node) => node.id === 'jobs') as any)?.priority === 2, 'Expected missing priority to be inferred from inbound dependency.');

  const consolidatedFrontend = consolidatePresentationFrontendNodes({
    nodes: [
      {
        id: 'hero-section',
        label: 'Hero Section',
        type: 'frontend',
        status: 'pending',
        description: 'Top landing page section with the first call to action.',
        data_contract: 'Input: landing content -> Output: hero copy and CTA',
        decision_rationale: 'The opening section frames the product.',
        acceptance_criteria: ['Hero headline appears above the fold', 'CTA button starts checkout'],
        error_handling: ['Missing hero copy renders a fallback headline', 'CTA failure shows retry guidance'],
        priority: 1,
        group: 1,
      },
      {
        id: 'pricing-section',
        label: 'Pricing Section',
        type: 'frontend',
        status: 'pending',
        description: 'Pricing cards for the product tiers.',
        data_contract: 'Input: plans -> Output: pricing cards',
        decision_rationale: 'The page needs clear pricing.',
        acceptance_criteria: ['Pricing tiers render with monthly amounts', 'Featured plan is visually distinct'],
        error_handling: ['Missing pricing data renders contact sales fallback', 'Invalid plan data is ignored'],
        priority: 2,
        group: 1,
      },
      {
        id: 'final-cta',
        label: 'Final CTA',
        type: 'frontend',
        status: 'pending',
        description: 'Final conversion prompt at the bottom of the page.',
        data_contract: 'Input: CTA content -> Output: final action block',
        decision_rationale: 'The page closes with a conversion action.',
        acceptance_criteria: ['Final CTA repeats the primary action', 'CTA is keyboard accessible'],
        error_handling: ['Missing CTA uses the default primary action', 'Action failure keeps the user on-page'],
        priority: 3,
        group: 1,
      },
      {
        id: 'payment-checkout',
        label: 'Payment Checkout',
        type: 'external',
        status: 'pending',
        description: 'Checkout provider integration.',
        data_contract: 'Input: plan selection -> Output: checkout session',
        decision_rationale: 'Payments are delegated to a provider.',
        acceptance_criteria: ['Valid plan creates a checkout session', 'Provider reference is stored'],
        error_handling: ['Provider timeout returns retry state', 'Invalid plan is rejected'],
        priority: 4,
        group: 5,
      },
    ],
    links: [
      { source: 'hero-section', target: 'pricing-section', label: 'scroll flow' },
      { source: 'pricing-section', target: 'final-cta', label: 'conversion flow' },
      { source: 'final-cta', target: 'payment-checkout', label: 'starts checkout' },
    ],
  });

  const frontendNodes = consolidatedFrontend.nodes.filter((node) => node.type === 'frontend');
  expect(frontendNodes.length === 1, `Expected visual frontend sections to become one app node, got ${frontendNodes.length}`);
  expect(frontendNodes[0].id === 'product-web-app', `Expected generated app id product-web-app, got ${frontendNodes[0].id}`);
  expect(
    !consolidatedFrontend.nodes.some((node) => ['hero-section', 'pricing-section', 'final-cta'].includes(node.id)),
    'Expected visual section nodes to be removed after consolidation.',
  );
  expect(
    frontendNodes[0].acceptance_criteria.some((criterion) => criterion.includes('one coherent responsive product flow')),
    'Expected merged app node to preserve the one-product-flow contract.',
  );
  expect(
    consolidatedFrontend.links.some((link) => link.source === 'product-web-app' && link.target === 'payment-checkout'),
    'Expected outgoing section links to be redirected through the merged app node.',
  );
  expect(
    consolidatedFrontend.links.every((link) => link.source !== link.target),
    'Expected consolidation to remove self-loop section links.',
  );

  const bridgeFallbackError = classifyNonJsonAIResponse(
    'THEBRIDGE returned a resilient fallback summary because Codex execution was unavailable. codex exec request timed out after 12 seconds',
  ) as any;

  expect(bridgeFallbackError, 'Expected THE BRIDGE fallback summary to be classified as a provider runtime error.');
  expect(bridgeFallbackError.statusCode === 504, `Expected timeout fallback to return 504, got ${bridgeFallbackError.statusCode}`);
  expect(bridgeFallbackError.code === 'BRIDGE_CODEX_TIMEOUT', `Expected BRIDGE_CODEX_TIMEOUT, got ${bridgeFallbackError.code}`);
  expect(
    bridgeFallbackError.message.includes('did not return structured JSON'),
    'Expected provider runtime error to explain the JSON generation failure.',
  );

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ai/generateGraphStructure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '08' }),
    });
    const payload = await response.json() as { error?: string; code?: string };

    expect(response.status === 422, `Expected non-actionable prompt to return 422, got ${response.status}`);
    expect(payload.code === 'NON_ACTIONABLE_PROMPT', `Expected NON_ACTIONABLE_PROMPT code, got ${payload.code}`);
    expect(payload.error?.includes('not enough context'), 'Expected error to explain the missing project context.');
  });

  console.log('PASS generate graph prompt validation contract');
}

run().catch((error) => {
  console.error('FAIL generate graph prompt validation contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
