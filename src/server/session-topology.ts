import { type SessionGraphData, type SessionNodeData } from './session-store.js';

export interface AnalysisIssue {
  code: string;
  message: string;
  nodeIds?: string[];
}

export interface BuildOrderEntry {
  id: string;
  label: string;
  priority: number;
}

export interface TopologyResult {
  buildOrder: BuildOrderEntry[];
  hasCycles: boolean;
  cycleNodeIds: string[];
  unresolvedLinks: AnalysisIssue[];
  byId: Map<string, SessionNodeData>;
  upstream: Map<string, Set<string>>;
  downstream: Map<string, Set<string>>;
}

function toBuildEntry(node: SessionNodeData, priority: number): BuildOrderEntry {
  return { id: node.id, label: node.label, priority };
}

export function computeTopology(graph: SessionGraphData): TopologyResult {
  const byId = new Map<string, SessionNodeData>();
  const inDegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  const unresolvedLinks: AnalysisIssue[] = [];

  for (const node of graph.nodes) {
    byId.set(node.id, node);
    inDegree.set(node.id, 0);
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  }

  for (const link of graph.links) {
    if (!byId.has(link.source) || !byId.has(link.target)) {
      unresolvedLinks.push({
        code: 'UNRESOLVED_LINK',
        message: `Link ${link.source} -> ${link.target} references a missing node.`,
        nodeIds: [link.source, link.target],
      });
      continue;
    }
    outgoing.get(link.source)!.push(link.target);
    incoming.get(link.target)!.push(link.source);
    inDegree.set(link.target, (inDegree.get(link.target) || 0) + 1);
  }

  const queue = [...graph.nodes.filter((node) => (inDegree.get(node.id) || 0) === 0).map((node) => node.id)];
  const buildOrder: BuildOrderEntry[] = [];
  const levelMap = new Map<string, number>();

  while (queue.length > 0) {
    const batch = [...queue];
    queue.length = 0;

    for (const id of batch) {
      const parents = incoming.get(id) || [];
      const computedPriority = parents.length === 0
        ? 1
        : Math.max(...parents.map((parentId) => levelMap.get(parentId) || 1)) + 1;
      levelMap.set(id, computedPriority);
      buildOrder.push(toBuildEntry(byId.get(id)!, computedPriority));

      for (const target of outgoing.get(id) || []) {
        inDegree.set(target, (inDegree.get(target) || 0) - 1);
        if ((inDegree.get(target) || 0) === 0) {
          queue.push(target);
        }
      }
    }
  }

  const cycleNodeIds = graph.nodes
    .filter((node) => !levelMap.has(node.id))
    .map((node) => node.id);

  return {
    buildOrder: buildOrder.sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label)),
    hasCycles: cycleNodeIds.length > 0,
    cycleNodeIds,
    unresolvedLinks,
    byId,
    upstream: new Map([...incoming.entries()].map(([k, v]) => [k, new Set(v)])),
    downstream: new Map([...outgoing.entries()].map(([k, v]) => [k, new Set(v)])),
  };
}

export function collectReachable(
  startId: string,
  graph: Map<string, Set<string>>,
  byId: Map<string, SessionNodeData>,
  buildOrder: BuildOrderEntry[],
) {
  const visited = new Set<string>();
  const stack = [...(graph.get(startId) || [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const next of graph.get(id) || []) {
      if (!visited.has(next)) stack.push(next);
    }
  }
  const priorities = new Map(buildOrder.map((entry) => [entry.id, entry.priority]));
  return [...visited]
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((node) => toBuildEntry(node!, priorities.get(node!.id) || 1))
    .sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label));
}

export function projectNodeEntry(node: SessionNodeData, priority: number) {
  return toBuildEntry(node, priority);
}
