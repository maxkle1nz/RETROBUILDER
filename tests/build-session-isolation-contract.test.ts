#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const app = readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
const buildView = readFileSync(path.join(ROOT, 'src/components/BuildView.tsx'), 'utf8');

function test_app_resets_build_lifecycle_on_session_change() {
  expect(app.includes('previousSessionIdRef'), 'Expected App to track the previous active session id.');
  expect(app.includes('previousSessionIdRef.current === activeSessionId'), 'Expected App to ignore same-session graph updates.');
  expect(app.includes('buildStore.resetBuild()'), 'Expected App to reset the BU1LDER lifecycle on active session changes.');
  expect(
    app.includes('buildStore.initNodeStates(graphData.nodes.map((node) => node.id))'),
    'Expected App to reinitialize node states from the newly active session graph.',
  );
}

function test_app_clears_deleted_remembered_session_on_bootstrap() {
  expect(app.includes('clearSession'), 'Expected App to have access to clearSession for stale remembered sessions.');
  expect(
    app.includes('const rememberedExists = sessions?.some((session) => session.id === remembered) ?? true;'),
    'Expected App to compare the remembered session id against the refreshed session list.',
  );
  expect(
    app.includes('if (!rememberedExists)'),
    'Expected App to branch when a persisted activeSessionId no longer exists server-side.',
  );
  expect(
    app.includes('clearSession();'),
    'Expected App to clear stale activeSessionId instead of repeatedly loading a deleted session.',
  );
}

function test_build_view_clears_stale_lifecycle_for_idle_session_status() {
  expect(buildView.includes('const store = useBuildStore.getState();'), 'Expected BuildView to access the build store before status hydration.');
  expect(buildView.includes('if (!activeSessionId) {'), 'Expected BuildView to handle the no-session state.');
  expect(buildView.includes('if (!shouldHydrateRemoteLifecycle) {'), 'Expected BuildView to branch on idle/no lifecycle status.');
  expect(
    buildView.includes('store.initNodeStates(graphData.nodes.map((n) => n.id))'),
    'Expected BuildView to reset visible build nodes from the current session when OMX status is idle.',
  );
}

function run() {
  const tests = [
    test_app_resets_build_lifecycle_on_session_change,
    test_app_clears_deleted_remembered_session_on_bootstrap,
    test_build_view_clears_stale_lifecycle_for_idle_session_status,
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
