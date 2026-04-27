#!/usr/bin/env tsx
import {
  RETROBUILDER_VANGUARD_DESIGN_DIRECTIVE,
  RETROBUILDER_VANGUARD_PATTERNS,
  getVanguardPatternReferenceCandidates,
} from '../src/server/design-taste/vanguard-patterns.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function run() {
  const requiredPatternIds = [
    'container-scroll-animation',
    'tilt-depth-cards',
    'hover-brand-logo',
    'hero-scrub',
    'prisma-video-hero',
    'marker-highlight',
    'grid-pixelate-wipe',
    'infinite-bento-pan',
    'perspective-marquee',
    'masked-slide-reveal',
    'motion-footer',
    'interfaces-breadcrumb',
    'interfaces-slider',
    'cobe-globe',
    'cobe-globe-pulse',
    'base-ui-switch',
    'interfaces-table',
    'cobe-globe-polaroids',
    'cobe-globe-cdn',
    'background-parallax-hero',
    'cinematic-landing-hero',
    'base-ui-combobox',
    'motion-volume-control',
    'glass-blog-card',
    'special-text-scramble',
    'location-map',
    'button-with-icon',
    'team-member-card',
    'bento-card-tabs',
    'framer-switch',
    'vertical-tabs-gallery',
    'text-roll',
    'glass-account-settings-card',
    'link-hover-image-preview',
    'glass-checkout-card',
    'pricing-card-selector',
    'liquid-metal-button',
    'heart-favorite',
    'animated-checkbox',
    'highlighted-text',
    'color-selector',
    'expanding-search-dock',
    'gallery-grid-lightbox',
    'gradient-wave-text',
    'bars-spinner',
    'glass-listen-app',
    'squiggly-underline',
    'notification-popover',
    'magnified-bento',
    'bottom-menu',
    'date-wheel-picker',
    'floating-chat-widget',
    'perspective-book',
    'animated-collection',
    'cards-slider',
    'filter-list-item',
    'stacked-list',
    'avatar-badge',
    'social-button',
    'team-showcase',
    'animated-tooltip',
    'basic-circle-text',
    'area-chart',
    'animated-push-list',
    'accordion-space',
    'radio-group-dashed',
    'animated-loading-breadcrumb',
    'animated-state-icons',
    'team-scaling-hero',
    'vercel-style-hero-banner',
    'kinetic-navigation',
    'interactive-thermodynamic-grid',
    'hero-shutter-text',
    'halide-topo-hero',
    'not-found-empty',
    'agent-loop-infinite-slider',
    'story-viewer',
    'bolt-style-chat',
    'hero-dithering-card',
    'material-ripple',
    'responsive-hero-banner',
    'member-selector',
  ];

  expect(RETROBUILDER_VANGUARD_PATTERNS.length >= 80, `Expected expanded vanguard database. Got: ${RETROBUILDER_VANGUARD_PATTERNS.length}`);

  for (const patternId of requiredPatternIds) {
    const pattern = RETROBUILDER_VANGUARD_PATTERNS.find((entry) => entry.id === patternId);
    expect(pattern, `Expected vanguard database to include ${patternId}.`);
    expect(pattern!.designDna.length >= 3, `Expected ${patternId} to include design DNA.`);
    expect(pattern!.implementationNotes.length >= 2, `Expected ${patternId} to include implementation notes.`);
    expect(pattern!.mobileRules.length >= 2, `Expected ${patternId} to include mobile rules.`);
    expect(pattern!.stackAdapters['react-tailwind-shadcn']?.length > 0, `Expected ${patternId} to support React/Tailwind/shadcn.`);
    expect(pattern!.stackAdapters['vanilla-html-css-js']?.length > 0, `Expected ${patternId} to support vanilla translation.`);
    expect(pattern!.stackAdapters.vue?.length > 0, `Expected ${patternId} to support Vue translation.`);
    expect(pattern!.stackAdapters.svelte?.length > 0, `Expected ${patternId} to support Svelte translation.`);
    expect(pattern!.stackAdapters['server-rendered-html']?.length > 0, `Expected ${patternId} to support server-rendered HTML translation.`);
  }

  const bakeryReferences = getVanguardPatternReferenceCandidates({
    id: 'bakery-mobile',
    label: 'Bakery IT mobile ordering',
    type: 'frontend',
    description: 'Mobile-first Italian bakery landing, daily orders, subscriptions, WhatsApp intake and delivery schedule.',
  }, 'landing', 4);

  expect(bakeryReferences.length === 4, `Expected four vanguard references. Got: ${bakeryReferences.length}`);
  expect(bakeryReferences.every((reference) => reference.source === 'retrobuilder-vanguard'), 'Expected vanguard references to use retrobuilder-vanguard source.');
  expect(bakeryReferences.some((reference) => ['container-scroll-animation', 'hero-scrub', 'prisma-video-hero', 'cinematic-landing-hero', 'background-parallax-hero'].includes(reference.patternId || '')), `Expected landing query to select a cinematic hero pattern. Got: ${bakeryReferences.map((reference) => reference.patternId).join(', ')}`);
  expect(bakeryReferences.every((reference) => reference.stackAdapters?.['vanilla-html-css-js']?.length), 'Expected each vanguard reference to carry stack adapters.');
  expect(RETROBUILDER_VANGUARD_DESIGN_DIRECTIVE.includes('translate the design intent'), 'Expected directive to require stack translation.');
  expect(RETROBUILDER_VANGUARD_DESIGN_DIRECTIVE.includes('Never fall back to generic dark glass'), 'Expected directive to reject generic dark glass fallback.');

  const cdnReferences = getVanguardPatternReferenceCandidates({
    id: 'edge-dashboard',
    label: 'Global CDN infrastructure dashboard',
    type: 'frontend',
    description: 'Show edge regions, latency, uptime, live network pulses, traffic routing, and global customer coverage.',
  }, 'dashboard', 6);

  expect(cdnReferences.some((reference) => reference.patternId === 'cobe-globe-cdn' || reference.patternId === 'cobe-globe-pulse'), `Expected CDN query to select a globe infrastructure pattern. Got: ${cdnReferences.map((reference) => reference.patternId).join(', ')}`);

  const controlsReferences = getVanguardPatternReferenceCandidates({
    id: 'settings-controls',
    label: 'Account settings controls',
    type: 'frontend',
    description: 'Combobox search, switch toggles, slider amounts, notification preferences, member selector and account profile settings.',
  }, 'form', 8);

  expect(controlsReferences.some((reference) => reference.patternId === 'base-ui-combobox'), `Expected controls query to select combobox pattern. Got: ${controlsReferences.map((reference) => reference.patternId).join(', ')}`);
  expect(controlsReferences.some((reference) => reference.patternId === 'base-ui-switch' || reference.patternId === 'framer-switch'), `Expected controls query to select switch pattern. Got: ${controlsReferences.map((reference) => reference.patternId).join(', ')}`);
  expect(controlsReferences.some((reference) => reference.patternId === 'interfaces-slider'), `Expected controls query to select slider pattern. Got: ${controlsReferences.map((reference) => reference.patternId).join(', ')}`);

  const aiChatReferences = getVanguardPatternReferenceCandidates({
    id: 'ai-builder-chat',
    label: 'AI builder chat prompt',
    type: 'frontend',
    description: 'Bolt style prompt surface with model selector, import buttons, attachments, send action and loading breadcrumb.',
  }, 'chat', 6);

  expect(aiChatReferences.some((reference) => reference.patternId === 'bolt-style-chat'), `Expected AI chat query to select Bolt-style chat. Got: ${aiChatReferences.map((reference) => reference.patternId).join(', ')}`);
  expect(aiChatReferences.some((reference) => reference.patternId === 'animated-loading-breadcrumb'), `Expected AI chat query to select animated loading breadcrumb. Got: ${aiChatReferences.map((reference) => reference.patternId).join(', ')}`);

  const mediaReferences = getVanguardPatternReferenceCandidates({
    id: 'social-stories',
    label: 'Social story viewer',
    type: 'frontend',
    description: 'Avatar story rings, image and video viewer, progress bars, mute, pause, swipe and close controls.',
  }, 'chat', 6);

  expect(mediaReferences.some((reference) => reference.patternId === 'story-viewer'), `Expected story query to select story viewer. Got: ${mediaReferences.map((reference) => reference.patternId).join(', ')}`);

  console.log('PASS vanguard patterns contract');
}

run();
