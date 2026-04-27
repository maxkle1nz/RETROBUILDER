import { inferScreenType } from './specular-references.js';
import { summarizeVanguardReference } from '../design-taste/vanguard-patterns.js';
import type {
  SpecularNodeInput,
  SpecularPreviewArtifact,
  SpecularPreviewBlock,
  SpecularPreviewState,
  SpecularReferenceCandidate,
  SpecularScreenType,
  SpecularVariantCandidate,
} from './specular-types.js';

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'module';
}

function toPascalCase(value: string) {
  return slug(value)
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function extractContractFields(contract?: string) {
  if (!contract) return [];
  const matches = Array.from(contract.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:/g)).map((match) => match[1]);
  return Array.from(new Set(matches.filter((field) => !['Input', 'Output', 'Record', 'string', 'number', 'boolean'].includes(field)))).slice(0, 4);
}

function compactList(items: string[] | undefined, fallback: string[]) {
  const cleaned = (items || []).map((item) => item.trim()).filter(Boolean);
  return (cleaned.length > 0 ? cleaned : fallback).slice(0, 4);
}

function humanizeField(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b(id|api|ui|ux)\b/gi, (match) => match.toUpperCase())
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function escapeJsxText(value: string | undefined) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function productizeCopy(value: string, fallback: string) {
  const cleaned = (value || fallback)
    .replace(/\b(?:not|never)\s+(?:a\s+)?generic\s+(?:placeholder|scaffold|dashboard|card|website|site|design)\b/gi, 'a distinctive product-grade surface')
    .replace(/\b(?:avoid|avoids|avoiding)\s+generic\s+(?:placeholder|scaffold|dashboard|card|website|site|design)\b/gi, 'uses a distinctive product-grade visual system')
    .replace(/\bwithout\s+generic\s+(?:placeholder|scaffold|dashboard|card|website|site|design)\b/gi, 'with a distinctive product-grade visual system')
    .replace(/\bdata\s+contract\b/gi, 'saved details')
    .replace(/\bacceptance\s+criteria\b/gi, 'quality checks')
    .replace(/\bbackend\s+APIs?\b/gi, 'secure services')
    .replace(/\bAPI\s+submission\b/gi, 'request')
    .replace(/\bfrontend\b/gi, 'app')
    .replace(/\bpayloads?\b/gi, 'request details')
    .replace(/\bmodule\b/gi, 'experience')
    .replace(/\bdebug\b/gi, 'support')
    .replace(/\bcontract\b/gi, 'promise')
    .trim();
  return cleaned || fallback;
}

function productSurfaceLabel(screenType: SpecularScreenType) {
  if (screenType === 'chat') return 'Conversation';
  if (screenType === 'form') return 'Request flow';
  if (screenType === 'wizard') return 'Guided flow';
  if (screenType === 'list') return 'Daily view';
  if (screenType === 'dashboard') return 'Control room';
  if (screenType === 'landing') return 'Product story';
  return 'Product surface';
}

function referenceSignature(references: SpecularReferenceCandidate[]) {
  const vanguard = references.filter((reference) => reference.source === 'retrobuilder-vanguard');
  const primary = (vanguard.length > 0 ? vanguard : references).slice(0, 2);
  return primary.map((reference) => reference.title).join(' / ') || 'taste-led interface';
}

function patternIntent(references: SpecularReferenceCandidate[]) {
  const summaries = references.map(summarizeVanguardReference).filter(Boolean);
  if (summaries.length > 0) return summaries.join(' || ');
  return references.slice(0, 2).map((reference) => `${reference.title}: ${reference.rationale}`).join(' || ');
}

function buildBlockSet(
  node: SpecularNodeInput,
  screenType: SpecularScreenType,
  flavor: SpecularVariantCandidate['flavor'],
  references: SpecularReferenceCandidate[],
): SpecularPreviewBlock[] {
  const productFields = compactList(extractContractFields(node.data_contract).map(humanizeField), ['Status', 'Summary', 'Owner']);
  const outcomes = compactList(node.acceptance_criteria, ['Complete the primary task quickly.', 'Keep the next action clear.'])
    .map((item) => productizeCopy(item, 'Keep the next action clear.'));
  const recovery = compactList(node.error_handling, ['Show a calm recovery state.', 'Preserve progress when something fails.'])
    .map((item) => productizeCopy(item, 'Show a calm recovery state.'));
  const heroEyebrow = `${productSurfaceLabel(screenType)} / ${referenceSignature(references)}`;

  if (screenType === 'chat') {
    return [
      {
        id: 'hero',
        kind: 'hero',
        eyebrow: heroEyebrow,
        title: node.label,
        body: productizeCopy(node.description, 'A focused conversational surface that keeps the next reply obvious.'),
      },
      {
        id: 'detail',
        kind: 'detail',
        title: 'Conversation rhythm',
        body: `${productFields.join(' / ')} stay close to the reply so people understand what will happen next.`,
      },
      {
        id: 'activity',
        kind: 'activity',
        title: 'What you can do next',
        items: outcomes,
      },
      {
        id: 'cta',
        kind: 'cta',
        title: flavor === 'conversational' ? 'Reply now' : 'Continue safely',
        body: recovery.join(' '),
      },
    ];
  }

  if (screenType === 'form' || screenType === 'wizard') {
    return [
      {
        id: 'hero',
        kind: 'hero',
        eyebrow: heroEyebrow,
        title: node.label,
        body: productizeCopy(node.description, 'A guided input surface that keeps the next step obvious.'),
      },
      {
        id: 'detail',
        kind: 'detail',
        title: screenType === 'wizard' ? 'Next step' : 'Details that matter',
        body: `${productFields.join(', ')} are presented as plain-language choices before the request is confirmed.`,
      },
      {
        id: 'list',
        kind: 'list',
        title: 'What happens next',
        items: outcomes,
      },
      {
        id: 'cta',
        kind: 'cta',
        title: flavor === 'editorial' ? 'Continue with confidence' : 'Review and confirm',
        body: recovery.join(' '),
      },
    ];
  }

  if (screenType === 'list') {
    return [
      {
        id: 'hero',
        kind: 'hero',
        eyebrow: heroEyebrow,
        title: node.label,
        body: productizeCopy(node.description, 'A scanning surface with strong hierarchy and low noise.'),
      },
      {
        id: 'metrics',
        kind: 'metrics',
        title: 'At a glance',
        items: productFields,
      },
      {
        id: 'list',
        kind: 'list',
        title: "Today's priorities",
        items: outcomes,
      },
      {
        id: 'cta',
        kind: 'cta',
        title: 'Open selected item',
        body: recovery.join(' '),
      },
    ];
  }

  return [
    {
      id: 'hero',
      kind: 'hero',
      eyebrow: heroEyebrow,
      title: node.label,
      body: productizeCopy(node.description, 'A product surface with a strong 21st-inspired visual hierarchy.'),
    },
    {
      id: 'metrics',
      kind: 'metrics',
      title: 'At a glance',
      items: productFields,
    },
    {
      id: 'detail',
      kind: 'detail',
      title: 'Customer outcome',
      body: outcomes.join(' '),
    },
    {
      id: 'activity',
      kind: 'activity',
      title: 'When something changes',
      items: recovery,
    },
    {
      id: 'cta',
      kind: 'cta',
      title: flavor === 'editorial' ? 'Start with confidence' : 'Operate the system',
      body: flavor === 'control'
        ? 'Open the live workflow with the important signals already in view.'
        : 'Review the priority signals and continue with the next confident action.',
    },
  ];
}

function sectionMarkup(block: SpecularPreviewBlock) {
  const title = escapeJsxText(block.title);
  const eyebrow = block.eyebrow ? `<p className="text-[10px] font-black uppercase tracking-[0.34em] text-[#b3471d]">${escapeJsxText(block.eyebrow)}</p>` : '';
  const body = block.body ? `<p className="mt-3 max-w-2xl text-sm leading-6 text-[#4a3829]">${escapeJsxText(block.body)}</p>` : '';
  const items = (block.items || []).map((item) => `<li className="rounded-[1.4rem] border border-[#17110a]/10 bg-[#fffaf0] px-4 py-3 text-sm font-medium leading-5 text-[#24170e] shadow-[0_14px_34px_rgba(67,38,18,0.08)]">${escapeJsxText(item)}</li>`).join('');

  switch (block.kind) {
    case 'metrics':
      return `
        <section className="rounded-[2rem] border border-[#17110a]/10 bg-[#f3dec2] p-5 shadow-[0_24px_70px_rgba(89,52,24,0.12)]">
          ${eyebrow}
          <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-[#17110a]">${title}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            ${items}
          </div>
        </section>`;
    case 'list':
    case 'activity':
      return `
        <section className="rounded-[2rem] border border-[#17110a]/10 bg-[#fff7e6] p-5">
          ${eyebrow}
          <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-[#17110a]">${title}</h2>
          <ul className="mt-4 space-y-2">
            ${items}
          </ul>
        </section>`;
    case 'cta':
      return `
        <section className="rounded-[2rem] bg-[#17110a] p-5 text-[#fff7e6] shadow-[0_28px_80px_rgba(23,17,10,0.28)]">
          ${eyebrow}
          <h2 className="mt-1 text-2xl font-black tracking-[-0.05em]">${title}</h2>
          ${block.body ? `<p className="mt-3 max-w-2xl text-sm leading-6 text-[#f3dec2]">${escapeJsxText(block.body)}</p>` : ''}
          <div className="mt-4 flex flex-wrap gap-3">
            <button className="rounded-full bg-[#ffb000] px-5 py-3 text-sm font-black text-[#17110a] shadow-[0_12px_30px_rgba(255,176,0,0.26)]">Primary action</button>
            <button className="rounded-full border border-[#fff7e6]/25 px-5 py-3 text-sm font-bold text-[#fff7e6]">Secondary action</button>
          </div>
        </section>`;
    case 'detail':
      return `
        <section className="rounded-[2rem] border border-[#b3471d]/20 bg-[#ffe0bd] p-5">
          ${eyebrow}
          <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-[#17110a]">${title}</h2>
          ${body}
        </section>`;
    case 'hero':
    default:
      return `
        <section className="relative overflow-hidden rounded-[2.4rem] bg-[#ffb000] p-6 shadow-[0_30px_90px_rgba(123,74,22,0.22)]">
          <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-[#17110a]/12" />
          <div className="pointer-events-none absolute -bottom-20 left-10 h-56 w-56 rounded-full border border-[#17110a]/15" />
          <div className="relative">
            ${eyebrow}
            <h1 className="mt-3 max-w-3xl text-[clamp(2.6rem,12vw,6rem)] font-black leading-[0.86] tracking-[-0.08em] text-[#17110a]">${title}</h1>
            ${body}
          </div>
        </section>`;
  }
}

export function serializePreviewArtifactToTsx(artifact: SpecularPreviewArtifact, previewState: SpecularPreviewState) {
  const rootPadding = previewState.density === 'compact' ? 'p-4' : 'p-6';
  const rootTone = previewState.emphasis === 'editorial'
    ? 'bg-[#f8eed8]'
    : previewState.emphasis === 'dashboard'
      ? 'bg-[#edf4e7]'
      : 'bg-[#fff7e6]';
  const blockMarkup = artifact.blocks.map((block) => sectionMarkup(block)).join('\n');

  return `import React from 'react';

export function ${artifact.componentName}() {
  return (
    <div className=\"min-h-screen ${rootTone} ${rootPadding} text-[#17110a]\">
      <div className=\"mx-auto flex w-full max-w-6xl flex-col gap-4 overflow-hidden\" data-retrobuilder-vanguard=\"${escapeJsxText(artifact.summary)}\">
        ${blockMarkup}
      </div>
    </div>
  );
}
`;
}

export function defaultPreviewState(screenType: SpecularScreenType): SpecularPreviewState {
  if (screenType === 'dashboard') {
    return { density: 'compact', emphasis: 'dashboard' };
  }
  if (screenType === 'landing') {
    return { density: 'comfortable', emphasis: 'editorial' };
  }
  return { density: 'comfortable', emphasis: 'product' };
}

export function applyPreviewStateToArtifact(
  artifact: SpecularPreviewArtifact,
  previewState: SpecularPreviewState,
): SpecularPreviewArtifact {
  return {
    ...artifact,
    tsx: serializePreviewArtifactToTsx(artifact, previewState),
  };
}

export function generateSpecularVariants(
  node: SpecularNodeInput,
  references: SpecularReferenceCandidate[],
): SpecularVariantCandidate[] {
  const screenType = inferScreenType(node);
  const patternReferences = references.filter((reference) => reference.source === 'retrobuilder-vanguard').slice(0, 3);
  const patternVariants: Array<Pick<SpecularVariantCandidate, 'label' | 'description' | 'flavor'>> = patternReferences.map((reference, index) => {
    const flavor: SpecularVariantCandidate['flavor'] = index === 0 ? 'editorial' : index === 1 ? 'control' : 'conversational';
    return {
      label: reference.title,
      description: `${reference.sourcePromptName || 'Retrobuilder vanguard'} adapted as a stack-translatable product surface for ${node.label}.`,
      flavor,
    };
  });
  const fallbackVariants: Array<Pick<SpecularVariantCandidate, 'label' | 'description' | 'flavor'>> = [
    {
      label: 'Cinematic Product Story',
      description: 'A bold thesis-first surface with a memorable visual signature.',
      flavor: 'editorial',
    },
    {
      label: 'Motion Operating Surface',
      description: 'A denser operator surface with purposeful data and action choreography.',
      flavor: 'control',
    },
    {
      label: screenType === 'chat' ? 'Conversation Motion Rail' : 'Guided Conversion Ritual',
      description: screenType === 'chat'
        ? 'A conversational layout that keeps assistant output central while preserving product polish.'
        : 'A guided surface that narrows attention to the next meaningful step.',
      flavor: 'conversational',
    },
  ];
  const variants: Array<Pick<SpecularVariantCandidate, 'label' | 'description' | 'flavor'>> = patternVariants.length >= 3
    ? patternVariants
    : [...patternVariants, ...fallbackVariants].slice(0, 3);

  return variants.map((variant, index) => {
    const variantReferences = references.slice(index % Math.max(references.length, 1), (index % Math.max(references.length, 1)) + 2);
    const normalizedReferences = variantReferences.length > 0 ? variantReferences : references.slice(0, 2);
    const blocks = buildBlockSet(node, screenType, variant.flavor, normalizedReferences);
    const artifact: SpecularPreviewArtifact = {
      kind: 'tsx',
      componentName: `${toPascalCase(node.label)}${toPascalCase(variant.label)}Preview`,
      screenType,
      summary: `${variant.label} - Retrobuilder vanguard ${screenType} surface for ${node.label}; patterns: ${referenceSignature(normalizedReferences)}; stack translation: ${patternIntent(normalizedReferences)}`,
      blocks,
      tsx: '',
    };
    const previewState = defaultPreviewState(screenType);

    return {
      id: `${slug(node.id)}-${slug(variant.label)}`,
      label: variant.label,
      description: variant.description,
      flavor: variant.flavor,
      screenType,
      referenceIds: normalizedReferences.map((reference) => reference.id),
      previewArtifact: applyPreviewStateToArtifact(artifact, previewState),
      designVerdict: {
        status: 'pending',
        score: 0,
        findings: [],
        evidence: [],
      },
    };
  });
}
