#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const appSource = readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
const consoleSource = readFileSync(path.join(ROOT, 'src/components/BuildConsole.tsx'), 'utf8');
const buildViewSource = readFileSync(path.join(ROOT, 'src/components/BuildView.tsx'), 'utf8');

function test_log_feed_is_capped_after_long_builds() {
  expect(consoleSource.includes('const logRenderLimit = isBuilding ? 240 : 80'), 'Build console should use a smaller post-build log render limit.');
  expect(consoleSource.includes('globalLogs.slice(-logRenderLimit)'), 'Build console should render only the newest log rows.');
  expect(consoleSource.includes('visibleLogs.map'), 'Log feed should map the capped visible log slice, not the full log array.');
}

function test_hidden_logs_are_explained_to_the_user() {
  expect(consoleSource.includes('hiddenLogCount'), 'Build console should track how many log rows are hidden.');
  expect(consoleSource.includes('Showing latest'), 'Build console should explain capped logs instead of silently hiding them.');
}

function test_completion_report_replaces_live_canvas_work() {
  expect(buildViewSource.includes('const showCompletionReport = Boolean(buildResult?.documentation)'), 'Build view should derive a completion-report mode.');
  expect(buildViewSource.includes('{!showCompletionReport ?'), 'Build view should skip the live ReactFlow canvas when the final report is shown.');
  expect(buildViewSource.includes('if (showCompletionReport) return []'), 'Build view should also skip graph node/edge derivation for completed reports.');
  expect(buildViewSource.includes('aria-hidden="true"'), 'Build view should leave only a lightweight backdrop behind the completion report.');
}

function test_builder_layout_adapts_to_compact_windows() {
  expect(buildViewSource.includes('xl:flex-row'), 'Build canvas and console should stack below xl instead of forcing a cramped horizontal split.');
  expect(buildViewSource.includes('xl:w-[300px]'), 'Build console should only force the narrow side rail on wide screens.');
  expect(buildViewSource.includes('border-t border-border-subtle xl:border-l xl:border-t-0'), 'Build console border should adapt when it stacks under the canvas.');
}

function test_terminal_drawer_auto_collapses_after_build_terminal_state() {
  expect(appSource.includes('terminalWasAutoOpenedRef'), 'App shell should remember terminal drawers that were opened automatically for builds.');
  expect(appSource.includes("['succeeded', 'failed', 'stopped'].includes(buildStatus)"), 'App shell should close the auto-opened terminal after terminal build states.');
  expect(appSource.includes('setTerminalOpen(false)'), 'App shell should explicitly collapse the auto-opened terminal after build completion.');
}

function run() {
  const tests = [
    test_log_feed_is_capped_after_long_builds,
    test_hidden_logs_are_explained_to_the_user,
    test_completion_report_replaces_live_canvas_work,
    test_builder_layout_adapts_to_compact_windows,
    test_terminal_drawer_auto_collapses_after_build_terminal_state,
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
