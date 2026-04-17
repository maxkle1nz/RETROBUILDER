import {
  type SessionDocument,
} from './session-store.js';
export { type SessionAdvancedReport } from './session-advanced.js';
export { analyzeSessionReadiness } from './session-readiness.js';
import {
  analyzeBlueprintGaps as analyzeBlueprintGapsFromInsights,
  analyzeBlueprintImpact as analyzeBlueprintImpactFromInsights,
} from './session-insights.js';
import {
  computeTopology,
  type AnalysisIssue,
  type BuildOrderEntry,
} from './session-topology.js';
import { withProjectedSession } from './session-projection.js';
import { analyzeSessionReadiness } from './session-readiness.js';

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

export async function activateSessionQuery(session: SessionDocument, query: string, topK = 12) {
  return withProjectedSession(session, async (projection, bridge) => {
    if (!projection.prepared || !bridge.isConnected) {
      return { error: 'm1nd offline or projection unavailable' };
    }
    return bridge.activate(query, topK);
  });
}

export async function analyzeBlueprintImpact(session: SessionDocument, nodeId: string): Promise<BlueprintImpactReport> {
  return analyzeBlueprintImpactFromInsights(session, nodeId);
}

export async function analyzeBlueprintGaps(session: SessionDocument): Promise<BlueprintGapReport> {
  const readiness = await analyzeSessionReadiness(session);
  return analyzeBlueprintGapsFromInsights(session, readiness);
}
