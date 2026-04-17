/**
 * connectionRules.ts
 * SSOT for node-type compatibility and smart connection suggestion.
 * All edge-creation intelligence lives here — zero UI dependencies.
 */

import type { GraphData, NodeData, LinkData } from './api';

// ─── Type aliases ──────────────────────────────────────────────────────────────

export type NodeType = 'frontend' | 'backend' | 'database' | 'security' | 'external';

// ─── Affinity matrix ───────────────────────────────────────────────────────────
// Defines which target types a source node type may meaningfully connect to.
// Order matters: first = most natural connection.

export const CONNECTION_AFFINITY: Record<NodeType, NodeType[]> = {
  frontend:  ['backend', 'security', 'external'],
  backend:   ['database', 'backend', 'external', 'security'],
  database:  ['backend'],
  security:  ['backend', 'frontend'],
  external:  ['backend', 'frontend'],
};

// ─── Edge auto-label vocabulary ────────────────────────────────────────────────
// Used when ConnectionSuggester creates an edge without an explicit label.

const EDGE_LABELS: Record<NodeType, Partial<Record<NodeType, string>>> = {
  frontend:  { backend: 'calls', security: 'authenticates via', external: 'integrates' },
  backend:   { database: 'persists to', backend: 'delegates to', external: 'integrates', security: 'validates via' },
  database:  { backend: 'serves' },
  security:  { backend: 'guards', frontend: 'secures' },
  external:  { backend: 'pushes to', frontend: 'feeds' },
};

export function getAutoEdgeLabel(sourceType: NodeType, targetType: NodeType): string {
  return EDGE_LABELS[sourceType]?.[targetType] ?? 'connects to';
}

// ─── Suggestion scoring ────────────────────────────────────────────────────────

export interface ConnectionCandidate {
  node: NodeData;
  score: number;         // 0–1, higher = better match
  reason: string;        // Human-readable reason for the suggestion
  autoLabel: string;     // Edge label that will be used if accepted
}

/**
 * suggestConnections
 *
 * Given a source node and the full graph, returns the top candidates for
 * new connections. Applies:
 *   1. Type affinity filtering
 *   2. Already-connected exclusion
 *   3. Scoring: same group (0.3) + affinity rank (0.4) + naming proximity (0.3)
 */
export function suggestConnections(
  sourceId: string,
  graphData: GraphData,
  maxResults = 5,
): ConnectionCandidate[] {
  const source = graphData.nodes.find((n) => n.id === sourceId);
  if (!source) return [];

  const sourceType = (source.type ?? 'backend') as NodeType;
  const allowedTargetTypes = CONNECTION_AFFINITY[sourceType] ?? [];

  // Existing connections (bidirectional)
  const connectedIds = new Set<string>(
    graphData.links
      .filter((l) => l.source === sourceId || l.target === sourceId)
      .flatMap((l) => [l.source, l.target]),
  );
  connectedIds.add(sourceId); // exclude self

  // Already outgoing targets (directed) — exclude these from suggestions
  const outgoingTargets = new Set<string>(
    graphData.links.filter((l) => l.source === sourceId).map((l) => l.target),
  );

  const candidates: ConnectionCandidate[] = [];

  for (const node of graphData.nodes) {
    if (outgoingTargets.has(node.id)) continue; // already connected outgoing
    if (node.id === sourceId) continue;

    const targetType = (node.type ?? 'backend') as NodeType;
    const affinityIndex = allowedTargetTypes.indexOf(targetType);
    if (affinityIndex === -1) continue; // not compatible

    // Affinity score: first in list = 1.0, last = 0.25
    const affinityScore = 1 - (affinityIndex / allowedTargetTypes.length) * 0.75;

    // Group score: same group = bonus
    const groupScore = node.group === source.group ? 0.3 : 0;

    // Name proximity: shared tokens in label
    const srcTokens = source.label.toLowerCase().split(/\W+/);
    const tgtTokens = node.label.toLowerCase().split(/\W+/);
    const shared = srcTokens.filter((t) => t.length > 2 && tgtTokens.includes(t)).length;
    const nameScore = Math.min(shared * 0.15, 0.3);

    const score = affinityScore * 0.4 + groupScore + nameScore;

    const reason =
      groupScore > 0
        ? `Same group · ${targetType} dependency`
        : `${sourceType} → ${targetType} affinity`;

    candidates.push({
      node,
      score,
      reason,
      autoLabel: getAutoEdgeLabel(sourceType, targetType),
    });
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

/**
 * isAlreadyConnected — quick check used by ConnectionSuggester.
 */
export function isAlreadyConnected(
  sourceId: string,
  targetId: string,
  links: LinkData[],
): boolean {
  return links.some(
    (l) =>
      (l.source === sourceId && l.target === targetId) ||
      (l.source === targetId && l.target === sourceId),
  );
}
