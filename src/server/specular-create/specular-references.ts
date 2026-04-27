import type { SpecularNodeInput, SpecularReferenceCandidate, SpecularScreenType } from './specular-types.js';
import { getTasteReferenceCandidates } from '../design-taste/taste-catalog.js';
import { getVanguardPatternReferenceCandidates } from '../design-taste/vanguard-patterns.js';
import { isContextualRecordSurface, needsSchedulingControls } from '../scheduling-intent.js';

type ReferenceNodeContext = Pick<SpecularNodeInput, 'id' | 'label' | 'description' | 'type'> & Partial<Pick<
  SpecularNodeInput,
  'data_contract' | 'acceptance_criteria' | 'error_handling'
>>;

const SCREEN_KEYWORDS: Array<[SpecularScreenType, RegExp]> = [
  ['chat', /(chat|assistant|copilot|conversation|support|message)/i],
  ['form', /(form|input|settings|checkout|capture|editor|compose|booking|book\b|appointment|reservation|reserve|consult|consultation|intake|request|schedule|calendar|date|slot|availability)/i],
  ['list', /(list|table|catalog|feed|queue|timeline|directory)/i],
  ['wizard', /(wizard|onboard|flow|step|funnel|journey)/i],
  ['detail', /(detail|profile|record|order|case|insight)/i],
  ['dashboard', /(dashboard|metric|analytics|command|control|monitor|overview)/i],
  ['landing', /(hero|landing|marketing|homepage|story|showcase)/i],
];
const DATE_TIME_REFERENCE_PATTERN = /\b(date|time|calendar|appointment|scheduler|schedule|slot|wheel|availability)\b/i;
const ACTION_CONTROL_REFERENCE_PATTERN = /\b(button|action|cta|confirm|request|submit|radio|choice|ripple|state|form-input|premium-action|surface-interaction)\b/i;

const REFERENCE_LIBRARY: Record<SpecularScreenType, Array<Omit<SpecularReferenceCandidate, 'id' | 'source'>>> = {
  dashboard: [
    {
      title: 'Luminous control surfaces',
      category: 'Shaders',
      rationale: 'Use atmospheric depth and restrained glow to separate telemetry from chrome.',
      tags: ['control-room', 'glow', 'telemetry'],
    },
    {
      title: 'Feature grid with hard hierarchy',
      category: 'Features',
      rationale: 'Keep the main metric frame dominant and demote secondary modules clearly.',
      tags: ['grid', 'hierarchy', 'metrics'],
    },
    {
      title: 'Text-led operating shell',
      category: 'Text Components',
      rationale: 'A strong editorial header makes dashboards feel deliberate instead of utilitarian.',
      tags: ['editorial', 'headline', 'summary'],
    },
  ],
  form: [
    {
      title: 'Focused conversion shell',
      category: 'Calls to Action',
      rationale: 'Lead with one clear next step and avoid scattered actions.',
      tags: ['cta', 'focus', 'clarity'],
    },
    {
      title: 'Dense field rhythm',
      category: 'Buttons',
      rationale: 'Button weight and spacing should define the workflow without overexplaining it.',
      tags: ['buttons', 'form', 'workflow'],
    },
    {
      title: 'Context-first copy bands',
      category: 'Text Components',
      rationale: 'Short explainer copy near the form reduces ambiguity before input begins.',
      tags: ['copy', 'assistive', 'context'],
    },
  ],
  list: [
    {
      title: 'Feature-table cadence',
      category: 'Features',
      rationale: 'Rows need predictable rhythm so the eye can scan without fatigue.',
      tags: ['list', 'scan', 'cadence'],
    },
    {
      title: 'Ambient table framing',
      category: 'Shaders',
      rationale: 'Subtle depth around dense information prevents the UI from feeling flat.',
      tags: ['table', 'depth', 'scan'],
    },
    {
      title: 'Story-first section headers',
      category: 'Text Components',
      rationale: 'Use strong headers and section notes so a long list still feels guided.',
      tags: ['headers', 'sections', 'narrative'],
    },
  ],
  detail: [
    {
      title: 'Single-record spotlight',
      category: 'Features',
      rationale: 'Center the main record with supporting panels instead of making every detail equal.',
      tags: ['detail', 'spotlight', 'focus'],
    },
    {
      title: 'Proof bands and trust markers',
      category: 'Testimonials',
      rationale: 'Important details benefit from trust framing and supporting evidence.',
      tags: ['trust', 'evidence', 'detail'],
    },
    {
      title: 'Strong editorial masthead',
      category: 'Heros',
      rationale: 'A strong masthead helps detail views feel premium rather than admin-like.',
      tags: ['masthead', 'detail', 'premium'],
    },
  ],
  chat: [
    {
      title: 'Agent console with side context',
      category: 'AI Chat Components',
      rationale: 'Keep the conversation central while surfacing structured context in rails.',
      tags: ['chat', 'agent', 'context'],
    },
    {
      title: 'Trust-building response cadence',
      category: 'Text Components',
      rationale: 'Readable answer rhythm is essential when the interface is mostly language.',
      tags: ['chat', 'readability', 'cadence'],
    },
    {
      title: 'Action rail beneath dialogue',
      category: 'Buttons',
      rationale: 'Primary actions should live close to the conversation, not get lost elsewhere.',
      tags: ['chat', 'actions', 'flow'],
    },
  ],
  wizard: [
    {
      title: 'Step-by-step progression shell',
      category: 'Calls to Action',
      rationale: 'Make step progress explicit and keep forward motion visually obvious.',
      tags: ['wizard', 'steps', 'progress'],
    },
    {
      title: 'Feature stack with narrative checkpoints',
      category: 'Features',
      rationale: 'Each stage should feel like a checkpoint, not just another generic card.',
      tags: ['wizard', 'checkpoint', 'flow'],
    },
    {
      title: 'Calm typography between steps',
      category: 'Text Components',
      rationale: 'Spacing and tone should reduce anxiety while the user advances through the flow.',
      tags: ['wizard', 'calm', 'type'],
    },
  ],
  landing: [
    {
      title: 'Hero-first narrative canvas',
      category: 'Heros',
      rationale: 'Lead with a bold thesis and let the supporting blocks cascade underneath it.',
      tags: ['hero', 'narrative', 'marketing'],
    },
    {
      title: 'Proof-driven feature storytelling',
      category: 'Features',
      rationale: 'Use feature groupings that explain why the system matters, not just what it has.',
      tags: ['story', 'features', 'proof'],
    },
    {
      title: 'CTA rhythm with contrast',
      category: 'Calls to Action',
      rationale: 'Calls to action must be bold, limited, and clearly separate from body copy.',
      tags: ['cta', 'contrast', 'landing'],
    },
  ],
};

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'specular';
}

export function isUserFacingNode(node: Pick<SpecularNodeInput, 'type'>) {
  return node.type === 'frontend' || node.type === 'external';
}

function nodeReferenceText(node: ReferenceNodeContext) {
  return [
    node.label,
    node.description,
    node.data_contract,
    ...(node.acceptance_criteria || []),
    ...(node.error_handling || []),
  ].filter(Boolean).join(' ');
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

export function inferScreenType(node: Pick<SpecularNodeInput, 'type' | 'label' | 'description'> & Partial<Pick<SpecularNodeInput, 'data_contract' | 'acceptance_criteria' | 'error_handling'>>): SpecularScreenType {
  const haystack = nodeReferenceText(node as ReferenceNodeContext);
  if (isContextualRecordSurface(haystack)) {
    return 'detail';
  }

  for (const [screenType, pattern] of SCREEN_KEYWORDS) {
    if (pattern.test(haystack)) {
      return screenType;
    }
  }

  if (node.type === 'frontend') {
    return 'dashboard';
  }
  if (node.type === 'external') {
    return 'detail';
  }
  return 'detail';
}

export function get21stReferenceCandidates(node: ReferenceNodeContext): SpecularReferenceCandidate[] {
  const screenType = inferScreenType(node);
  const broadVanguardCandidates = getVanguardPatternReferenceCandidates(node, screenType, 24);
  const needsSchedulingReferences = needsSchedulingControls(nodeReferenceText(node));
  const vanguardCandidates = needsSchedulingReferences
    ? dedupeReferences([
      ...broadVanguardCandidates.filter((reference) => DATE_TIME_REFERENCE_PATTERN.test(referenceSearchText(reference))).slice(0, 2),
      ...broadVanguardCandidates.filter((reference) => ACTION_CONTROL_REFERENCE_PATTERN.test(referenceSearchText(reference))).slice(0, 2),
      ...broadVanguardCandidates,
    ]).slice(0, 4)
    : broadVanguardCandidates.slice(0, 4);
  const tasteCandidates = getTasteReferenceCandidates(node, screenType);
  const resolvedCandidates = dedupeReferences([...vanguardCandidates, ...tasteCandidates]);
  if (resolvedCandidates.length >= 3) {
    return resolvedCandidates.slice(0, 8);
  }

  const localCandidates: SpecularReferenceCandidate[] = REFERENCE_LIBRARY[screenType].map((entry, index) => ({
    id: `${slug(node.id)}-${screenType}-${index + 1}`,
    title: entry.title,
    category: entry.category,
    rationale: `${entry.rationale} Applied to ${node.label}.`,
    tags: entry.tags,
    source: '21st-local',
  }));
  return dedupeReferences([...resolvedCandidates, ...localCandidates]).slice(0, 8);
}

function dedupeReferences(references: SpecularReferenceCandidate[]) {
  const seen = new Set<string>();
  const deduped: SpecularReferenceCandidate[] = [];
  for (const reference of references) {
    const key = reference.id || `${reference.source}:${reference.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(reference);
  }
  return deduped;
}
