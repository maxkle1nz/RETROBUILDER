#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const completionReport = readFileSync(path.join(ROOT, 'src/components/BuildCompletionReport.tsx'), 'utf8');
const buildView = readFileSync(path.join(ROOT, 'src/components/BuildView.tsx'), 'utf8');
const api = readFileSync(path.join(ROOT, 'src/lib/api.ts'), 'utf8');
const routes = readFileSync(path.join(ROOT, 'src/server/routes/omx.ts'), 'utf8');
const docs = readFileSync(path.join(ROOT, 'src/server/omx-build-docs.ts'), 'utf8');
const buildStore = readFileSync(path.join(ROOT, 'src/store/useBuildStore.ts'), 'utf8');

function run() {
  expect(docs.includes('interface OmxBuildLaunchPlan'), 'Expected build docs to define persisted launch-plan metadata.');
  expect(docs.includes('interface OmxRunnableManifest'), 'Expected build docs to define runnable-manifest metadata.');
  expect(docs.includes('GENERATED_RUNNABLE_MANIFEST_PATH'), 'Expected build docs to use a stable generated runnable manifest path.');
  expect(docs.includes('buildLaunchPlan'), 'Expected build docs to synthesize a stack-aware launch plan.');
  expect(docs.includes('buildRunnableManifest'), 'Expected build docs to synthesize a runnable manifest from the active workspace.');
  expect(docs.includes('suggestedPreviewPort'), 'Expected launch plan to avoid colliding with the active Retrobuilder port.');
  expect(docs.includes('collectStackMarkers'), 'Expected build docs to inspect root stack markers before selecting launch commands.');
  expect(docs.includes('writeGeneratedLaunchScript'), 'Expected build docs to persist a runnable launch script artifact.');
  expect(docs.includes('writeRunnableManifest'), 'Expected build docs to persist a runnable manifest artifact.');
  expect(docs.includes('.omx/run-project.sh'), 'Expected build docs to use a stable generated launch script path.');
  expect(docs.includes('.omx/runnable-manifest.json'), 'Expected build docs to use a stable generated runnable manifest path.');
  expect(docs.includes('copyPasteScript'), 'Expected launch plan to persist a ready-to-run script.');
  expect(docs.includes('buildCommand?: string'), 'Expected launch plan metadata to separate build-only commands from runnable handoff commands.');
  expect(docs.includes("const runnableScriptName = rootScripts.start"), 'Expected launch plan to prefer only long-running start/dev scripts as runtime commands.');
  expect(docs.includes("!launchPlanIsRunnable(launchPlan) ? [launchPlan.buildCommand]"), 'Expected generated launch script to avoid treating build-only projects as runnable previews.');
  expect(docs.includes('buildDeliverables'), 'Expected build docs to synthesize product deliverables from the active workspace shape.');
  expect(docs.includes('## Product Deliverables'), 'Expected generated docs to lead with product deliverables.');
  expect(docs.includes('## Internal Modules'), 'Expected generated README to separate internal construction modules from product handoff.');
  expect(docs.includes('## Run And Validate'), 'Expected generated README to include launch and validation instructions.');
  expect(docs.includes('## Launch Plan'), 'Expected generated wiki to include launch and validation instructions.');

  expect(api.includes('export interface OmxBuildLaunchPlan'), 'Expected frontend API types to expose launch-plan metadata.');
  expect(api.includes('export interface OmxRunnableManifest'), 'Expected frontend API types to expose runnable-manifest metadata.');
  expect(api.includes('export interface OmxBuildDocumentationDeliverable'), 'Expected frontend API types to expose product deliverable metadata.');
  expect(api.includes('deliverables?: OmxBuildDocumentationDeliverable[]'), 'Expected build documentation API type to include backward-compatible deliverables metadata.');
  expect(api.includes('launchScriptPath?: string'), 'Expected frontend API types to expose the generated launch script path.');
  expect(api.includes('buildCommand?: string'), 'Expected frontend API types to expose build-only commands separately from run commands.');
  expect(api.includes('launchPlan?: OmxBuildLaunchPlan'), 'Expected build documentation API type to include backward-compatible launchPlan metadata.');
  expect(api.includes('runnableManifest?: OmxRunnableManifest'), 'Expected build documentation API type to include runnableManifest metadata.');
  expect(api.includes('openOmxProject'), 'Expected frontend API to expose an open-project action.');
  expect(api.includes('/api/omx/open-project/'), 'Expected open-project action to target the OMX route.');

  expect(buildStore.includes('runnableManifest?: OmxRunnableManifest'), 'Expected build store events/results to carry runnable manifests.');
  expect(buildStore.includes('remote.result.runnableManifest ?? remote.result.documentation?.runnableManifest'), 'Expected build store hydration to prefer result runnableManifest with documentation fallback.');
  expect(buildStore.includes('event.runnableManifest ?? event.documentation?.runnableManifest'), 'Expected build-complete events to preserve runnableManifest metadata.');

  expect(routes.includes("router.post('/api/omx/open-project/:sessionId'"), 'Expected OMX routes to expose a local open-project endpoint.');
  expect(routes.includes('workspaceInsideRuntime'), 'Expected open-project endpoint to constrain paths to the session runtime.');
  expect(routes.includes('getRuntimeDirectory'), 'Expected open-project endpoint to validate against the Retrobuilder runtime root.');
  expect(routes.includes('realpath'), 'Expected open-project containment to use canonical paths to reject symlink escapes.');
  expect(routes.includes('lstat'), 'Expected open-project containment to reject symlink workspaces before opening.');
  expect(routes.includes('await workspaceInsideRuntime'), 'Expected open-project endpoint to await async canonical containment checks.');
  expect(routes.includes('await openFolder(workspacePath)'), 'Expected open-project endpoint to open the active build workspace only after the OS opener spawns.');

  expect(completionReport.includes('function LaunchPlanPanel'), 'Expected final build screen to render a launch panel.');
  expect(completionReport.includes('launchPlanFromRunnableManifest'), 'Expected final build screen to prefer runnableManifest over inferred launch metadata.');
  expect(completionReport.includes('function ProductDeliverablesSection'), 'Expected final build screen to render a user-facing product deliverables section.');
  expect(completionReport.includes('resolveLaunchPlan'), 'Expected final build screen to infer launch metadata for older persisted builds.');
  expect(completionReport.includes('resolveDeliverables'), 'Expected final build screen to infer deliverables for older persisted builds.');
  expect(completionReport.includes('launchPlanIsRunnable'), 'Expected final build screen to avoid presenting build-only fallbacks as runnable deliverables.');
  expect(completionReport.includes('Handoff needs review'), 'Expected final build screen to surface docs-gate warning states in the hero status.');
  expect(completionReport.includes('Open project'), 'Expected final build screen to include an Open Project button.');
  expect(completionReport.includes('Open preview'), 'Expected final build screen to include a clickable preview link.');
  expect(completionReport.includes('Ready-to-run script'), 'Expected final build screen to surface the generated run script.');
  expect(completionReport.includes('Runnable manifest:'), 'Expected final build screen to identify the runnable manifest source.');
  expect(completionReport.includes('launchPlan.launchScriptPath'), 'Expected final build screen to show the generated launch script path when present.');
  expect(completionReport.includes('Health route'), 'Expected final build screen to expose health validation.');
  expect(completionReport.includes('openOmxProject(sessionId)'), 'Expected final build screen to call the safe open-project API.');
  expect(buildView.includes('sessionId={activeSessionId}'), 'Expected BuildView to pass the active session id to the final report.');
  expect(buildView.includes('buildResult.runnableManifest && !buildResult.documentation.runnableManifest'), 'Expected BuildView to backfill documentation with top-level runnable manifests.');

  console.log('PASS build completion launch contract');
}

run();
