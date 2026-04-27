#!/usr/bin/env tsx
import { CLEAN_CODEX_DESIGNER_AGENTS_MD, buildCleanCodexDesignerBrief } from '../src/server/clean-codex-designer.js';
import { buildSpecularCreatePayload } from '../src/server/specular-create/specular-service.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function run() {
  const node = {
    id: 'public-site',
    label: 'Cut & Crown Public Booking Site',
    type: 'frontend' as const,
    description: 'Premium barbershop landing and booking surface.',
    designProfile: '21st' as const,
    selectedReferenceIds: ['hero-scrub'],
    referenceCandidates: [
      {
        id: 'hero-scrub',
        title: 'Cinematic Hero Scrub',
        category: 'scroll-scrubbed-hero',
        rationale: 'A cinematic landing page can make the shop feel premium before the booking flow starts.',
        tags: ['hero', 'cinematic', 'premium'],
        source: '21st-local' as const,
        dependencies: ['gsap'],
        implementationNotes: ['Use a domain-relevant visual atmosphere instead of generic cards.'],
        mobileRules: ['Clamp title size on 390px screens.'],
        tasteScore: 100,
      },
    ],
    designVerdict: {
      status: 'passed',
      score: 100,
      evidence: ['public-site: 100/100 via Cinematic Hero Scrub'],
      findings: [],
    },
  };
  const payload = buildSpecularCreatePayload(node as any);
  const brief = buildCleanCodexDesignerBrief({
    ...node,
    selectedProductDnaPackIds: payload.selectedProductDnaPackIds,
    activeProductDnaContract: payload.activeProductDnaContract,
  });

  expect(brief.includes('Clean Codex Designer brief:'), 'Expected a clean Codex designer heading.');
  expect(brief.includes('selected 21st references'), 'Expected selected 21st references in the clean brief.');
  expect(brief.includes('Cinematic Hero Scrub'), 'Expected selected reference title in the clean brief.');
  expect(brief.includes('Do not inherit house-style defaults'), 'Expected the clean brief to reject generated house-style defaults.');
  expect(brief.includes('Avoid repeating the same warm cards'), 'Expected the clean brief to reject repeated visual tropes.');
  expect(brief.includes('390px'), 'Expected mobile design target in the clean brief.');
  expect(brief.includes('active Product DNA contract'), 'Expected the clean brief to include the compiled Product DNA contract.');
  expect(brief.includes('design/retrofuture-command-center'), 'Expected Product DNA design pack in the clean brief.');
  expect(brief.includes('required receipts'), 'Expected Product DNA receipt requirements in the clean brief.');
  expect(!/\bOMX\b/.test(brief), 'Expected the clean designer brief to have no OMX terminology.');
  expect(CLEAN_CODEX_DESIGNER_AGENTS_MD.includes('isolated product-design workspace'), 'Expected a clean designer AGENTS.md contract.');
  expect(!/\bOMX\b/.test(CLEAN_CODEX_DESIGNER_AGENTS_MD), 'Expected the clean designer AGENTS.md to have no OMX terminology.');
  console.log('PASS clean Codex designer contract');
}

run();
