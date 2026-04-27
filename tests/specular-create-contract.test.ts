#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildSpecularCreatePayload } from '../src/server/specular-create/specular-service.ts';

function expect(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const ROOT = path.resolve(import.meta.dirname, '..');

function read(relPath: string) {
  return readFileSync(path.join(ROOT, relPath), 'utf8');
}

function between(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start === -1 || end === -1) {
    throw new Error(`Unable to extract source between ${startMarker} and ${endMarker}`);
  }
  return source.slice(start, end);
}

function test_api_exposes_specular_create_contract() {
  const source = read('src/lib/api.ts');

  expect(source.includes('generateSpecularPreview'), 'Expected api.ts to expose generateSpecularPreview.');
  expect(source.includes("/api/specular/generate"), 'Expected api.ts to target /api/specular/generate.');
  expect(source.includes('evaluateSpecularPreview'), 'Expected api.ts to expose evaluateSpecularPreview.');
  expect(source.includes("/api/specular/verdict"), 'Expected api.ts to target /api/specular/verdict.');
  expect(source.includes('fetchSpecularPreview'), 'Expected api.ts to expose fetchSpecularPreview.');
  expect(source.includes('/api/specular/preview/${sessionId}/${nodeId}'), 'Expected api.ts to target /api/specular/preview/${sessionId}/${nodeId}.');
  expect(source.includes('KnowledgeContextBundle'), 'Expected api.ts to expose the Knowledge Bank context contract.');
  expect(source.includes('knowledgeContextBundle: KnowledgeContextBundle;'), 'Expected SpecularCreateResponse to include Knowledge Bank context.');
}

function test_node_inspector_hosts_uix_editor() {
  const source = read('src/components/NodeInspector.tsx');

  expect(source.includes("type InspectorTab = 'core' | 'spec' | 'rationale' | 'grounding' | 'uix' | 'connections';"), 'Expected NodeInspector to add a dedicated UIX tab.');
  expect(source.includes('SpecularCreateEditor'), 'Expected NodeInspector to import and render SpecularCreateEditor.');
  expect(source.includes("{ id: 'uix'"), 'Expected NodeInspector tab registry to include the UIX tab.');
}

function test_right_panel_stops_duplicating_grounding_editor_and_surfaces_uix_summary() {
  const source = read('src/components/RightPanel.tsx');

  expect(source.includes("'uix'"), 'Expected RightPanel to keep a UIX summary tab.');
  expect(source.includes("'knowledge'"), 'Expected RightPanel to include the Knowledge Bank tab without displacing UIX.');
  expect(source.includes('renderUix()'), 'Expected RightPanel to expose a UIX summary renderer.');
  expect(!source.includes('performDeepResearch('), 'Expected RightPanel to stop running duplicate deep-research edits directly.');
  expect(source.includes('Open Node Editor'), 'Expected RightPanel to route grounding/UIX editing back into the NodeInspector SSOT editor.');
  expect(source.includes('Product DNA'), 'Expected RightPanel UIX summary to surface active Product DNA packs.');
}

function test_kompletus_report_is_review_only_and_no_longer_edits_nodes_inline() {
  const report = read('src/components/KompletusReport.tsx');
  const store = read('src/store/useGraphStore.ts');

  expect(!report.includes('onUpdate={updateKompletusNode}'), 'Expected KompletusReport modules view to stop editing nodes inline.');
  expect(report.includes('review the generated blueprint here'), 'Expected KompletusReport to describe modules view as review-only.');
  expect(!store.includes('updateKompletusNode'), 'Expected useGraphStore to remove the duplicate updateKompletusNode pathway.');
}

function test_specular_editor_auto_refreshes_design_verdict_after_local_mutations() {
  const source = read('src/components/SpecularCreateEditor.tsx');

  expect(source.includes('useEffect'), 'Expected SpecularCreateEditor to use an effect for verdict hardening.');
  expect(source.includes('evaluateSpecularPreview'), 'Expected SpecularCreateEditor to call evaluateSpecularPreview for automatic verdict refresh.');
  expect(source.includes('setTimeout'), 'Expected SpecularCreateEditor to debounce verdict refresh after local edits.');
  expect(source.includes("status: 'pending'"), 'Expected local editor mutations to mark the verdict pending before refresh.');
  expect(source.includes('Product DNA'), 'Expected SpecularCreateEditor to surface active Product DNA packs.');
  expect(source.includes('Required receipts'), 'Expected SpecularCreateEditor to surface Product DNA receipt requirements.');
  expect(source.includes('Knowledge Bank'), 'Expected SpecularCreateEditor to surface Knowledge Bank evidence receipts.');
}

function test_frontend_preview_uses_vanguard_product_visual_language() {
  const serializer = read('src/lib/specular-preview.ts');
  const editor = read('src/components/SpecularCreateEditor.tsx');
  const previewRenderer = between(editor, 'function PreviewFrame', 'export default function SpecularCreateEditor');
  const previewSources = `${serializer}\n${previewRenderer}`;

  expect(previewSources.includes('bg-[#ffb000]'), 'Expected frontend preview to use the warm vanguard hero token.');
  expect(previewSources.includes('tracking-[-0.08em]'), 'Expected frontend preview to use an expressive product headline treatment.');
  expect(previewSources.includes('data-retrobuilder-vanguard'), 'Expected serialized TSX to preserve vanguard provenance.');
  expect(!/radial-gradient\(circle_at_top_left|bg-black\/30|bg-black\/25|bg-white\/5|text-slate-|bg-emerald-400\/10/.test(previewSources), 'Expected frontend preview renderer to avoid the old generic dark/glass visual vocabulary.');
}

function test_server_mounts_specular_routes() {
  const server = read('server.ts');
  const route = read('src/server/routes/specular.ts');

  expect(server.includes('createSpecularRouter'), 'Expected server.ts to import createSpecularRouter.');
  expect(server.includes('app.use(createSpecularRouter())'), 'Expected server.ts to mount the SPECULAR router.');
  expect(route.includes("router.post('/api/specular/generate'"), 'Expected specular router to expose /api/specular/generate.');
  expect(route.includes("router.post('/api/specular/verdict'"), 'Expected specular router to expose /api/specular/verdict.');
  expect(route.includes("router.get('/api/specular/preview/:sessionId/:nodeId'"), 'Expected specular router to expose /api/specular/preview/:sessionId/:nodeId.');
}

function test_booking_nodes_select_relevant_21st_controls() {
  const payload = buildSpecularCreatePayload({
    id: 'tattoo_public_site',
    label: 'Ink Ledger Tattoo Booking Site',
    type: 'frontend',
      description: 'Public tattoo studio site with artist consultation booking, deposits, aftercare reminders, CRM intake, and a final-feeling product surface that is not a generic scaffold.',
    data_contract: 'Input: {services, artists, client, availableSlots} -> Output: responsive tattoo consultation page',
    acceptance_criteria: [
      'Guests can request tattoo consultations from a 390px phone viewport',
      'Selected date, time, artist, and deposit intent remain visible before confirmation',
    ],
    error_handling: ['Long tattoo idea notes stay inside the mobile layout'],
  });
  const selectedReferences = payload.referenceCandidates.filter((reference) => payload.selectedReferenceIds.includes(reference.id));
  const selectedText = selectedReferences
    .map((reference) => `${reference.id} ${reference.title} ${reference.tags.join(' ')} ${reference.rationale}`)
    .join('\n')
    .toLowerCase();

  expect(payload.previewArtifact.screenType === 'form', `Expected booking site to infer form screen type, got ${payload.previewArtifact.screenType}.`);
  expect(payload.activeProductDnaContract.packBindings.length >= 1, 'Expected SPECULAR payload to compile Product DNA bindings.');
  expect(payload.selectedProductDnaPackIds.includes('quality/browser-product-quality'), `Expected frontend booking payload to include browser quality DNA. Got: ${payload.selectedProductDnaPackIds.join(', ')}`);
  expect(/date-wheel-picker|appointment-scheduler|calendar|date-time/.test(selectedText), `Expected selected references to include a 21st date/time control. Selected: ${selectedText}`);
  expect(/button-with-icon|action-button|material-ripple|liquid-metal-button|icon button|cta|radio-group-dashed|choice-control|radio|choice|ripple|state/.test(selectedText), `Expected selected references to include a 21st interaction/control. Selected: ${selectedText}`);
  expect(payload.designVerdict.status === 'passed', `Expected booking design verdict to pass. Findings: ${payload.designVerdict.findings.join(' ')}`);
  expect(!/cobe|globe/.test(selectedText), `Expected selected booking references not to include unrelated globe/dashboard patterns. Selected: ${selectedText}`);
}

function run() {
  const tests = [
    test_api_exposes_specular_create_contract,
    test_node_inspector_hosts_uix_editor,
    test_right_panel_stops_duplicating_grounding_editor_and_surfaces_uix_summary,
    test_kompletus_report_is_review_only_and_no_longer_edits_nodes_inline,
      test_specular_editor_auto_refreshes_design_verdict_after_local_mutations,
      test_frontend_preview_uses_vanguard_product_visual_language,
      test_server_mounts_specular_routes,
      test_booking_nodes_select_relevant_21st_controls,
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
