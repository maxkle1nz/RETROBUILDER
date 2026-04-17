import { type SessionDocument, type SessionNodeData } from './session-store.js';

const SEMANTIC_RESULT_FIELDS = [
  'label',
  'title',
  'name',
  'intent_summary',
  'summary',
  'description',
  'snippet',
  'preview',
  'text',
  'content',
  'node_id',
  'external_id',
  'id',
] as const;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'node';
}

function normalizeSemanticToken(value: string) {
  return value
    .replace(/\s*\{#.*?\}\s*$/g, ' ')
    .replace(/\[(.*?)\]\(#.*?\)/g, '$1')
    .replace(/[`*_>#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSemanticModuleIndex(nodes: SessionNodeData[]) {
  const aliasToLabel = new Map<string, string>();
  const normalizedLabels = nodes.map((node) => ({
    label: node.label,
    normalizedLabel: normalizeSemanticToken(node.label),
  }));

  for (const node of nodes) {
    const aliases = new Set<string>([
      normalizeSemanticToken(node.label),
      normalizeSemanticToken(node.id),
      normalizeSemanticToken(slugify(node.label)),
    ]);

    for (const alias of aliases) {
      if (alias) aliasToLabel.set(alias, node.label);
    }
  }

  return { aliasToLabel, normalizedLabels };
}

function resolveSemanticModuleLabel(
  candidate: string,
  currentNodeLabel: string,
  moduleIndex: ReturnType<typeof buildSemanticModuleIndex>,
) {
  const normalized = normalizeSemanticToken(candidate);
  if (!normalized) return null;

  const exact = moduleIndex.aliasToLabel.get(normalized);
  if (exact && exact !== currentNodeLabel) {
    return exact;
  }

  if (normalized.length < 6) {
    return null;
  }

  const fuzzyMatches = moduleIndex.normalizedLabels.filter(({ normalizedLabel }) =>
    normalizedLabel.includes(normalized) || normalized.includes(normalizedLabel),
  );

  if (fuzzyMatches.length === 1 && fuzzyMatches[0].label !== currentNodeLabel) {
    return fuzzyMatches[0].label;
  }

  return null;
}

function extractSemanticCandidates(value: unknown): string[] {
  if (typeof value !== 'string') return [];

  const text = value.trim();
  if (!text) return [];

  const candidates: string[] = [];
  const seen = new Set<string>();
  const push = (candidate: string) => {
    const trimmed = candidate.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    candidates.push(trimmed);
  };

  for (const match of text.matchAll(/\[([^\]]+)\]\(#([^)]+)\)/g)) {
    push(match[1]);
    push(match[2]);
  }

  for (const match of text.matchAll(/(?:^|::|#|\/)([a-z0-9][a-z0-9-]{2,})$/gi)) {
    push(match[1]);
  }

  const cleaned = text
    .replace(/\s*\{#.*?\}\s*$/g, ' ')
    .replace(/^[>\s]+/g, '')
    .replace(/^(?:depends|drives|powered by|used by|consumes|produces|calls|uses|reads|writes|supports|connects to)\s*:\s*/i, '')
    .replace(/\[(.*?)\]\(#.*?\)/g, '$1')
    .replace(/[`*_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned) {
    push(cleaned);
    for (const part of cleaned.split(/\s*(?:,|;|\||\band\b)\s*/i)) {
      push(part);
    }
  }

  return candidates;
}

export function extractSemanticRelatedModules(results: any[], session: SessionDocument, node: SessionNodeData): string[] {
  if (!Array.isArray(results) || results.length === 0) return [];

  const moduleIndex = buildSemanticModuleIndex(session.graph.nodes);
  const related: string[] = [];
  const seenLabels = new Set<string>([node.label]);

  const maybeAdd = (candidate: string) => {
    const resolved = resolveSemanticModuleLabel(candidate, node.label, moduleIndex);
    if (!resolved || seenLabels.has(resolved)) return;
    seenLabels.add(resolved);
    related.push(resolved);
  };

  for (const item of results) {
    if (typeof item === 'string') {
      for (const candidate of extractSemanticCandidates(item)) {
        maybeAdd(candidate);
      }
    } else if (item && typeof item === 'object') {
      for (const field of SEMANTIC_RESULT_FIELDS) {
        for (const candidate of extractSemanticCandidates(item[field])) {
          maybeAdd(candidate);
        }
      }
    }

    if (related.length >= 5) break;
  }

  return related.slice(0, 5);
}
