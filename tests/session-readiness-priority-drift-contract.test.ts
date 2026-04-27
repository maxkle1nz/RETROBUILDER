#!/usr/bin/env tsx
import { analyzeSessionReadiness } from '../src/server/session-analysis.ts';
import { createSession, deleteSession } from '../src/server/session-store.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function runPriorityDriftOnlyScenario() {
  const session = await createSession({
    name: `Readiness Priority Drift ${Date.now()}`,
    source: 'manual',
    manifesto: 'Priority drift alone should not downgrade export readiness.',
    architecture: 'Two fully specified modules with manually assigned priorities that differ from computed topology.',
    projectContext: 'priority drift readiness contract',
    graph: {
      nodes: [
        {
          id: 'catalog',
          label: 'Catalog',
          description: 'Catalog module.',
          status: 'pending',
          type: 'backend',
          group: 1,
          priority: 4,
          data_contract: 'Input catalog payload. Output normalized catalog model.',
          acceptance_criteria: ['Stores catalog items.', 'Exposes catalog lookups.'],
          error_handling: ['Returns structured validation errors.'],
        },
        {
          id: 'storefront',
          label: 'Storefront',
          description: 'Storefront module.',
          status: 'pending',
          type: 'frontend',
          group: 1,
          priority: 7,
          data_contract: 'Input catalog data. Output mobile-first storefront state.',
          acceptance_criteria: ['Shows product cards.', 'Shows purchase CTA.'],
          error_handling: ['Shows fallback empty state.'],
        },
      ],
      links: [],
    },
  });

  try {
    const report = await analyzeSessionReadiness(session);
    expect(report.exportAllowed === true, `Expected export to remain allowed. Got: ${JSON.stringify(report)}`);
    expect(report.status === 'ready', `Expected priority drift alone to keep readiness ready. Got: ${JSON.stringify(report)}`);
    expect(report.warnings.some((issue) => issue.code === 'PRIORITY_DRIFT'), `Expected PRIORITY_DRIFT warning to remain visible. Got: ${JSON.stringify(report)}`);
  } finally {
    await deleteSession(session.id).catch(() => {});
  }
}

async function runActionableWarningScenario() {
  const session = await createSession({
    name: `Readiness Actionable Warning ${Date.now()}`,
    source: 'manual',
    manifesto: 'Actionable warnings should still downgrade readiness.',
    architecture: 'A fully exportable module that is missing its data contract.',
    projectContext: 'actionable warning readiness contract',
    graph: {
      nodes: [
        {
          id: 'billing',
          label: 'Billing',
          description: 'Billing module.',
          status: 'pending',
          type: 'backend',
          group: 1,
          priority: 9,
          acceptance_criteria: ['Creates invoices.', 'Tracks payment state.'],
          error_handling: ['Returns payment failure reason.'],
        },
      ],
      links: [],
    },
  });

  try {
    const report = await analyzeSessionReadiness(session);
    expect(report.exportAllowed === true, `Expected export to remain allowed. Got: ${JSON.stringify(report)}`);
    expect(report.status === 'needs_review', `Expected actionable warnings to keep readiness in needs_review. Got: ${JSON.stringify(report)}`);
    expect(report.warnings.some((issue) => issue.code === 'MISSING_DATA_CONTRACT'), `Expected missing data contract warning. Got: ${JSON.stringify(report)}`);
  } finally {
    await deleteSession(session.id).catch(() => {});
  }
}

await runPriorityDriftOnlyScenario();
await runActionableWarningScenario();

console.log('PASS session readiness priority drift contract');
