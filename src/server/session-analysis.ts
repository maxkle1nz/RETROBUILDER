import {
  type SessionDocument,
} from './session-store.js';
export { type SessionAdvancedReport } from './session-advanced.js';
import {
  analyzeBlueprintGaps as analyzeBlueprintGapsFromInsights,
  analyzeBlueprintImpact as analyzeBlueprintImpactFromInsights,
} from './session-insights.js';
import {
  computeTopology,
  type AnalysisIssue,
  type BuildOrderEntry,
} from './session-topology.js';
import { ensureProjection, withProjectedSession } from './session-projection.js';

export type ReadinessStatus = 'ready' | 'blocked' | 'needs_review';

export interface BlueprintReadinessReport {
  status: ReadinessStatus;
  exportAllowed: boolean;
  blockers: AnalysisIssue[];
  warnings: AnalysisIssue[];
  buildOrder: BuildOrderEntry[];
  stats: {
    totalNodes: number;
    totalLinks: number;
    acceptanceCoverage: number;
    contractCoverage: number;
    errorHandlingCoverage: number;
    hasCycles: boolean;
    unresolvedLinkCount: number;
    groundingQuality: 'degraded' | 'medium' | 'high';
  };
  projection: {
    prepared: boolean;
    runtimeDir: string;
    preparedAt?: string;
  };
}

export interface BlueprintImpactReport {
  nodeId: string;
  nodeLabel: string;
  upstream: BuildOrderEntry[];
  downstream: BuildOrderEntry[];
  changedTogether: BuildOrderEntry[];
  explanation: string;
  semanticRelated: string[];
}

export interface BlueprintGapReport {
  blockers: AnalysisIssue[];
  warnings: AnalysisIssue[];
  missingAcceptanceCriteria: BuildOrderEntry[];
  missingContracts: BuildOrderEntry[];
  missingErrorHandling: BuildOrderEntry[];
  suggestedModules: string[];
  semanticHints: string[];
}

function safePct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

export async function activateSessionQuery(session: SessionDocument, query: string, topK = 12) {
  return withProjectedSession(session, async (projection, bridge) => {
    if (!projection.prepared || !bridge.isConnected) {
      return { error: 'm1nd offline or projection unavailable' };
    }
    return bridge.activate(query, topK);
  });
}


export async function analyzeSessionReadiness(session: SessionDocument): Promise<BlueprintReadinessReport> {
  const topology = computeTopology(session.graph);
  const blockers: AnalysisIssue[] = [];
  const warnings: AnalysisIssue[] = [];

  if (session.graph.nodes.length === 0) {
    blockers.push({ code: 'EMPTY_BLUEPRINT', message: 'The session has no modules yet.' });
  }
  if (topology.hasCycles) {
    blockers.push({
      code: 'CYCLE_DETECTED',
      message: 'The blueprint contains cyclic dependencies and cannot be exported to Ralph.',
      nodeIds: topology.cycleNodeIds,
    });
  }
  blockers.push(...topology.unresolvedLinks);

  const duplicateIds = session.graph.nodes
    .map((node) => node.id)
    .filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    blockers.push({
      code: 'DUPLICATE_NODE_IDS',
      message: `Duplicate node IDs found: ${duplicateIds.join(', ')}`,
      nodeIds: duplicateIds,
    });
  }

  const missingCriteria = session.graph.nodes.filter((node) => (node.acceptance_criteria?.length || 0) === 0);
  if (missingCriteria.length > 0) {
    blockers.push({
      code: 'MISSING_ACCEPTANCE_CRITERIA',
      message: `${missingCriteria.length} module(s) still have no acceptance criteria.`,
      nodeIds: missingCriteria.map((node) => node.id),
    });
  }

  const thinCriteria = session.graph.nodes.filter((node) => {
    const count = node.acceptance_criteria?.length || 0;
    return count > 0 && count < 2;
  });
  if (thinCriteria.length > 0) {
    warnings.push({
      code: 'THIN_ACCEPTANCE_CRITERIA',
      message: `${thinCriteria.length} module(s) have only one acceptance criterion.`,
      nodeIds: thinCriteria.map((node) => node.id),
    });
  }

  const missingContracts = session.graph.nodes.filter((node) => !node.data_contract?.trim());
  if (missingContracts.length > 0) {
    warnings.push({
      code: 'MISSING_DATA_CONTRACT',
      message: `${missingContracts.length} module(s) still have no data contract.`,
      nodeIds: missingContracts.map((node) => node.id),
    });
  }

  const missingErrorHandling = session.graph.nodes.filter((node) => (node.error_handling?.length || 0) === 0);
  if (missingErrorHandling.length > 0) {
    warnings.push({
      code: 'MISSING_ERROR_HANDLING',
      message: `${missingErrorHandling.length} module(s) have no error handling notes.`,
      nodeIds: missingErrorHandling.map((node) => node.id),
    });
  }

  const incorrectPriorities = session.graph.nodes.filter((node) => {
    if (!node.priority) return false;
    const computed = topology.buildOrder.find((entry) => entry.id === node.id)?.priority;
    return computed !== undefined && computed !== node.priority;
  });
  if (incorrectPriorities.length > 0) {
    warnings.push({
      code: 'PRIORITY_DRIFT',
      message: `${incorrectPriorities.length} module(s) have priorities that drift from the computed build order.`,
      nodeIds: incorrectPriorities.map((node) => node.id),
    });
  }

  const projection = await ensureProjection(session);
  const status: ReadinessStatus = blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'needs_review' : 'ready';

  return {
    status,
    exportAllowed: blockers.length === 0,
    blockers,
    warnings,
    buildOrder: topology.buildOrder,
    stats: {
      totalNodes: session.graph.nodes.length,
      totalLinks: session.graph.links.length,
      acceptanceCoverage: safePct(session.graph.nodes.length - missingCriteria.length, session.graph.nodes.length),
      contractCoverage: safePct(session.graph.nodes.length - missingContracts.length, session.graph.nodes.length),
      errorHandlingCoverage: safePct(session.graph.nodes.length - missingErrorHandling.length, session.graph.nodes.length),
      hasCycles: topology.hasCycles,
      unresolvedLinkCount: topology.unresolvedLinks.length,
      groundingQuality: !projection.prepared
        ? 'degraded'
        : session.source === 'imported_codebase'
          ? 'high'
          : 'medium',
    },
    projection,
  };
}

export async function analyzeBlueprintImpact(session: SessionDocument, nodeId: string): Promise<BlueprintImpactReport> {
  return analyzeBlueprintImpactFromInsights(session, nodeId);
}

export async function analyzeBlueprintGaps(session: SessionDocument): Promise<BlueprintGapReport> {
  const readiness = await analyzeSessionReadiness(session);
  return analyzeBlueprintGapsFromInsights(session, readiness);
}
