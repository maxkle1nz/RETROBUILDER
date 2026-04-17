import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReactFlowProvider } from '@xyflow/react';
import CyberNode from '../src/components/CyberNode';
import { getLayoutedElements } from '../src/lib/layout';
import type { NodeData } from '../src/lib/api';
import type { Edge, Node } from '@xyflow/react';

function expect(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function createNode(overrides: Partial<NodeData> = {}): NodeData {
  return {
    id: 'auth-boundary',
    label: 'Authentication Boundary',
    description: 'Guards access to privileged surfaces and verifies session trust.',
    status: 'in-progress',
    type: 'security',
    data_contract: 'JWT in → session claims out',
    decision_rationale: 'Keep auth checks centralized at the boundary.',
    acceptance_criteria: ['Reject expired JWT', 'Emit audit event', 'Refresh valid session'],
    error_handling: ['Return 401 on invalid token', 'Fallback to safe logout'],
    priority: 1,
    group: 1,
    researchContext: 'Grounded with RFC references and donor implementations.',
    constructionNotes: 'Use short-lived JWT and server-side revocation list.',
    ...overrides,
  };
}

function renderNodeMarkup(data: NodeData) {
  return renderToStaticMarkup(
    React.createElement(
      ReactFlowProvider,
      null,
      React.createElement(CyberNode as any, { data, selected: false }),
    ),
  );
}

function test_demystifier_card_exposes_compact_metrics_and_footer() {
  const markup = renderNodeMarkup(createNode());

  expect(markup.includes('Demystifier'), 'Expected Demystifier identity rail to appear on the card.');
  expect(markup.includes('Authentication Boundary'), 'Expected module label to render on the card.');
  expect(markup.includes('data-testid="demystifier-metrics"'), 'Expected a dedicated metrics grid container.');
  expect(markup.includes('data-testid="demystifier-metric-ac"'), 'Expected AC metric slot.');
  expect(markup.includes('data-testid="demystifier-metric-eh"'), 'Expected EH metric slot.');
  expect(markup.includes('data-testid="demystifier-metric-ctr"'), 'Expected contract metric slot.');
  expect(markup.includes('data-testid="demystifier-metric-rch"'), 'Expected research metric slot.');
  expect(markup.includes('data-testid="demystifier-footer"'), 'Expected semantic footer to be rendered.');
  expect(!markup.includes('Data Contract</div><div'), 'Expected old full-width data contract strip to be removed.');
  expect(!markup.includes('criteria</span>'), 'Expected old acceptance-criteria strip wording to be removed.');
}

function test_demystifier_card_uses_explicit_status_chip() {
  const markup = renderNodeMarkup(createNode({ status: 'completed' }));

  expect(markup.includes('data-testid="demystifier-status-chip"'), 'Expected explicit status chip container.');
  expect(markup.includes('DONE'), 'Expected completed status to render as DONE chip text.');
}

function test_layout_matches_demystifier_compact_footprint() {
  const nodes: Node[] = [
    {
      id: 'auth-boundary',
      type: 'cyber',
      position: { x: 0, y: 0 },
      data: createNode() as unknown as Record<string, unknown>,
    } as unknown as Node,
    {
      id: 'api-gateway',
      type: 'cyber',
      position: { x: 0, y: 0 },
      data: createNode({
        id: 'api-gateway',
        label: 'API Gateway',
        type: 'backend',
        status: 'pending',
      }) as unknown as Record<string, unknown>,
    } as unknown as Node,
  ];

  const edges: Edge[] = [
    {
      id: 'e-auth-api',
      source: 'auth-boundary',
      target: 'api-gateway',
    } as Edge,
  ];

  const { nodes: layoutedNodes } = getLayoutedElements(nodes, edges, 'TB');
  const gap = Math.abs(layoutedNodes[1].position.y - layoutedNodes[0].position.y);

  expect(gap < 300, `Expected compact vertical gap under Demystifier layout, got ${gap}.`);
}

function test_layout_does_not_leak_dagre_state_between_calls() {
  const firstNodes: Node[] = [
    {
      id: 'auth-boundary',
      type: 'cyber',
      position: { x: 0, y: 0 },
      data: createNode() as unknown as Record<string, unknown>,
    } as unknown as Node,
    {
      id: 'api-gateway',
      type: 'cyber',
      position: { x: 0, y: 0 },
      data: createNode({
        id: 'api-gateway',
        label: 'API Gateway',
        type: 'backend',
        status: 'pending',
      }) as unknown as Record<string, unknown>,
    } as unknown as Node,
  ];

  const firstEdges: Edge[] = [
    {
      id: 'e-auth-api',
      source: 'auth-boundary',
      target: 'api-gateway',
    } as Edge,
  ];

  getLayoutedElements(firstNodes, firstEdges, 'LR');

  const isolatedNode: Node = {
    id: 'solo-module',
    type: 'cyber',
    position: { x: 0, y: 0 },
    data: createNode({
      id: 'solo-module',
      label: 'Solo Module',
      type: 'frontend',
      status: 'pending',
    }) as unknown as Record<string, unknown>,
  } as unknown as Node;

  const { nodes: secondLayoutedNodes } = getLayoutedElements([isolatedNode], [], 'LR');
  const soloX = secondLayoutedNodes[0].position.x;
  const soloY = secondLayoutedNodes[0].position.y;

  expect(soloX === 0, `Expected isolated node x=0 on fresh layout call, got ${soloX}.`);
  expect(soloY === 0, `Expected isolated node y=0 on fresh layout call, got ${soloY}.`);
}

function test_demystifier_status_chip_falls_back_for_unknown_status() {
  const markup = renderNodeMarkup(createNode({ status: 'mystery-status' as NodeData['status'] }));

  expect(markup.includes('data-testid="demystifier-status-chip"'), 'Expected fallback status chip to remain visible.');
  expect(markup.includes('PENDING'), 'Expected unknown status to fall back to PENDING.');
}

function run() {
  const tests = [
    test_demystifier_card_exposes_compact_metrics_and_footer,
    test_demystifier_card_uses_explicit_status_chip,
    test_layout_matches_demystifier_compact_footprint,
    test_layout_does_not_leak_dagre_state_between_calls,
    test_demystifier_status_chip_falls_back_for_unknown_status,
  ];

  let passed = 0;
  for (const test of tests) {
    try {
      test();
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
