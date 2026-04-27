import { SPECULAR_21ST_PROFILE, SPECULAR_DESIGN_PROFILE } from './specular-profile.js';
import { needsSchedulingControls } from '../scheduling-intent.js';
import type {
  ActiveProductDnaContract,
} from '../product-dna/product-dna-types.js';
import type {
  SpecularBuildDesignSummary,
  SpecularCreatePayload,
  SpecularDesignVerdict,
  SpecularNodeInput,
  SpecularPreviewArtifact,
  SpecularPreviewState,
  SpecularReferenceCandidate,
} from './specular-types.js';

interface VerdictInput {
  previewArtifact: SpecularPreviewArtifact;
  previewState: SpecularPreviewState;
  referenceCandidates: SpecularReferenceCandidate[];
  selectedReferenceIds: string[];
  activeProductDnaContract?: ActiveProductDnaContract;
}

const PRODUCT_ACTION_PATTERN = /\b(book|order|request|confirm|schedule|subscribe|send|message|checkout|contact|save|review|continue|open|reply|operate|trigger|delivery|whatsapp)\b/i;
const DATE_TIME_REFERENCE_PATTERN = /\b(date|time|calendar|appointment|scheduler|schedule|slot|wheel|availability)\b/i;
const ACTION_CONTROL_REFERENCE_PATTERN = /\b(button|action|cta|confirm|request|submit|radio|choice|ripple|state|form-input|premium-action|surface-interaction)\b/i;
const DIAGNOSTIC_UI_PATTERNS = [
  /\bcompletion checklist\b/i,
  /\bfield contract\b/i,
  /\bdata\s+contract\b/i,
  /\bacceptance\s+criteria\b/i,
  /\bworkflow state\b/i,
  /\bpreview payload\b/i,
  /\bpending payload\b/i,
  /\bmodule\s+(spec|contract|id)\b/i,
  /\braw\s+(json|payload|response)\b/i,
  /\bdebug\b/i,
  /JSON\.stringify\s*\(/,
  /<pre\b/i,
  />\s*\{\s*["'][A-Za-z0-9_-]+["']\s*:/,
];
const HARD_GENERIC_VISUAL_PATTERNS = [
  /\bEditorial Signal\b/i,
  /\bControl Room\s+(?:\u2014|-)\s+a denser\b/i,
  /\bFocused Flow\b/i,
  /\bbg-black\/30\b/,
  /\bbg-white\/5\b/,
  /\btext-slate-[0-9]/,
  /\bradial-gradient\(circle_at_top_left/i,
  /\bdark glass\b/i,
  /\bflat card pile\b/i,
];
const GENERIC_COPY_VISUAL_PATTERN = /\bgeneric (placeholder|scaffold|dashboard|card|website|site|design)\b/gi;
const ANTI_GENERIC_CONTEXT_PATTERN = /\b(not|never|avoid|avoids|avoiding|without|instead of|rather than)\s+(?:a\s+)?$/i;

function previewText(input: VerdictInput) {
  return [
    input.previewArtifact.summary,
    input.previewArtifact.tsx,
    ...input.previewArtifact.blocks.flatMap((block) => [
      block.title,
      block.eyebrow || '',
      block.body || '',
      ...(block.items || []),
    ]),
  ].join('\n');
}

function nodeProductText(node: SpecularNodeInput) {
  return [
    node.label,
    node.description,
    node.data_contract,
    ...(node.acceptance_criteria || []),
    ...(node.error_handling || []),
  ].filter(Boolean).join('\n');
}

function selectedReferences(input: VerdictInput) {
  const selectedIds = new Set(input.selectedReferenceIds);
  return input.referenceCandidates.filter((reference) => selectedIds.has(reference.id));
}

function referenceSearchText(reference: SpecularReferenceCandidate) {
  return [
    reference.id,
    reference.title,
    reference.category,
    reference.componentKey,
    reference.patternId,
    reference.sourcePromptName,
    ...(reference.tags || []),
  ].filter(Boolean).join(' ');
}

function selectedReferenceMatches(input: VerdictInput, pattern: RegExp) {
  return selectedReferences(input).some((reference) => pattern.test(referenceSearchText(reference)));
}

function hasGenericVisualDebt(text: string) {
  if (HARD_GENERIC_VISUAL_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  for (const match of text.matchAll(GENERIC_COPY_VISUAL_PATTERN)) {
    const before = text.slice(Math.max(0, (match.index || 0) - 32), match.index || 0);
    if (!ANTI_GENERIC_CONTEXT_PATTERN.test(before)) {
      return true;
    }
  }

  return false;
}

export function evaluateSpecularVerdict(
  node: SpecularNodeInput,
  input: VerdictInput,
): SpecularDesignVerdict {
  let score = 68;
  const findings: string[] = [];
  const evidence: string[] = [
    `Profile: ${SPECULAR_DESIGN_PROFILE}`,
    `Blocks: ${input.previewArtifact.blocks.length}`,
    `Density: ${input.previewState.density}`,
    `Emphasis: ${input.previewState.emphasis}`,
  ];
  const activeDna = input.activeProductDnaContract;
  if (activeDna?.packBindings.length) {
    score += 4;
    evidence.push(`Product DNA packs active: ${activeDna.packBindings.map((binding) => binding.id).join(', ')}.`);
    if (activeDna.receipts.required.length) {
      evidence.push(`Product DNA required receipts: ${activeDna.receipts.required.slice(0, 5).join(', ')}.`);
    }
  }

  if (node.data_contract?.trim()) {
    score += 8;
    evidence.push('The product data model is explicit enough to drive safe UI states.');
  } else {
    findings.push('Missing explicit data contract for UI projection.');
  }

  if ((node.acceptance_criteria?.length || 0) >= 2) {
    score += 10;
    evidence.push('Acceptance criteria are strong enough to drive visible states.');
  } else {
    findings.push('Add at least two acceptance criteria so the preview reflects real product behavior.');
  }

  if ((node.error_handling?.length || 0) >= 1) {
    score += 6;
    evidence.push('Failure handling is represented in the surface narrative.');
  } else {
    findings.push('Add explicit error-handling notes so UI resilience is visible.');
  }

  if (input.referenceCandidates.length >= 3) {
    score += 8;
    evidence.push('21st-style references are available for design grounding.');
  } else {
    findings.push('Reference grounding is too thin; broaden the 21st inspiration set.');
  }

  const catalogReferences = input.referenceCandidates.filter((reference) => reference.source === '21st-catalog');
  const vanguardReferences = input.referenceCandidates.filter((reference) => reference.source === 'retrobuilder-vanguard');
  if (catalogReferences.length > 0) {
    score += 6;
    evidence.push(`Real 21st catalog references available: ${catalogReferences.slice(0, 2).map((reference) => reference.componentKey || reference.title).join(', ')}.`);
  } else {
    evidence.push('Real 21st catalog references were not resolved; using generic local taste labels as a fallback.');
  }

  if (vanguardReferences.length >= 3) {
    score += 10;
    evidence.push(`Retrobuilder vanguard database patterns available: ${vanguardReferences.slice(0, 3).map((reference) => reference.patternId || reference.title).join(', ')}.`);
  } else {
    findings.push('Retrobuilder vanguard design database grounding is missing or too thin.');
  }

  if (input.selectedReferenceIds.length > 0) {
    score += 6;
    evidence.push(`Selected references: ${input.selectedReferenceIds.length}.`);
  } else {
    findings.push('Pick at least one reference to anchor the visual direction.');
  }

  const selectedVanguardCount = input.referenceCandidates.filter((reference) => (
    reference.source === 'retrobuilder-vanguard' && input.selectedReferenceIds.includes(reference.id)
  )).length;
  if (selectedVanguardCount > 0) {
    score += 6;
    evidence.push(`Selected vanguard patterns: ${selectedVanguardCount}.`);
  } else {
    findings.push('Select at least one Retrobuilder vanguard pattern so stack translation has a concrete visual target.');
  }

  const productText = nodeProductText(node);
  const isSchedulingProduct = needsSchedulingControls(productText);
  if (isSchedulingProduct) {
    if (selectedReferenceMatches(input, DATE_TIME_REFERENCE_PATTERN)) {
      score += 8;
      evidence.push('Scheduling flow is anchored to a selected 21st date/time control reference.');
    } else {
      findings.push('Booking/scheduling surfaces must select a date/time reference such as Appointment Scheduler or Date Wheel Picker, not a generic hero/globe/table pattern.');
    }

    if (selectedReferenceMatches(input, ACTION_CONTROL_REFERENCE_PATTERN)) {
      score += 4;
      evidence.push('Scheduling flow is anchored to a selected 21st action/control reference.');
    } else {
      findings.push('Booking/scheduling surfaces must select a concrete action/control reference for buttons, choices, or submit states.');
    }
  }

  const blockCount = input.previewArtifact.blocks.length;
  if (blockCount >= 3 && blockCount <= SPECULAR_21ST_PROFILE.buildGate.maxBlocks) {
    score += 10;
    evidence.push('Preview respects the low-noise block budget.');
  } else if (blockCount > SPECULAR_21ST_PROFILE.buildGate.maxBlocks) {
    score -= 12;
    findings.push(`Preview has ${blockCount} blocks. Reduce it to ${SPECULAR_21ST_PROFILE.buildGate.maxBlocks} or fewer for stronger hierarchy.`);
  } else {
    findings.push('Preview needs at least three meaningful blocks to feel production-ready.');
  }

  const blockKinds = new Set(input.previewArtifact.blocks.map((block) => block.kind));
  if (blockKinds.size >= 3) {
    score += 6;
    evidence.push('The surface mixes hero, supporting, and action blocks.');
  } else {
    findings.push('The preview needs more block variety so the hierarchy reads instantly.');
  }

  if (input.previewState.emphasis === 'dashboard' && input.previewArtifact.screenType === 'dashboard') {
    score += 4;
  }
  if (input.previewState.emphasis === 'editorial' && input.previewArtifact.screenType === 'landing') {
    score += 4;
  }
  if (input.previewState.emphasis === 'product' && ['form', 'detail', 'wizard', 'chat'].includes(input.previewArtifact.screenType)) {
    score += 4;
  }

  if (input.previewArtifact.blocks.some((block) => block.kind === 'cta')) {
    score += 4;
    evidence.push('The surface ends with an explicit next action.');
  } else {
    findings.push('Add a stronger call-to-action block so the surface has a decisive end-state.');
  }

  const renderedPreviewText = previewText(input);
  if (DIAGNOSTIC_UI_PATTERNS.some((pattern) => pattern.test(renderedPreviewText))) {
    findings.push('Preview exposes implementation or diagnostic language instead of product-facing copy.');
  } else {
    score += 6;
    evidence.push('Preview copy stays product-facing and avoids raw implementation/debug language.');
  }

    if (hasGenericVisualDebt(renderedPreviewText)) {
    findings.push('Preview still uses generic dark/glass/card visual vocabulary instead of a vanguard pattern signature.');
  } else {
    score += 6;
    evidence.push('Preview avoids the known generic dark/glass/card visual vocabulary.');
  }

  if (PRODUCT_ACTION_PATTERN.test(renderedPreviewText)) {
    score += 4;
    evidence.push('Preview includes clear product action language.');
  } else {
    findings.push('Preview needs a concrete user action such as request, confirm, schedule, order, message, or continue.');
  }

  const criticalFindingCount = findings.filter((finding) => /Missing explicit data contract|Add at least two acceptance criteria/.test(finding)).length;
  if (criticalFindingCount > 0) {
    score = Math.min(score, 40);
  } else if (findings.length > 0) {
    score = Math.min(score, SPECULAR_21ST_PROFILE.buildGate.passScore - 1);
  }

  score = Math.max(0, Math.min(100, score));
  const hasCriticalFindings = criticalFindingCount > 0;

  return {
    status: score >= SPECULAR_21ST_PROFILE.buildGate.passScore && !hasCriticalFindings ? 'passed' : 'failed',
    score,
    findings,
    evidence,
  };
}

export function summarizeBuildDesignGate(payloads: SpecularCreatePayload[]): SpecularBuildDesignSummary {
  if (payloads.length === 0) {
    return {
      designProfile: SPECULAR_DESIGN_PROFILE,
      designGateStatus: 'passed',
      designScore: 100,
      designFindings: [],
      designEvidence: ['No user-facing nodes required UIX gate approval for this build.'],
      affectedNodeIds: [],
      failingNodeIds: [],
    };
  }

  const designScore = Math.round(
    payloads.reduce((sum, payload) => sum + payload.designVerdict.score, 0) / Math.max(payloads.length, 1),
  );
  const designFindings = payloads.flatMap((payload) => payload.designVerdict.findings.map((finding) => `${payload.nodeId}: ${finding}`));
  const designEvidence = payloads.map((payload) => {
    const variant = payload.variantCandidates.find((candidate) => candidate.id === payload.selectedVariantId);
    return `${payload.nodeId}: ${payload.designVerdict.score}/100 via ${variant?.label || payload.selectedVariantId}`;
  });
  const designGateStatus = payloads.every((payload) => payload.designVerdict.status === 'passed') ? 'passed' : 'failed';
  const failingNodeIds = payloads.filter((payload) => payload.designVerdict.status !== 'passed').map((payload) => payload.nodeId);

  return {
    designProfile: SPECULAR_DESIGN_PROFILE,
    designGateStatus,
    designScore,
    designFindings,
    designEvidence,
    affectedNodeIds: payloads.map((payload) => payload.nodeId),
    failingNodeIds,
  };
}
