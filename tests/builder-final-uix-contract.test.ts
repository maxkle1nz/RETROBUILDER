#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const report = readFileSync(path.join(ROOT, 'src/components/BuildCompletionReport.tsx'), 'utf8');

function test_completion_screen_defaults_to_handoff_summary() {
  for (const label of ['Ready for handoff', 'Product deliverables', 'Next actions', 'Internal module inventory', 'Confidence summary', 'Technical dossier']) {
    expect(report.includes(label), `Build completion report should expose a product-friendly section: ${label}`);
  }

  expect(report.includes('compactText(documentation.summary'), 'Project summary should be compacted before rendering.');
  expect(report.includes('documentation.deliverables'), 'Final report should prefer persisted product deliverables when available.');
  expect(report.includes('function ProductDeliverablesSection'), 'Final report should render product deliverables before internal modules.');
  expect(report.includes('resolveDeliverables'), 'Final report should infer deliverables for older build dossiers.');
  expect(report.includes('documentation.modules.length === 0'), 'Final report should synthesize a root deliverable for older root-only dossiers.');
  expect(report.includes("id: 'workspace'"), 'Root-only fallback deliverable should be stable and explicit.');
  expect(report.includes('primaryCommands = orderedCommands.slice(0, 3)'), 'Command list should prioritize only primary actions in the visible handoff area.');
  expect(report.includes('secondaryCommands = orderedCommands.slice(3)'), 'Secondary commands should be progressively disclosed.');
  expect(report.includes('featuredModules = documentation.modules.slice(0, 4)'), 'Visible module list should be capped before showing expanded inventory.');
  expect(report.includes('Show all commands'), 'Secondary commands should be available behind disclosure.');
  expect(report.includes('Show remaining modules'), 'Remaining modules should be progressively disclosed.');
}

function test_technical_material_is_progressively_disclosed() {
  expect(report.includes('function CompactModuleCard'), 'Module cards should use a compact component.');
  expect(report.includes('function LazyDetails'), 'Heavy completion report sections should use a lazy disclosure primitive.');
  expect(report.includes('hasOpened ? children : null'), 'Collapsed disclosure content should not be mounted until the user opens it.');
  expect(report.includes('<LazyDetails'), 'Each module should be expandable instead of always showing full evidence.');
  expect(report.includes('Runtime notes'), 'Runtime notes should remain available behind disclosure.');
  expect(report.includes('Full wiki markdown'), 'Full wiki markdown should remain available behind disclosure.');
  expect(report.includes('max-h-[420px]') && report.includes('max-h-56'), 'Long technical blocks should be height-limited and scrollable.');
}

function test_completion_report_does_not_default_mount_heavy_payloads() {
  const lazyDisclosureCount = (report.match(/<LazyDetails/g) || []).length;
  expect(lazyDisclosureCount >= 6, 'Large module, wiki, verify and findings payloads should be protected by lazy disclosures.');
  expect(!report.includes('<details className="group rounded-2xl'), 'Module evidence should not use native eager details anymore.');
  expect(report.includes('remainingModules.map'), 'Remaining modules should still be available when expanded.');
}

function test_legacy_dump_labels_are_not_default_sections() {
  for (const oldLabel of ['How To Use', 'Module Map', 'Generated Wiki', 'Runtime Notes']) {
    expect(!report.includes(oldLabel), `Legacy always-visible section label should not return: ${oldLabel}`);
  }
}

function run() {
  const tests = [
    test_completion_screen_defaults_to_handoff_summary,
    test_technical_material_is_progressively_disclosed,
    test_completion_report_does_not_default_mount_heavy_payloads,
    test_legacy_dump_labels_are_not_default_sections,
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
