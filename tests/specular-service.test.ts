#!/usr/bin/env tsx
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { resetTasteCatalogCache } from '../src/server/design-taste/taste-catalog.ts';
import {
  buildSpecularCreatePayload,
  buildSpecularDesignGate,
} from '../src/server/specular-create/specular-service.ts';
import { evaluateSpecularVerdict } from '../src/server/specular-create/specular-verdict.ts';

function expect(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ops-dashboard',
    label: 'Ops Dashboard',
    description: 'A control surface for operators.',
    type: 'frontend',
    data_contract: 'Input: { status: string, incidents: number, owner: string } Output: { panels: string[] }',
    acceptance_criteria: [
      'Operators can see live status in one glance.',
      'Operators can trigger the main corrective action without searching.',
    ],
    error_handling: ['Render degraded-state copy when incident feeds fail.'],
    ...overrides,
  };
}

function writeTasteComponent(root: string, key: string, overrides: Record<string, unknown> = {}) {
  const [author, slug] = key.split('/');
  const componentDir = path.join(root, author, slug);
  mkdirSync(componentDir, { recursive: true });
  writeFileSync(path.join(componentDir, 'component.json'), JSON.stringify({
    component_key: key,
    username: author,
    slug,
    name: slug.split('-').map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(' '),
    description_enhanced: `${slug} premium landing checkout component with hero, pricing, motion and responsive hierarchy.`,
    category_primary: 'ai-ui',
    categories: ['ai-ui', 'landing', 'marketing', 'form-input', 'visual-effect'],
    component_page_url: `https://21st.dev/community/components/${key}/default`,
    prompt_page_url: `https://21st.dev/community/components/${key}/default?tab=prompt`,
    preview_url: `https://cdn.21st.dev/${key}/preview.png`,
    npm_dependencies: ['lucide-react'],
    likes_count: 25,
    bookmarks_count: 40,
    downloads_count: 100,
    ...overrides,
  }, null, 2), 'utf8');
  writeFileSync(path.join(componentDir, 'component.l1ght.md'), `---
Protocol: L1GHT/1.0
Node: 21stComponent::${key}
State: reconstructed
---

# ${slug}

A taste-approved component for premium product surfaces with strong hierarchy, mobile-first spacing, and production-ready interaction patterns.
`, 'utf8');
}

function withTempTasteCatalog<T>(run: () => T): T {
  const oldRoot = process.env.RETROBUILDER_21ST_CATALOG_ROOT;
  const root = mkdtempSync(path.join(tmpdir(), 'retrobuilder-21st-catalog-'));
  try {
    writeTasteComponent(root, 'taste/glass-video-hero');
    writeTasteComponent(root, 'taste/animated-glassy-pricing');
    writeTasteComponent(root, 'taste/action-search-bar');
    process.env.RETROBUILDER_21ST_CATALOG_ROOT = root;
    resetTasteCatalogCache();
    return run();
  } finally {
    if (oldRoot == null) {
      delete process.env.RETROBUILDER_21ST_CATALOG_ROOT;
    } else {
      process.env.RETROBUILDER_21ST_CATALOG_ROOT = oldRoot;
    }
    resetTasteCatalogCache();
    rmSync(root, { recursive: true, force: true });
  }
}

function test_build_specular_create_payload_returns_variants_and_preview() {
  const payload = buildSpecularCreatePayload(makeNode() as any);
  const previewText = [
    payload.previewArtifact.summary,
    payload.previewArtifact.tsx,
    ...payload.previewArtifact.blocks.flatMap((block) => [
      block.title,
      block.eyebrow || '',
      block.body || '',
      ...(block.items || []),
    ]),
  ].join('\n');

    expect(payload.designProfile === '21st', `Expected designProfile='21st'. Got: ${payload.designProfile}`);
    expect(payload.referenceCandidates.some((reference) => reference.source === 'retrobuilder-vanguard'), 'Expected SPECULAR payload to include Retrobuilder vanguard pattern references.');
    expect(payload.previewArtifact.summary.includes('Retrobuilder vanguard'), `Expected preview summary to name the vanguard design source. Got: ${payload.previewArtifact.summary}`);
    expect(payload.variantCandidates.length >= 3, `Expected at least three variants. Got: ${payload.variantCandidates.length}`);
    expect(payload.previewArtifact.kind === 'tsx', `Expected preview artifact kind tsx. Got: ${payload.previewArtifact.kind}`);
    expect(typeof payload.previewArtifact.tsx === 'string' && payload.previewArtifact.tsx.length > 0, 'Expected previewArtifact.tsx to be populated.');
    expect(payload.activeProductDnaContract.contractVersion === 'active-product-dna-contract@1', 'Expected SPECULAR payload to compile an active Product DNA contract.');
    expect(payload.selectedProductDnaPackIds.includes('design/retrofuture-command-center'), `Expected dashboard payload to select command-center design DNA. Got: ${payload.selectedProductDnaPackIds.join(', ')}`);
    expect(payload.selectedProductDnaPackIds.includes('quality/browser-product-quality'), `Expected frontend payload to select browser quality DNA. Got: ${payload.selectedProductDnaPackIds.join(', ')}`);
    expect(payload.knowledgeContextBundle.schemaVersion === 'knowledge-bank@1', `Expected SPECULAR payload to include Knowledge Bank context. Got: ${payload.knowledgeContextBundle.schemaVersion}`);
    expect(payload.knowledgeContextBundle.receipt.receiptId.startsWith('kb-receipt-'), `Expected Knowledge Bank receipt id. Got: ${payload.knowledgeContextBundle.receipt.receiptId}`);
    expect(payload.knowledgeContextBundle.evidence.length >= 1, 'Expected Knowledge Bank context to include at least one evidence binding.');
    expect(payload.knowledgeContextBundle.promptContext === '', 'Expected SPECULAR response to omit raw Knowledge Bank prompt context to keep UI payloads compact.');
    expect(payload.knowledgeContextBundle.chunks.every((chunk) => chunk.text === ''), 'Expected SPECULAR response chunks to be metadata-only.');
    expect(payload.designVerdict.evidence.some((entry) => entry.includes('Product DNA packs active')), `Expected design verdict evidence to mention Product DNA packs. Got: ${payload.designVerdict.evidence.join(' | ')}`);
    expect(payload.designVerdict.status === 'passed', `Expected well-formed frontend node to pass design verdict. Got: ${payload.designVerdict.status}`);
    expect(!/completion checklist|field contract|workflow state|pending payload|data contract|acceptance criteria|JSON\.stringify|<pre\b/i.test(previewText), `Expected SPECULAR preview to avoid diagnostic/product-spec copy. Got: ${previewText}`);
    expect(!/Editorial Signal|Control Room\s+(?:\u2014|-)\s+a denser|Focused Flow|bg-black\/30|bg-white\/5|text-slate-|radial-gradient\(circle_at_top_left/i.test(previewText), `Expected SPECULAR preview to avoid old generic visual vocabulary. Got: ${previewText}`);
    expect(/\b(request|confirm|continue|open|review|send|book|order|schedule)\b/i.test(previewText), `Expected SPECULAR preview to include concrete product action language. Got: ${previewText}`);
  }

function test_build_specular_create_payload_uses_real_21st_taste_catalog_when_available() {
  withTempTasteCatalog(() => {
    const payload = buildSpecularCreatePayload(makeNode({
      id: 'premium-landing',
      label: 'Premium Bakery Landing',
      description: 'A premium landing, checkout and pricing surface with hero storytelling, product cards, subscription package conversion and motion.',
    }) as any);

      expect(payload.referenceCandidates.length >= 3, `Expected at least three taste references. Got: ${payload.referenceCandidates.length}`);
      expect(payload.referenceCandidates.some((reference) => reference.source === 'retrobuilder-vanguard'), `Expected taste references to include the Retrobuilder vanguard database. Got: ${payload.referenceCandidates.map((reference) => reference.source).join(', ')}`);
      expect(payload.referenceCandidates.some((reference) => reference.source === '21st-catalog'), `Expected taste references to preserve real 21st-catalog matches. Got: ${payload.referenceCandidates.map((reference) => reference.source).join(', ')}`);
      expect(payload.referenceCandidates.some((reference) => reference.componentKey === 'taste/glass-video-hero'), 'Expected the taste catalog to preserve component keys.');
      expect(payload.referenceCandidates.some((reference) => reference.previewUrl?.includes('cdn.21st.dev')), 'Expected taste references to preserve preview URLs.');
      expect(payload.designVerdict.evidence.some((entry) => entry.includes('Retrobuilder vanguard database patterns available')), `Expected design verdict evidence to mention vanguard database grounding. Got: ${payload.designVerdict.evidence.join(' | ')}`);
      expect(payload.designVerdict.evidence.some((entry) => entry.includes('Real 21st catalog references available')), `Expected design verdict evidence to mention real 21st catalog grounding. Got: ${payload.designVerdict.evidence.join(' | ')}`);
      expect(payload.activeProductDnaContract.packBindings.length >= 2, 'Expected taste-backed payload to also carry Product DNA bindings.');
    });
  }

  function genericPreviewArtifact() {
    return {
      kind: 'tsx',
      componentName: 'GenericPreview',
      screenType: 'dashboard',
      summary: 'Editorial Signal generic dashboard',
      blocks: [
        {
          id: 'hero',
          kind: 'hero',
          title: 'Ops Dashboard',
          body: 'A generic dashboard made of dark glass cards.',
        },
        {
          id: 'metrics',
          kind: 'metrics',
          title: 'Metrics',
          items: ['Status', 'Owner', 'Queue'],
        },
        {
          id: 'cta',
          kind: 'cta',
          title: 'Continue',
          body: 'Continue.',
        },
      ],
      tsx: '<section className="bg-black/30 text-slate-300"><div className="bg-white/5">Generic dashboard</div></section>',
    };
  }

  function test_evaluate_specular_verdict_fails_for_generic_visual_vocabulary() {
    const verdict = evaluateSpecularVerdict(makeNode() as any, {
      previewArtifact: genericPreviewArtifact() as any,
      previewState: { density: 'compact', emphasis: 'dashboard' },
      referenceCandidates: [
        { id: 'v1', title: 'Infinite Bento Pan', category: 'data-motion-bento', rationale: 'x', tags: [], source: 'retrobuilder-vanguard', patternId: 'infinite-bento-pan' },
        { id: 'v2', title: 'Perspective Marquee', category: 'kinetic-proof', rationale: 'x', tags: [], source: 'retrobuilder-vanguard', patternId: 'perspective-marquee' },
        { id: 'v3', title: 'Masked Slide Reveal', category: 'text-reveal-motion', rationale: 'x', tags: [], source: 'retrobuilder-vanguard', patternId: 'masked-slide-reveal' },
      ],
      selectedReferenceIds: ['v1'],
    });

    expect(verdict.status === 'failed', `Expected generic visual vocabulary to fail the design verdict. Got: ${verdict.status}`);
    expect(verdict.findings.some((finding) => finding.includes('generic dark/glass/card')), `Expected design findings to mention generic visual vocabulary. Got: ${verdict.findings.join(' | ')}`);
  }

function productPreviewArtifact() {
  return {
    kind: 'tsx',
    componentName: 'ProductPreview',
    screenType: 'form',
    summary: 'Premium product flow',
    blocks: [
      {
        id: 'hero',
        kind: 'hero',
        title: 'Appointment Scheduling',
        body: 'A focused flow to confirm booking details.',
      },
      {
        id: 'detail',
        kind: 'detail',
        title: 'Details',
        body: 'Client and service choices stay visible before confirmation.',
      },
      {
        id: 'list',
        kind: 'list',
        title: 'What happens next',
        items: ['Review the selected service.', 'Confirm booking with the client.'],
      },
      {
        id: 'cta',
        kind: 'cta',
        title: 'Confirm booking',
        body: 'Save the appointment request.',
      },
    ],
    tsx: '<section><h1>Appointment Scheduling</h1><button>Confirm booking</button></section>',
  };
}

function test_vehicle_notes_with_appointment_context_does_not_require_date_time_reference() {
  const payload = buildSpecularCreatePayload(makeNode({
    id: 'vehicle_notes',
    label: 'Vehicle Notes',
    description: 'Service advisors capture inspection notes, repair history, and appointment context for each vehicle record.',
    data_contract: 'Input: { vehicleId: string, customer: string, notes: string[], serviceHistory: string[], appointmentContext: string } Output: { noteCards: string[], riskFlags: string[], followUpMessage: string }',
    acceptance_criteria: [
      'Advisors can review service history without losing customer context.',
      'Technicians can save a note and continue the repair flow.',
    ],
    error_handling: ['If note sync fails, keep the draft visible and let the advisor retry.'],
  }) as any);

  expect(payload.previewArtifact.screenType === 'detail', `Expected vehicle notes to be treated as a detail surface, not a scheduling form. Got: ${payload.previewArtifact.screenType}`);
  expect(payload.designVerdict.status === 'passed', `Expected vehicle notes with appointment context to pass without date/time control false positives. Got: ${payload.designVerdict.status}: ${payload.designVerdict.findings.join(' | ')}`);
  expect(!payload.designVerdict.findings.some((finding) => finding.includes('date/time reference')), `Expected no date/time-reference finding for contextual vehicle notes. Got: ${payload.designVerdict.findings.join(' | ')}`);
}

function test_content_ssot_one_time_pricing_does_not_require_date_time_reference() {
  const payload = buildSpecularCreatePayload(makeNode({
    id: 'content-ssot',
    label: 'Landing Content SSOT',
    description: 'Canonical marketing copy for a landing page with feature sections, pricing language, CTA labels, and forbidden claim rules.',
    data_contract: 'Input: { planNames: string[], pricingCopy: string[], ctaLabels: string[] } Output: { sections: string[], approvedClaims: string[], primaryCta: string }',
    acceptance_criteria: [
      'The landing page copy includes Free, Monthly, and Lifetime: €5 one-time pricing without implying a booking flow.',
      'The hero, problem, feature, proof, pricing, and final CTA sections render in the approved order.',
      'Forbidden claims are removed before content is exposed to the public surface.',
    ],
    error_handling: ['If pricing copy is missing, render a safe fallback CTA and flag the content owner.'],
  }) as any);

  expect(payload.designVerdict.status === 'passed', `Expected one-time pricing content SSOT to pass design verdict. Got: ${payload.designVerdict.status}: ${payload.designVerdict.findings.join(' | ')}`);
  expect(!payload.designVerdict.findings.some((finding) => finding.includes('date/time reference')), `Expected no date/time-reference finding for one-time pricing copy. Got: ${payload.designVerdict.findings.join(' | ')}`);
}

function test_booking_surface_still_requires_selected_date_time_reference() {
  const verdict = evaluateSpecularVerdict(makeNode({
    id: 'appointment_scheduling',
    label: 'Appointment Scheduling',
    description: 'Guests schedule appointments from availableSlots and confirm a booking request.',
    data_contract: 'Input: { serviceId: string, customer: string, availableSlots: string[] } Output: { appointmentRequestId: string }',
    acceptance_criteria: [
      'Guests can choose an available slot.',
      'Guests can confirm the appointment request from a phone.',
    ],
    error_handling: ['If slot availability changes, prompt the guest to choose another time.'],
  }) as any, {
    previewArtifact: productPreviewArtifact() as any,
    previewState: { density: 'comfortable', emphasis: 'product' },
    referenceCandidates: [
      { id: 'v-action', title: 'Button With Icon', category: 'Controls', rationale: 'x', tags: ['button', 'action'], source: 'retrobuilder-vanguard', patternId: 'button-with-icon' },
      { id: 'v-state', title: 'Animated State Icons', category: 'Controls', rationale: 'x', tags: ['state', 'action'], source: 'retrobuilder-vanguard', patternId: 'animated-state-icons' },
      { id: 'v-marquee', title: 'Perspective Marquee', category: 'Kinetic Proof', rationale: 'x', tags: ['proof'], source: 'retrobuilder-vanguard', patternId: 'perspective-marquee' },
    ],
    selectedReferenceIds: ['v-action'],
  });

  expect(verdict.status === 'failed', `Expected real booking surface without selected date/time reference to fail. Got: ${verdict.status}`);
  expect(verdict.findings.some((finding) => finding.includes('date/time reference')), `Expected booking finding to mention missing date/time reference. Got: ${verdict.findings.join(' | ')}`);
}

function test_build_specular_design_gate_fails_for_under_specified_user_facing_node() {
  const gate = buildSpecularDesignGate([
    makeNode({
      data_contract: '',
      acceptance_criteria: [],
      error_handling: [],
    }) as any,
  ]);

  expect(gate.designGateStatus === 'failed', `Expected design gate to fail for under-specified node. Got: ${gate.designGateStatus}`);
  expect(gate.designFindings.length > 0, 'Expected failed design gate to include findings.');
  expect(gate.designScore < 78, `Expected failed design gate score to fall below the pass threshold. Got: ${gate.designScore}`);
  expect(gate.failingNodeIds.includes('ops-dashboard'), `Expected failed design gate to identify the failing node. Got: ${gate.failingNodeIds.join(', ')}`);
}

function diagnosticPreviewArtifact() {
  return {
    kind: 'tsx',
    componentName: 'DiagnosticPreview',
    screenType: 'wizard',
    summary: 'Diagnostic preview',
    blocks: [
      {
        id: 'debug',
        kind: 'detail',
        title: 'Workflow state',
        body: 'Pending payload {"type":"booking.request"}',
      },
      {
        id: 'cta',
        kind: 'cta',
        title: 'Continue',
        body: 'Raw JSON is visible for debug.',
      },
      {
        id: 'hero',
        kind: 'hero',
        title: 'Ops Dashboard',
        body: 'Diagnostic surface',
      },
    ],
    tsx: '<pre>{JSON.stringify(payload)}</pre>',
  };
}

function test_evaluate_specular_verdict_fails_for_diagnostic_preview_copy() {
  const verdict = evaluateSpecularVerdict(makeNode() as any, {
    previewArtifact: diagnosticPreviewArtifact() as any,
    previewState: { density: 'comfortable', emphasis: 'product' },
    referenceCandidates: [
      { id: 'r1', title: 'Glass Hero', category: 'ai-ui', rationale: 'x', tags: [], source: '21st-catalog' },
      { id: 'r2', title: 'Message Dock', category: 'ai-ui', rationale: 'x', tags: [], source: '21st-catalog' },
      { id: 'r3', title: 'Action Search', category: 'ai-ui', rationale: 'x', tags: [], source: '21st-catalog' },
    ],
    selectedReferenceIds: ['r1'],
  });

  expect(verdict.status === 'failed', `Expected diagnostic preview copy to fail the design verdict. Got: ${verdict.status}`);
  expect(verdict.findings.some((finding) => finding.includes('diagnostic language')), `Expected design findings to mention diagnostic language. Got: ${verdict.findings.join(' | ')}`);
}

function test_build_specular_create_payload_repairs_stale_diagnostic_preview_copy() {
  const payload = buildSpecularCreatePayload(makeNode({
    previewArtifact: diagnosticPreviewArtifact(),
    selectedVariantId: 'stale-diagnostic',
    variantCandidates: [
      {
        id: 'stale-diagnostic',
        label: 'Stale Diagnostic',
        description: 'Old persisted diagnostic preview',
        flavor: 'editorial',
        screenType: 'wizard',
        referenceIds: ['legacy'],
        previewArtifact: diagnosticPreviewArtifact(),
        designVerdict: { status: 'passed', score: 100, findings: [], evidence: [] },
      },
    ],
  }) as any);
  const previewText = [payload.previewArtifact.summary, payload.previewArtifact.tsx].join('\n');

  expect(payload.designVerdict.status === 'passed', `Expected stale diagnostic preview to be repaired with a passing generated variant. Got: ${payload.designVerdict.status}`);
  expect(!/Workflow state|Pending payload|JSON\.stringify|<pre\b/i.test(previewText), `Expected repaired preview to remove diagnostic copy. Got: ${previewText}`);
  expect(payload.selectedVariantId !== 'stale-diagnostic', 'Expected stale persisted diagnostic variant to be replaced by a fresh generated variant.');
}

function run() {
  const tests = [
    test_build_specular_create_payload_returns_variants_and_preview,
    test_build_specular_create_payload_uses_real_21st_taste_catalog_when_available,
      test_vehicle_notes_with_appointment_context_does_not_require_date_time_reference,
      test_content_ssot_one_time_pricing_does_not_require_date_time_reference,
      test_booking_surface_still_requires_selected_date_time_reference,
      test_build_specular_design_gate_fails_for_under_specified_user_facing_node,
      test_evaluate_specular_verdict_fails_for_diagnostic_preview_copy,
      test_evaluate_specular_verdict_fails_for_generic_visual_vocabulary,
      test_build_specular_create_payload_repairs_stale_diagnostic_preview_copy,
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
