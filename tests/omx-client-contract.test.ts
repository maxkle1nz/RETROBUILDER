#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const ROOT = path.resolve(import.meta.dirname, '..');

function read(relPath: string) {
  return readFileSync(path.join(ROOT, relPath), 'utf8');
}

function test_api_client_exposes_explicit_omx_build_lifecycle_helpers() {
  const source = read('src/lib/api.ts');

  expect(
    source.includes('startOmxBuild'),
    'Expected src/lib/api.ts to expose a startOmxBuild helper for the explicit OMX build lifecycle.',
  );
  expect(
    source.includes('/api/omx/build'),
    'Expected the OMX API client surface to target /api/omx/build.',
  );
  expect(
    source.includes('fetchOmxStatus'),
    'Expected src/lib/api.ts to expose a fetchOmxStatus helper for build polling and recovery.',
  );
  expect(
    source.includes('/api/omx/status/${sessionId}'),
    'Expected the OMX API client surface to target /api/omx/status/${sessionId}.',
  );
  expect(
    source.includes('stopOmxBuild'),
    'Expected src/lib/api.ts to expose a stopOmxBuild helper for build interruption.',
  );
  expect(
    source.includes('/api/omx/stop/${sessionId}'),
    'Expected the OMX API client surface to target /api/omx/stop/${sessionId}.',
  );
  expect(
    source.includes('OmxBuildBlockedError'),
    'Expected api.ts to expose a dedicated OmxBuildBlockedError for design-gate build blocks.',
  );
  expect(
    source.includes('retryOmxTask'),
    'Expected src/lib/api.ts to expose a retryOmxTask helper for merge/task recovery.',
  );
  expect(
    source.includes('/api/omx/retry/${sessionId}'),
    'Expected the OMX API client surface to target /api/omx/retry/${sessionId}.',
  );
  expect(
    source.includes('reassignOmxTaskOwnership'),
    'Expected src/lib/api.ts to expose a reassignOmxTaskOwnership helper for owner arbitration.',
  );
  expect(
    source.includes('/api/omx/reassign/${sessionId}'),
    'Expected the OMX API client surface to target /api/omx/reassign/${sessionId}.',
  );
}

async function test_right_panel_persists_and_hydrates_before_real_omx_build_activation() {
  const source = read('src/components/RightPanel.tsx');

  const saveIdx = source.indexOf('const persistedSession = await saveSession(activeSessionId');
  const hydrateIdx = source.indexOf('hydrateSession(persistedSession)');
  const startIdx = source.indexOf('await startOmxBuild(persistedSession.id, runtimeDraft)');
  const stoppedGuardIdx = source.indexOf("if (build.status === 'stopped')");
  const hydrateBuildIdx = source.indexOf('hydrateBuildLifecycle(build)');
  const builderIdx = source.indexOf("setAppMode('builder')");

  expect(
    source.includes('startOmxBuild'),
    'Expected RightPanel to import and use startOmxBuild for the real OMX runtime.',
  );
  expect(
    source.includes('saveSession'),
    'Expected RightPanel export flow to persist the active session before starting the real OMX build.',
  );
  expect(
    source.includes('hydrateSession'),
    'Expected RightPanel export flow to hydrate the persisted session before entering builder mode.',
  );
  expect(
    source.includes('runtimeDraft'),
    'Expected RightPanel real OMX start flow to derive a runtimeDraft aligned with the persisted session payload.',
  );
  expect(
    saveIdx !== -1,
    'Expected RightPanel export flow to persist the session before activating the real OMX build.',
  );
  expect(
    hydrateIdx !== -1,
    'Expected RightPanel export flow to hydrate the persisted session before activating builder mode.',
  );
  expect(
    startIdx !== -1,
    'Expected RightPanel export flow to explicitly await startOmxBuild(persistedSession.id, runtimeDraft) before activating builder mode.',
  );
  expect(
    hydrateBuildIdx !== -1,
    'Expected RightPanel export flow to hydrate the local build lifecycle from the remote build status before entering builder mode.',
  );
  expect(
    stoppedGuardIdx !== -1,
    'Expected RightPanel export flow to reject stale stopped-build reuse so the UI does not claim a fresh build started when stop cleanup is still settling.',
  );
  expect(
    builderIdx !== -1,
    'Expected RightPanel export flow to switch the app into builder mode after remote build start succeeds.',
  );
  expect(
    saveIdx < hydrateIdx && hydrateIdx < startIdx && startIdx < stoppedGuardIdx && stoppedGuardIdx < hydrateBuildIdx && hydrateBuildIdx < builderIdx,
    'Expected RightPanel to persist, hydrate the session, reject stale stopped reuse, hydrate the remote build lifecycle, and only then switch the app into builder mode.',
  );
}

function test_kompletus_report_starts_real_omx_build_before_builder_mode_activation() {
  const source = read('src/components/KompletusReport.tsx');

  const startIdx = source.indexOf('await startOmxBuild(');
  const stoppedGuardIdx = source.indexOf("if (build.status === 'stopped')");
  const builderIdx = source.indexOf("setAppMode('builder')");

  expect(
    source.includes('startOmxBuild'),
    'Expected KompletusReport to use startOmxBuild for the real OMX runtime handoff.',
  );
  expect(
    startIdx !== -1,
    'Expected KompletusReport Accept & Continue flow to await startOmxBuild(...) before activating builder mode.',
  );
  expect(
    stoppedGuardIdx !== -1,
    'Expected KompletusReport handoff to reject stale stopped-build reuse so the UI does not claim a fresh build started while stop cleanup is still settling.',
  );
  expect(
    builderIdx !== -1,
    'Expected KompletusReport to switch the app into builder mode after remote build start succeeds.',
  );
  expect(
    startIdx < stoppedGuardIdx && stoppedGuardIdx < builderIdx,
    'Expected KompletusReport to reject stale stopped reuse before switching the app into builder mode.',
  );
  expect(
    source.includes('error instanceof OmxBuildBlockedError'),
    'Expected KompletusReport to handle structured design-gate build blocks.',
  );
  expect(
    source.includes("setActiveView('specular')"),
    'Expected KompletusReport to route users back to the SPECULAR view when the design gate blocks OMX.',
  );
  expect(
    source.includes('failingNodeIds?.[0] || error.design?.affectedNodeIds?.[0]'),
    'Expected KompletusReport to prefer the actual failing node when design gate routing occurs.',
  );
}

function test_right_panel_routes_design_gate_blocks_back_to_uix_editor() {
  const source = read('src/components/RightPanel.tsx');

  expect(
    source.includes('error instanceof OmxBuildBlockedError'),
    'Expected RightPanel to handle structured design-gate build blocks.',
  );
  expect(
    source.includes("setTab('uix')"),
    'Expected RightPanel to switch into the UIX tab when OMX build is blocked by design.',
  );
  expect(
    source.includes('failingNodeIds?.[0] || error.design?.affectedNodeIds?.[0]'),
    'Expected RightPanel to prefer the actual failing node when routing back to UIX after a design-gate block.',
  );
  expect(
    source.includes('inspectorNodeId: blockedNodeId'),
    'Expected RightPanel to atomically open the SSOT node editor for the first design-blocked node.',
  );
}

function test_build_view_hydrates_remote_omx_status_for_builder_reentry() {
  const source = read('src/components/BuildView.tsx');

  expect(
    source.includes('fetchOmxStatus'),
    'Expected BuildView to fetch remote OMX status so builder mode can recover persisted OMX lifecycle state.',
  );
  expect(
    source.includes('hydrateBuildLifecycle'),
    'Expected BuildView to hydrate the client build lifecycle from remote OMX status before rendering builder recovery state.',
  );
  expect(
    source.includes("remote.status === 'stopping'"),
    'Expected BuildView builder reentry flow to preserve stopping state instead of collapsing it into generic idle/running behavior.',
  );
  expect(
    source.includes("remote.status === 'stopped'"),
    'Expected BuildView builder reentry flow to preserve stopped state instead of discarding it during recovery.',
  );
  expect(
    source.includes("remote.status === 'succeeded'"),
    'Expected BuildView builder reentry flow to preserve succeeded state instead of losing terminal success on refresh/re-entry.',
  );
  expect(
    source.includes("remote.status === 'failed'"),
    'Expected BuildView builder reentry flow to preserve failed state instead of losing terminal failure on refresh/re-entry.',
  );
  expect(
    source.includes('resumeOmxBuild'),
    'Expected BuildView to expose a first-class resume action instead of relying only on chat regexes.',
  );
  expect(
    source.includes('resumeAvailable = useBuildStore'),
    'Expected BuildView to surface resume availability from persisted OMX status truth.',
  );
  expect(
    source.includes('fetchOmxHistory'),
    'Expected BuildView to fetch persisted OMX event history on builder reentry.',
  );
  expect(
    source.includes('processBuildEvent'),
    'Expected BuildView reentry flow to replay persisted OMX events into the local store.',
  );
  expect(
    source.includes('Resume ${resumeReason'),
    'Expected BuildView resume CTA to explain why the build is resumable.',
  );
}

function test_build_store_uses_persisted_terminal_recovery_state_without_placeholder_metrics() {
  const source = read('src/store/useBuildStore.ts');

  expect(
    source.includes('remote.result'),
    'Expected build-store recovery to use persisted remote.result metrics during OMX builder reentry.',
  );
  expect(
    source.includes('remote.terminalMessage'),
    'Expected build-store recovery to surface persisted terminalMessage during OMX builder reentry.',
  );
  expect(
    !source.includes("state.buildResult ?? { totalFiles: 0, totalLines: 0, elapsedMs: 0"),
    'Expected build-store recovery to stop fabricating 0-file/0-line placeholder success metrics on reentry.',
  );
}

function test_omx_stream_falls_back_to_remote_status_when_terminal_sse_is_missed() {
  const source = read('src/hooks/useOMXStream.ts');

  expect(
    source.includes('fetchOmxStatus'),
    'Expected OMX SSE hook to query remote status when stream attachment/reconnect loses the terminal event.',
  );
  expect(
    source.includes('hydrateBuildLifecycle'),
    'Expected OMX SSE hook to hydrate terminal remote status back into the local build store when SSE terminal delivery is missed.',
  );
  expect(
    source.includes("remote.status === 'queued' || remote.status === 'running' || remote.status === 'stopping'"),
    'Expected OMX SSE recovery path to reconnect only while the remote runtime is still attachable.',
  );
  expect(
    source.includes('stopBuild(remote.status)'),
    'Expected OMX SSE recovery path to stop the local live state when the remote runtime is already terminal.',
  );
}

function run() {
  const tests = [
    test_api_client_exposes_explicit_omx_build_lifecycle_helpers,
    test_right_panel_persists_and_hydrates_before_real_omx_build_activation,
    test_kompletus_report_starts_real_omx_build_before_builder_mode_activation,
    test_right_panel_routes_design_gate_blocks_back_to_uix_editor,
    test_build_view_hydrates_remote_omx_status_for_builder_reentry,
    test_build_store_uses_persisted_terminal_recovery_state_without_placeholder_metrics,
    test_omx_stream_falls_back_to_remote_status_when_terminal_sse_is_missed,
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
