#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const app = readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');

function test_panel_toggles_are_edge_handles_not_toolbar_overlays() {
  expect(
    !app.includes('absolute top-2 left-2 z-50'),
    'Left panel toggle must not sit in the top-left canvas toolbar lane.',
  );
  expect(
    !app.includes('absolute top-2 right-2 z-50'),
    'Right panel toggle must not sit in the top-right canvas toolbar lane.',
  );
  expect(
    app.includes('absolute left-0 top-1/2 z-50 -translate-y-1/2'),
    'Left panel toggle should be a centered edge handle.',
  );
  expect(
    app.includes('absolute right-0 top-1/2 z-50 -translate-y-1/2'),
    'Right panel toggle should be a centered edge handle.',
  );
}

function test_panel_toggles_expose_directional_open_close_icons() {
  expect(app.includes('PanelLeftOpen'), 'Expected left panel open icon import/rendering.');
  expect(app.includes('PanelLeftClose'), 'Expected left panel close icon import/rendering.');
  expect(app.includes('PanelRightOpen'), 'Expected right panel open icon import/rendering.');
  expect(app.includes('PanelRightClose'), 'Expected right panel close icon import/rendering.');
}

function run() {
  const tests = [
    test_panel_toggles_are_edge_handles_not_toolbar_overlays,
    test_panel_toggles_expose_directional_open_close_icons,
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
