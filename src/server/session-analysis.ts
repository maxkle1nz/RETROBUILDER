import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  getRuntimeDirectory,
  type SessionDocument,
  type SessionGraphData,
  type SessionNodeData,
} from './session-store.js';
import { getM1ndBridge } from './m1nd-bridge.js';

export type ReadinessStatus = 'ready' | 'blocked' | 'needs_review';

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

export interface SessionAdvancedReport {
  action: 'health' | 'layers' | 'metrics' | 'diagram' | 'impact' | 'predict';
  data: any;
  projection: {
    prepared: boolean;
    runtimeDir: string;
    preparedAt?: string;
  };
}

interface TopologyResult {
  buildOrder: BuildOrderEntry[];
  hasCycles: boolean;
  cycleNodeIds: string[];
  unresolvedLinks: AnalysisIssue[];
  byId: Map<string, SessionNodeData>;
  upstream: Map<string, Set<string>>;
  downstream: Map<string, Set<string>>;
}

const preparedSessions = new Map<string, string>();
const runtimeArtifactFingerprints = new Map<string, string>();
let lastProjectedSessionId: string | null = null;

function toBuildEntry(node: SessionNodeData, priority: number): BuildOrderEntry {
  return { id: node.id, label: node.label, priority };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'node';
}

function safePct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function computeTopology(graph: SessionGraphData): TopologyResult {
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

function collectReachable(startId: string, graph: Map<string, Set<string>>, byId: Map<string, SessionNodeData>, buildOrder: BuildOrderEntry[]) {
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

async function writeRuntimeArtifacts(session: SessionDocument, fingerprint: string) {
  const runtimeDir = getRuntimeDirectory(session.id);
  if (runtimeArtifactFingerprints.get(session.id) === fingerprint) {
    return runtimeDir;
  }
  const nodesDir = path.join(runtimeDir, 'nodes');
  await mkdir(nodesDir, { recursive: true });

  const blueprint = {
    session: {
      id: session.id,
      name: session.name,
      source: session.source,
      updatedAt: session.updatedAt,
    },
    nodes: session.graph.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      type: n.type,
      status: n.status,
      priority: n.priority,
      description: n.description,
      data_contract: n.data_contract,
      decision_rationale: n.decision_rationale,
      acceptance_criteria: n.acceptance_criteria,
      error_handling: n.error_handling,
      // STRIPPED: researchContext, researchMeta, constructionNotes
      // These fields bias m1nd toward semantic/document weight over structural topology
    })),
    links: session.graph.links,
  };

  await writeFile(path.join(runtimeDir, 'blueprint.json'), JSON.stringify(blueprint, null, 2));
  await writeFile(path.join(runtimeDir, 'manifesto.md'), session.manifesto || '# Manifesto\n');
  await writeFile(path.join(runtimeDir, 'architecture.md'), session.architecture || '# Architecture\n');

  const graphIndex = [
    `# ${session.name}`,
    '',
    `Source: ${session.source}`,
    `Updated: ${session.updatedAt}`,
    '',
    '## Modules',
    ...session.graph.nodes.map((node) => `- ${node.label} (${node.type})`),
  ].join('\n');
  await writeFile(path.join(runtimeDir, 'session.md'), graphIndex);

  // ─── Structural Topology for m1nd ─────────────────────────────────────
  // Write a single topology.md with explicit markdown cross-references.
  // m1nd's auto adapter creates edges from [Label](#anchor) links,
  // giving us ~N nodes / ~M edges matching the blueprint — NOT the 791-node
  // document-dominated graph from ingesting the full runtime directory.
  const topologyLines: string[] = [
    `# ${session.name} — Blueprint Topology`,
    '',
    `> ${session.graph.nodes.length} modules, ${session.graph.links.length} dependencies`,
    '',
  ];

  for (const node of session.graph.nodes) {
    const deps = session.graph.links
      .filter((l) => l.target === node.id)
      .map((l) => {
        const src = session.graph.nodes.find((n) => n.id === l.source);
        return src ? `[${src.label}](#${src.id})` : l.source;
      });
    const drives = session.graph.links
      .filter((l) => l.source === node.id)
      .map((l) => {
        const tgt = session.graph.nodes.find((n) => n.id === l.target);
        return tgt ? `[${tgt.label}](#${tgt.id})` : l.target;
      });

    topologyLines.push(
      `## ${node.label} {#${node.id}}`,
      '',
      `- **ID**: \`${node.id}\``,
      `- **Type**: ${node.type}`,
      `- **Status**: ${node.status || 'active'}`,
      '',
      node.description || '',
      '',
      '### Depends On',
      ...(deps.length ? deps.map((d) => `- ${d}`) : ['- None']),
      '',
      '### Drives',
      ...(drives.length ? drives.map((d) => `- ${d}`) : ['- None']),
      '',
      '---',
      '',
    );
  }

  await writeFile(path.join(runtimeDir, 'topology.md'), topologyLines.join('\n'));

  for (const node of session.graph.nodes) {
    const dependsOn = session.graph.links
      .filter((link) => link.target === node.id)
      .map((link) => session.graph.nodes.find((candidate) => candidate.id === link.source)?.label || link.source);
    const fanOut = session.graph.links
      .filter((link) => link.source === node.id)
      .map((link) => session.graph.nodes.find((candidate) => candidate.id === link.target)?.label || link.target);

    const doc = [
      `# ${node.label}`,
      '',
      `- id: ${node.id}`,
      `- type: ${node.type}`,
      `- status: ${node.status}`,
      `- priority: ${node.priority ?? 'unassigned'}`,
      '',
      '## Description',
      node.description || 'No description provided.',
      '',
      '## Data Contract',
      node.data_contract || 'Missing data contract.',
      '',
      '## Decision Rationale',
      node.decision_rationale || 'No rationale recorded.',
      '',
      '## Acceptance Criteria',
      ...(node.acceptance_criteria?.length
        ? node.acceptance_criteria.map((criterion) => `- ${criterion}`)
        : ['- Missing acceptance criteria']),
      '',
      '## Error Handling',
      ...(node.error_handling?.length
        ? node.error_handling.map((item) => `- ${item}`)
        : ['- Missing error handling notes']),
      '',
      '## Depends On',
      ...(dependsOn.length ? dependsOn.map((item) => `- ${item}`) : ['- None']),
      '',
      '## Drives',
      ...(fanOut.length ? fanOut.map((item) => `- ${item}`) : ['- None']),
    ].join('\n');

    await writeFile(path.join(nodesDir, `${slugify(node.label)}-${node.id}.md`), doc);
  }

  runtimeArtifactFingerprints.set(session.id, fingerprint);
  return runtimeDir;
}

function projectionFingerprint(session: SessionDocument) {
  return crypto
    .createHash('sha1')
    .update(
      JSON.stringify({
        id: session.id,
        name: session.name,
        source: session.source,
        manifesto: session.manifesto,
        architecture: session.architecture,
        projectContext: session.projectContext,
        importMeta: session.importMeta || null,
        graph: session.graph,
      }),
    )
    .digest('hex');
}

async function ensureProjectionUnlocked(session: SessionDocument) {
  const bridge = getM1ndBridge();
  const fingerprint = projectionFingerprint(session);
  const runtimeDir = await writeRuntimeArtifacts(session, fingerprint);

  if (!bridge.isConnected) {
    return { prepared: false, runtimeDir };
  }

  if (preparedSessions.get(session.id) === fingerprint && lastProjectedSessionId === session.id) {
    return { prepared: true, runtimeDir, preparedAt: session.updatedAt };
  }

  try {
    // Ingest ONLY the structural topology — NOT the full runtime directory.
    // The full dir produces ~791 document-dominated nodes; topology.md gives
    // ~N blueprint modules with ~M explicit dependency edges.
    const topoPath = path.join(runtimeDir, 'topology.md');
    await bridge.ingest(topoPath, 'auto', 'replace');
    preparedSessions.set(session.id, fingerprint);
    lastProjectedSessionId = session.id;
    return { prepared: true, runtimeDir, preparedAt: session.updatedAt };
  } catch (error) {
    console.warn('[session-analysis] Failed to project session into m1nd:', error);
    return { prepared: false, runtimeDir };
  }
}

async function withProjectedSession<T>(
  session: SessionDocument,
  work: (projection: { prepared: boolean; runtimeDir: string; preparedAt?: string }, bridge: ReturnType<typeof getM1ndBridge>) => Promise<T>,
) {
  const bridge = getM1ndBridge();
  return bridge.runExclusive(async () => {
    const projection = await ensureProjectionUnlocked(session);
    return work(projection, bridge);
  });
}

async function ensureProjection(session: SessionDocument) {
  return withProjectedSession(session, async (projection) => projection);
}

export async function activateSessionQuery(session: SessionDocument, query: string, topK = 12) {
  return withProjectedSession(session, async (projection, bridge) => {
    if (!projection.prepared || !bridge.isConnected) {
      return { error: 'm1nd offline or projection unavailable' };
    }
    return bridge.activate(query, topK);
  });
}

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
  const topology = computeTopology(session.graph);
  const node = topology.byId.get(nodeId);
  if (!node) {
    throw new Error(`Node not found in session: ${nodeId}`);
  }

  let semanticRelated: string[] = [];

  await withProjectedSession(session, async (projection, bridge) => {
    if (!projection.prepared || !bridge.isConnected) return;
    try {
      const result = await bridge.seek(`${node.label} ${node.description}`, 5);
      semanticRelated = (result?.results || [])
        .map((item: any) => item.label || item.intent_summary)
        .filter(Boolean)
        .filter((label: string) => label !== node.label)
        .slice(0, 5);
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
    .map((neighbor) => toBuildEntry(neighbor!, priorities.get(neighbor!.id) || 1))
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

export async function analyzeBlueprintGaps(session: SessionDocument): Promise<BlueprintGapReport> {
  const readiness = await analyzeSessionReadiness(session);
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
  const projectNode = (node: SessionNodeData) => toBuildEntry(node, priorities.get(node.id) || node.priority || 1);

  return {
    blockers: readiness.blockers,
    warnings: readiness.warnings,
    missingAcceptanceCriteria: session.graph.nodes.filter((node) => (node.acceptance_criteria?.length || 0) === 0).map(projectNode),
    missingContracts: session.graph.nodes.filter((node) => !node.data_contract?.trim()).map(projectNode),
    missingErrorHandling: session.graph.nodes.filter((node) => (node.error_handling?.length || 0) === 0).map(projectNode),
    suggestedModules: computeSuggestedModules(session),
    semanticHints,
  };
}

/**
 * Resolve a blueprint node ID to a m1nd-canonical ID via activation.
 * Blueprint IDs (e.g. "api-gateway") may not match m1nd's canonical IDs
 * after projection (e.g. "file::topology.md::api-gateway"). This function
 * uses activate() to find the closest canonical match by label.
 */
async function resolveNodeId(
  nodeId: string,
  session: SessionDocument,
  bridge: ReturnType<typeof getM1ndBridge>,
): Promise<string> {
  const node = session.graph.nodes.find((n) => n.id === nodeId);
  if (!node) return nodeId;

  try {
    const result = await bridge.activate(node.label, 3);
    const candidates = result?.activated || result?.results || result?.seeds || [];
    if (candidates.length > 0) {
      // Prefer exact label match, then closest activation
      const exact = candidates.find(
        (c: any) => (c.label || '').toLowerCase() === node.label.toLowerCase(),
      );
      const best = exact || candidates[0];
      return best.node_id || best.external_id || best.id || nodeId;
    }
  } catch {
    // Activation failed — fall through to raw ID
  }
  return nodeId;
}

export async function runSessionAdvancedAction(
  session: SessionDocument,
  action: SessionAdvancedReport['action'],
  nodeId?: string,
): Promise<SessionAdvancedReport> {
  return withProjectedSession(session, async (projection, bridge) => {
    if (!projection.prepared || !bridge.isConnected) {
      return {
        action,
        data: { error: 'm1nd offline or projection unavailable' },
        projection,
      };
    }

    let data: any = null;
    switch (action) {
      case 'health':
        data = await bridge.health();
        break;
      case 'layers':
        data = await bridge.layers();
        break;
      case 'metrics':
        data = await bridge.metrics(undefined, 15);
        break;
      case 'diagram':
        data = nodeId
          ? await bridge.diagram(await resolveNodeId(nodeId, session, bridge), 2, 'mermaid')
          : await bridge.diagram(undefined, 2, 'mermaid');
        break;
      case 'impact':
        data = nodeId
          ? await bridge.impact(await resolveNodeId(nodeId, session, bridge))
          : { error: 'Select a node first.' };
        break;
      case 'predict':
        data = nodeId
          ? await bridge.predict(await resolveNodeId(nodeId, session, bridge))
          : { error: 'Select a node first.' };
        break;
      default:
        data = { error: 'Unsupported advanced action.' };
    }

    return { action, data, projection };
  });
}
