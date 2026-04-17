import { type BlueprintGapReport, type BlueprintImpactReport, type BlueprintReadinessReport } from './session-analysis.js';
import { getM1ndBridge } from './m1nd-bridge.js';
import { withProjectedSession } from './session-projection.js';
import { extractSemanticRelatedModules } from './session-semantic.js';
import { collectReachable, computeTopology, projectNodeEntry } from './session-topology.js';
import { type SessionDocument, type SessionNodeData } from './session-store.js';

function computeSuggestedModules(session: SessionDocument) {
  const types = new Set(session.graph.nodes.map((node) => node.type));
  const suggestions: string[] = [];

  if (!types.has('security') && (types.has('backend') || types.has('external'))) {
    suggestions.push('Security / auth boundary module');
  }
  if (!types.has('database') && types.has('backend')) {
    suggestions.push('Persistence / storage module');
  }
  if (!types.has('frontend') && session.graph.nodes.length > 3) {
    suggestions.push('Interface / operator surface module');
  }
  if (!session.graph.nodes.some((node) => (node.error_handling?.length || 0) > 0)) {
    suggestions.push('Shared reliability / error handling policy');
  }

  return suggestions;
}

export async function analyzeBlueprintImpact(session: SessionDocument, nodeId: string): Promise<BlueprintImpactReport> {
  const topology = computeTopology(session.graph);
  const node = topology.byId.get(nodeId);
  if (!node) {
    throw new Error(`Node not found in session: ${nodeId}`);
  }

  let semanticRelated: string[] = [];

  await withProjectedSession(session, async (projection, bridge) => {
    if (!projection.prepared || !bridge.isConnected) return;
    try {
      const result = await bridge.seek(`${node.label} ${node.id}`, 12);
      semanticRelated = extractSemanticRelatedModules(result?.results || [], session, node);
    } catch {
      semanticRelated = [];
    }
  });

  const upstream = collectReachable(node.id, topology.upstream, topology.byId, topology.buildOrder);
  const downstream = collectReachable(node.id, topology.downstream, topology.byId, topology.buildOrder);
  const directNeighbors = new Set<string>([
    ...(topology.upstream.get(node.id) || new Set()),
    ...(topology.downstream.get(node.id) || new Set()),
  ]);
  const priorities = new Map(topology.buildOrder.map((entry) => [entry.id, entry.priority]));
  const changedTogether = [...directNeighbors]
    .map((id) => topology.byId.get(id))
    .filter(Boolean)
    .map((neighbor) => projectNodeEntry(neighbor!, priorities.get(neighbor!.id) || 1))
    .sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label));

  return {
    nodeId: node.id,
    nodeLabel: node.label,
    upstream,
    downstream,
    changedTogether,
    explanation: `${node.label} influences ${downstream.length} downstream module(s) and depends on ${upstream.length} upstream module(s).`,
    semanticRelated,
  };
}

export async function analyzeBlueprintGaps(
  session: SessionDocument,
  readiness: BlueprintReadinessReport,
) {
  const topology = computeTopology(session.graph);
  const semanticHints: string[] = [];

  await withProjectedSession(session, async (projection, bridge) => {
    if (!readiness.projection.prepared || !bridge.isConnected) return;
    try {
      const result = await bridge.missing(`${session.name} blueprint architecture gaps`);
      const hints = result?.holes || result?.suggestions || result?.findings || [];
      for (const hint of hints.slice(0, 5)) {
        if (typeof hint === 'string') {
          semanticHints.push(hint);
        } else if (hint?.description) {
          semanticHints.push(hint.description);
        } else if (hint?.message) {
          semanticHints.push(hint.message);
        }
      }
    } catch {
      // Best effort only.
    }
  });

  const priorities = new Map(topology.buildOrder.map((entry) => [entry.id, entry.priority]));
  const projectNode = (node: SessionNodeData) => projectNodeEntry(node, priorities.get(node.id) || node.priority || 1);

  return {
    blockers: readiness.blockers,
    warnings: readiness.warnings,
    missingAcceptanceCriteria: session.graph.nodes.filter((node) => (node.acceptance_criteria?.length || 0) === 0).map(projectNode),
    missingContracts: session.graph.nodes.filter((node) => !node.data_contract?.trim()).map(projectNode),
    missingErrorHandling: session.graph.nodes.filter((node) => (node.error_handling?.length || 0) === 0).map(projectNode),
    suggestedModules: computeSuggestedModules(session),
    semanticHints,
  } as BlueprintGapReport;
}
