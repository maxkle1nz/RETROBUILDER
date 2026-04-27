/**
 * Graph Integrity Engine — P0 Structural Enforcement
 * 
 * Validates that AI-generated graphs satisfy DAG invariants:
 * - No cycles (Tarjan's SCC)
 * - Priority consistency (child.priority > parent.priority)
 * - No dangling links (source/target must exist)
 * - Orphan detection (nodes with no connections)
 * - Connected component analysis (structural holes)
 * 
 * Returns a structured report with errors (blocking) and warnings (advisory).
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface IntegrityNode {
  id: string;
  label?: string;
  priority?: number;
  [key: string]: any;
}

export interface IntegrityLink {
  source: string;
  target: string;
  label?: string;
}

export interface IntegrityIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  nodes?: string[];
  links?: Array<{ source: string; target: string }>;
}

export interface IntegrityReport {
  valid: boolean;
  errors: IntegrityIssue[];
  warnings: IntegrityIssue[];
  stats: {
    nodeCount: number;
    linkCount: number;
    cycleCount: number;
    orphanCount: number;
    danglingLinkCount: number;
    connectedComponents: number;
  };
  /** If auto-repair was applied, this contains the cleaned graph */
  repaired?: { nodes: IntegrityNode[]; links: IntegrityLink[] };
}

// ─── Tarjan's SCC — Cycle Detection ─────────────────────────────────

/**
 * Find all strongly connected components using Tarjan's algorithm.
 * Any SCC with size > 1 is a cycle.
 */
function findCycles(nodes: IntegrityNode[], links: IntegrityLink[]): string[][] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const l of links) {
    if (nodeIds.has(l.source) && nodeIds.has(l.target)) {
      adj.get(l.source)!.push(l.target);
    }
  }

  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const sccs: string[][] = [];

  function strongConnect(v: string) {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) ?? []) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      if (scc.length > 1) {
        sccs.push(scc);
      }
    }
  }

  for (const id of nodeIds) {
    if (!indices.has(id)) {
      strongConnect(id);
    }
  }

  return sccs;
}

// ─── Priority Validation ────────────────────────────────────────────

/**
 * Check that no node has a priority ≤ any of its dependencies.
 * In a DAG with links source→target meaning "source depends on target",
 * we validate: for each link, source.priority should be > target.priority
 * (if priorities are defined).
 * 
 * Note: In RETROBUILDER's schema, links go source→target meaning
 * "source feeds into target" (data flow), so target depends on source.
 * Therefore: target.priority should be >= source.priority.
 */
function checkPriorities(
  nodes: IntegrityNode[],
  links: IntegrityLink[],
): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  for (const link of links) {
    const source = nodeMap.get(link.source);
    const target = nodeMap.get(link.target);
    if (!source || !target) continue;

    const sp = source.priority;
    const tp = target.priority;
    if (sp != null && tp != null && tp < sp) {
      issues.push({
        code: 'PRIORITY_INVERSION',
        severity: 'warning',
        message: `Priority inversion: "${source.label || source.id}" (P${sp}) feeds "${target.label || target.id}" (P${tp}) — target should have priority ≥ ${sp}`,
        nodes: [source.id, target.id],
        links: [{ source: link.source, target: link.target }],
      });
    }
  }

  return issues;
}

// ─── Link Validation ────────────────────────────────────────────────

/**
 * Detect links referencing non-existent nodes.
 */
function checkDanglingLinks(
  nodes: IntegrityNode[],
  links: IntegrityLink[],
): { issues: IntegrityIssue[]; validLinks: IntegrityLink[]; danglingCount: number } {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const issues: IntegrityIssue[] = [];
  const validLinks: IntegrityLink[] = [];
  let danglingCount = 0;

  for (const link of links) {
    const srcExists = nodeIds.has(link.source);
    const tgtExists = nodeIds.has(link.target);

    if (!srcExists || !tgtExists) {
      danglingCount++;
      const missing = [];
      if (!srcExists) missing.push(`source "${link.source}"`);
      if (!tgtExists) missing.push(`target "${link.target}"`);
      issues.push({
        code: 'DANGLING_LINK',
        severity: 'error',
        message: `Link references non-existent ${missing.join(' and ')}: ${link.source} → ${link.target}`,
        links: [{ source: link.source, target: link.target }],
      });
    } else if (link.source === link.target) {
      danglingCount++;
      issues.push({
        code: 'SELF_LOOP',
        severity: 'error',
        message: `Self-loop detected: "${link.source}" links to itself`,
        nodes: [link.source],
        links: [{ source: link.source, target: link.target }],
      });
    } else {
      validLinks.push(link);
    }
  }

  return { issues, validLinks, danglingCount };
}

// ─── Orphan Detection ───────────────────────────────────────────────

/**
 * Find nodes with no incoming AND no outgoing edges.
 * A single root (no incoming) or leaf (no outgoing) is fine.
 * A node with ZERO connections is suspicious.
 */
function checkOrphans(
  nodes: IntegrityNode[],
  links: IntegrityLink[],
): IntegrityIssue[] {
  if (nodes.length <= 1) return []; // Single node graphs are fine

  const hasIncoming = new Set<string>();
  const hasOutgoing = new Set<string>();

  for (const link of links) {
    hasOutgoing.add(link.source);
    hasIncoming.add(link.target);
  }

  const orphans = nodes.filter(
    (n) => !hasIncoming.has(n.id) && !hasOutgoing.has(n.id),
  );

  if (orphans.length === 0) return [];

  return [
    {
      code: 'ORPHAN_NODES',
      severity: 'warning',
      message: `${orphans.length} orphan node(s) with no connections: ${orphans.map((n) => `"${n.label || n.id}"`).join(', ')}`,
      nodes: orphans.map((n) => n.id),
    },
  ];
}

// ─── Connected Components ───────────────────────────────────────────

/**
 * Count connected components (treating graph as undirected).
 * Multiple components indicate structural holes.
 */
function countConnectedComponents(
  nodes: IntegrityNode[],
  links: IntegrityLink[],
): number {
  if (nodes.length === 0) return 0;

  const nodeIds = new Set(nodes.map((n) => n.id));
  const adj = new Map<string, Set<string>>();
  for (const id of nodeIds) adj.set(id, new Set());
  for (const l of links) {
    if (nodeIds.has(l.source) && nodeIds.has(l.target)) {
      adj.get(l.source)!.add(l.target);
      adj.get(l.target)!.add(l.source);
    }
  }

  const visited = new Set<string>();
  let components = 0;

  for (const id of nodeIds) {
    if (visited.has(id)) continue;
    components++;
    // BFS
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const neighbor of adj.get(current) ?? []) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }
  }

  return components;
}

// ─── Duplicate Link Detection ───────────────────────────────────────

/**
 * Remove duplicate links (same source→target pair).
 */
function deduplicateLinks(links: IntegrityLink[]): IntegrityLink[] {
  const seen = new Set<string>();
  const unique: IntegrityLink[] = [];
  for (const link of links) {
    const key = `${link.source}→${link.target}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(link);
    }
  }
  return unique;
}

// ─── Main Enforcement Function ──────────────────────────────────────

/**
 * Run all DAG invariant checks on a graph.
 * 
 * @param nodes - Array of graph nodes
 * @param links - Array of graph links  
 * @param options.autoRepair - If true, strip invalid links and return repaired graph
 * @param options.strict - If true, treat warnings as errors
 * @returns IntegrityReport with errors, warnings, and optional repaired graph
 */
export function enforceDAGInvariants(
  nodes: IntegrityNode[],
  links: IntegrityLink[],
  options: { autoRepair?: boolean; strict?: boolean } = {},
): IntegrityReport {
  const { autoRepair = true, strict = false } = options;
  const errors: IntegrityIssue[] = [];
  const warnings: IntegrityIssue[] = [];

  // 1. Deduplicate links
  let cleanLinks = deduplicateLinks(links);

  // 2. Dangling link detection (+ auto-strip)
  const { issues: danglingIssues, validLinks, danglingCount } = checkDanglingLinks(nodes, cleanLinks);
  errors.push(...danglingIssues);
  if (autoRepair) {
    cleanLinks = validLinks;
  }

  // 3. Cycle detection (Tarjan's SCC)
  const cycles = findCycles(nodes, cleanLinks);
  for (const cycle of cycles) {
    const labels = cycle.map((id) => {
      const node = nodes.find((n) => n.id === id);
      return `"${node?.label || id}"`;
    });
    errors.push({
      code: 'CYCLE_DETECTED',
      severity: 'error',
      message: `Circular dependency detected: ${labels.join(' → ')} → ${labels[0]}`,
      nodes: cycle,
    });
  }

  // 4. Priority validation
  const priorityIssues = checkPriorities(nodes, cleanLinks);
  if (strict) {
    errors.push(...priorityIssues);
  } else {
    warnings.push(...priorityIssues);
  }

  // 5. Orphan detection
  const orphanIssues = checkOrphans(nodes, cleanLinks);
  if (strict) {
    errors.push(...orphanIssues);
  } else {
    warnings.push(...orphanIssues);
  }

  // 6. Connected components
  const components = countConnectedComponents(nodes, cleanLinks);
  if (components > 1) {
    warnings.push({
      code: 'STRUCTURAL_HOLES',
      severity: 'warning',
      message: `Graph has ${components} disconnected components — consider adding cross-connections`,
    });
  }

  // Build report
  const report: IntegrityReport = {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      nodeCount: nodes.length,
      linkCount: cleanLinks.length,
      cycleCount: cycles.length,
      orphanCount: nodes.filter(
        (n) =>
          !cleanLinks.some((l) => l.source === n.id || l.target === n.id),
      ).length,
      danglingLinkCount: danglingCount,
      connectedComponents: components,
    },
  };

  if (autoRepair) {
    report.repaired = { nodes, links: cleanLinks };
  }

  return report;
}

// ─── Cycle Breaker (Auto-Repair) ────────────────────────────────────

/**
 * Attempt to break cycles by removing the minimum number of edges.
 * Uses a simple heuristic: remove the edge in each SCC that creates
 * the longest back-edge (the one whose target has the lowest priority).
 */
export function breakCycles(
  nodes: IntegrityNode[],
  links: IntegrityLink[],
): { links: IntegrityLink[]; removed: IntegrityLink[] } {
  let currentLinks = [...links];
  const removed: IntegrityLink[] = [];

  while (removed.length < links.length) {
    const cycles = findCycles(nodes, currentLinks);
    if (cycles.length === 0) break;

    // Remove one edge, then recompute SCCs. Dense graphs can need more than
    // ten removals, so the hard bound is the original edge count.
    const cycleSet = new Set(cycles[0]);
    let bestEdgeIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < currentLinks.length; i++) {
      const link = currentLinks[i];
      if (cycleSet.has(link.source) && cycleSet.has(link.target)) {
        const sourceNode = nodes.find((n) => n.id === link.source);
        const targetNode = nodes.find((n) => n.id === link.target);
        // Score: prefer removing back-edges (higher priority -> lower priority).
        const score = (sourceNode?.priority ?? 0) - (targetNode?.priority ?? 0);
        if (score > bestScore) {
          bestScore = score;
          bestEdgeIdx = i;
        }
      }
    }

    if (bestEdgeIdx < 0) {
      break;
    }

    removed.push(currentLinks[bestEdgeIdx]);
    currentLinks.splice(bestEdgeIdx, 1);
  }

  return { links: currentLinks, removed };
}
