import type { ActiveProductDnaContract } from './product-dna/product-dna-types.js';
import type { SpecularReferenceCandidate } from './specular-create/specular-types.js';

interface CleanDesignerNode {
  id: string;
  label: string;
  type?: string;
  description?: string;
  designProfile?: string;
  referenceCandidates?: SpecularReferenceCandidate[];
  selectedReferenceIds?: string[];
  selectedProductDnaPackIds?: string[];
  activeProductDnaContract?: ActiveProductDnaContract;
  designVerdict?: {
    status?: string;
    score?: number;
    findings?: string[];
    evidence?: string[];
  };
}

function summarizeProductDnaContract(contract: ActiveProductDnaContract | undefined) {
  if (!contract?.packBindings.length) return '';

  const packSummary = contract.packBindings
    .map((binding) => `${binding.id}@${binding.version}`)
    .join(', ');
  const failValidators = contract.validators
    .filter((validator) => validator.severity === 'fail')
    .slice(0, 6)
    .map((validator) => `${validator.id}: ${validator.description}`);

  return [
    '- active Product DNA contract:',
    `  packs: ${packSummary}`,
    contract.promptDirectives.length ? `  directives: ${contract.promptDirectives.slice(0, 5).join(' | ')}` : '',
    contract.requiredElements.length ? `  required elements: ${contract.requiredElements.slice(0, 8).join(' | ')}` : '',
    contract.forbiddenPatterns.length ? `  forbidden patterns: ${contract.forbiddenPatterns.slice(0, 8).join(' | ')}` : '',
    contract.stackHints.length ? `  stack hints: ${contract.stackHints.slice(0, 5).join(' | ')}` : '',
    failValidators.length ? `  fail validators: ${failValidators.join(' | ')}` : '',
    contract.receipts.required.length ? `  required receipts: ${contract.receipts.required.slice(0, 8).join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

const CLEAN_CODEX_DESIGNER_RULES = [
  'Clean Codex Designer brief:',
  '- Run this as an isolated product-design lane. The visual direction comes from the product domain, selected 21st references, and the screen job-to-be-done.',
  '- Treat selected 21st references as primary design input, not decoration. Adapt their composition, motion logic, density, typography, interaction pattern, and hierarchy into the product surface.',
  '- Do not inherit house-style defaults from generated scaffolds, previous builds, runtime dashboards, or orchestration prompts.',
  '- Choose a fresh art direction per product: palette, type scale, spacing rhythm, surface material, imagery, and motion should feel domain-specific rather than reusable.',
  '- Avoid repeating the same warm cards, dark SaaS glass, centered hero, generic metrics grid, or debug-dashboard layout unless the selected reference and domain truly call for it.',
  '- Build product-grade screens with real customer copy, visible actions, clear state, accessible controls, responsive behavior, and no internal implementation language.',
  '- If a referenced dependency is unavailable, translate the design intent with local HTML, CSS, SVG, canvas, or small JavaScript rather than collapsing to a generic fallback.',
  '- Mobile is a real design target: make 390px feel composed, intentional, and safe from horizontal overflow or clipped content.',
].join('\n');

export const CLEAN_CODEX_DESIGNER_AGENTS_MD = [
  '# Clean Codex Designer',
  '',
  'You are operating in an isolated product-design workspace.',
  'Use the local module files, task prompt, and selected 21st references as your whole brief.',
  'Do not load project-local skills, orchestration workflows, runtime dashboards, or house-style prompt packs.',
  'Produce a product-grade customer surface with a fresh art direction for this domain.',
  'Prefer distinctive hierarchy, typography, motion, spacing, and interaction choices over reusable SaaS defaults.',
  'Keep edits inside the leased module path and verify the final filesystem state before stopping.',
].join('\n');

function isFrontendNode(node: CleanDesignerNode) {
  return (node.type || '').toLowerCase() === 'frontend';
}

function summarizeCleanReference(reference: SpecularReferenceCandidate) {
  return [
    `- ${reference.title} [${reference.source}${reference.componentKey ? `:${reference.componentKey}` : ''}]`,
    reference.category ? `  category: ${reference.category}` : '',
    reference.tasteScore != null ? `  tasteScore: ${reference.tasteScore}` : '',
    reference.previewUrl ? `  preview: ${reference.previewUrl}` : '',
    reference.promptUrl ? `  prompt: ${reference.promptUrl}` : '',
    reference.localPath ? `  local: ${reference.localPath}` : '',
    reference.dependencies?.length ? `  dependencies: ${reference.dependencies.join(', ')}` : '',
    reference.tags?.length ? `  tags: ${reference.tags.slice(0, 8).join(', ')}` : '',
    reference.implementationNotes?.length ? `  implementation notes: ${reference.implementationNotes.slice(0, 3).join(' ')}` : '',
    reference.mobileRules?.length ? `  mobile rules: ${reference.mobileRules.slice(0, 3).join(' ')}` : '',
    `  rationale: ${reference.rationale}`,
  ].filter(Boolean).join('\n');
}

export function buildCleanCodexDesignerBrief(node: CleanDesignerNode) {
  if (!isFrontendNode(node)) {
    return 'Clean Codex Designer brief: not a user-facing frontend; preserve exposed UX contracts without inventing visual chrome.';
  }

  const references = node.referenceCandidates || [];
  const selectedIds = new Set(node.selectedReferenceIds || []);
  const selectedReferences = references.filter((reference) => selectedIds.size === 0 || selectedIds.has(reference.id));
  const referencesForPrompt = (selectedReferences.length > 0 ? selectedReferences : references).slice(0, 4);
  const verdict = node.designVerdict;
  const productDnaContract = summarizeProductDnaContract(node.activeProductDnaContract);

  return [
    CLEAN_CODEX_DESIGNER_RULES,
    `- product surface: ${node.label}`,
    node.description ? `- product intent: ${node.description}` : '',
    `- designProfile: ${node.designProfile || '21st'}`,
    `- design verdict: ${verdict?.status || 'pending'}${typeof verdict?.score === 'number' ? ` (${verdict.score}/100)` : ''}`,
    verdict?.evidence?.length ? `- evidence to preserve: ${verdict.evidence.slice(0, 3).join(' | ')}` : '',
    verdict?.findings?.length ? `- findings to repair: ${verdict.findings.slice(0, 3).join(' | ')}` : '',
    productDnaContract,
    referencesForPrompt.length
      ? [
        '- selected 21st references:',
        referencesForPrompt.map(summarizeCleanReference).join('\n'),
      ].join('\n')
      : '- selected 21st references: none resolved; create a distinctive mobile-first product surface from the domain instead of a generic scaffold.',
    '- stack translation: first detect the available stack. If React/Tailwind/shadcn exists, implement the matching component family directly; otherwise preserve the reference composition with native primitives.',
    '- component fidelity gate: selected workflow references are mandatory, not moodboard names. If Date Wheel Picker, Appointment Scheduler, Button, Ripple, Radio, or another control is selected, the renderable source must contain a clear translated control with matching interaction semantics, visible state, and provenance in class/data names.',
    '- frontend quality bar: no placeholder copy, no default system-font-only feel, no flat card pile; use purposeful visual hierarchy, rich domain content, responsive layout, accessible controls, and meaningful empty/error/loading states.',
    '- mobile overflow gate: fit a 390px viewport without horizontal scrolling or clipped text. Include long-copy safeguards such as overflow-wrap:anywhere, word-break, min-width:0, max-width:100%, and flex/grid containment.',
  ].filter(Boolean).join('\n');
}
