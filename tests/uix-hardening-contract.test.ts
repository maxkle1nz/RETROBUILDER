#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const app = readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
const graphView = readFileSync(path.join(ROOT, 'src/components/GraphView.tsx'), 'utf8');
const sessionLauncher = readFileSync(path.join(ROOT, 'src/components/SessionLauncher.tsx'), 'utf8');
const envConfigModal = readFileSync(path.join(ROOT, 'src/components/EnvConfigModal.tsx'), 'utf8');
const dialogFocus = readFileSync(path.join(ROOT, 'src/lib/useDialogFocus.ts'), 'utf8');
const css = readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');

function test_dialogs_have_modal_semantics_and_focus_management() {
  for (const [name, source] of [
    ['SessionLauncher', sessionLauncher],
    ['EnvConfigModal', envConfigModal],
  ] as const) {
    expect(source.includes('useDialogFocus'), `${name} should use the shared dialog focus trap.`);
    expect(source.includes('role="dialog"'), `${name} should expose role="dialog".`);
    expect(source.includes('aria-modal="true"'), `${name} should expose aria-modal="true".`);
    expect(source.includes('aria-labelledby='), `${name} should point to a visible dialog title.`);
    expect(source.includes('aria-describedby='), `${name} should point to dialog description copy.`);
    expect(source.includes('tabIndex={-1}'), `${name} should make the dialog container programmatically focusable.`);
  }

  expect(dialogFocus.includes("event.key !== 'Tab'"), 'Dialog focus helper should trap Tab inside the modal.');
  expect(dialogFocus.includes("event.key === 'Escape'"), 'Dialog focus helper should close eligible modals on Escape.');
  expect(dialogFocus.includes('previousFocusRef.current?.focus'), 'Dialog focus helper should return focus to the opener.');
}

function test_icon_controls_have_accessible_names() {
  const expectedLabels = [
    'Open session launcher',
    'Open project keys and provider config',
    'Switch to Architect mode',
    'Switch to M1ND mode',
    'Switch to BU1LDER mode',
    'Toggle OMX Terminal',
    'Save active session',
    'Show Checklist',
    'Show Sidebar',
  ];
  for (const label of expectedLabels) {
    expect(app.includes(label), `App shell should expose accessible name: ${label}`);
  }

  for (const label of ['Undo graph change', 'Redo graph change', 'Center graph', 'Auto-organize graph']) {
    expect(graphView.includes(`aria-label="${label}"`), `Graph toolbar should expose accessible name: ${label}`);
  }
}

function test_motion_and_mobile_hardening_contracts() {
  expect(css.includes('@media (prefers-reduced-motion: reduce)'), 'Global CSS should honor reduced-motion preference.');
  expect(css.includes('.react-flow__edge.animated .react-flow__edge-path'), 'Reduced-motion CSS should cover animated graph edges.');
  expect(app.includes('flex-wrap') && app.includes('sm:flex-nowrap'), 'Header should wrap safely on narrow viewports.');
  expect(envConfigModal.includes('max-h-[90vh]') && envConfigModal.includes('overflow-y-auto'), 'Env modal should scroll inside small viewports.');
}

function run() {
  const tests = [
    test_dialogs_have_modal_semantics_and_focus_management,
    test_icon_controls_have_accessible_names,
    test_motion_and_mobile_hardening_contracts,
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
