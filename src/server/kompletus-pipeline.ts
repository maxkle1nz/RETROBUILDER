/**
 * KOMPLETUS Pipeline — Full Autonomous Blueprint Generation
 *
 * One prompt → production-grade, fully-researched, validated blueprint.
 *
 * Stages:
 *   1. KONSTRUKTOR — Generate skeleton
 *   2. HARDENER — Critic + Dreamer (fix + enhance)
 *   3. SMART TRIAGE — Classify nodes for research depth
 *   4. PARALLEL RESEARCH — Deep research on critical/standard nodes
 *   5. SPECULAR AUDIT — UIX parity mapping (user moments + screen map)
 *   6. L1GHT PRE-FLIGHT — Contract expansion + validation
 *   7. QUALITY GATE — Final review with self-heal loop
 */

import type { NodeData, GraphData } from '../lib/api.js';
import { generateGraphStructureWorkflow } from './ai-workflows.js';
import { performDeepResearchWorkflow } from './ai-workflows.js';
import { chatCompletionWithFallback } from './provider-runtime.js';
import type { ChatMessage } from './providers/index.js';
import { expandContractsWithResearch, validateCrossNodeContracts, generateSystemArtifacts } from './l1ght-preflight.js';
import {
  buildSpecularCreatePayload,
  buildSpecularDesignGate,
} from './specular-create/specular-service.js';
import type {
  SpecularBuildDesignSummary,
  SpecularCreatePayload,
} from './specular-create/specular-types.js';

// ─── Types ─────────────────────────────────────────────────────────────

export type KompletusStage =
  | 'konstruktor'
  | 'hardener'
  | 'triage'
  | 'research'
  | 'specular'
  | 'specular_create'
  | 'l1ght'
  | 'quality'
  | 'complete'
  | 'error';

export interface KompletusEvent {
  stage: KompletusStage;
  status: 'running' | 'done' | 'error';
  message?: string;
  data?: Record<string, unknown>;
}

export interface TriageResult {
  nodeId: string;
  label: string;
  depth: 'critical' | 'standard' | 'skip';
  reason: string;
}

// ─── SPECULAR AUDIT Types ───────────────────────────────────────────────

export interface UserMoment {
  id: string;
  label: string;
  backendStages: string[];
  userQuestion: string;
}

export interface NodeScreenEntry {
  nodeId: string;
  label: string;
  hasUserSurface: boolean;
  screenType?: string;
  userActions?: string[];
  dataDisplayed?: string[];
}

export interface CoverageEntry {
  backendPhase: string;
  momentId: string;
  momentLabel: string;
  confidence: number;
}

export interface SpecularAuditResult {
  moments: UserMoment[];
  coverage: CoverageEntry[];
  nodeScreenMap: NodeScreenEntry[];
  parityScore: number;
}

export interface KompletusResult {
  graph: GraphData;
  manifesto: string;
  architecture: string;
  explanation: string;
  research: Record<string, { report: string; meta: Record<string, unknown> }>;
  specular: SpecularAuditResult;
  specularCreate: {
    designProfile: '21st';
    artifacts: SpecularCreatePayload[];
    gate: SpecularBuildDesignSummary;
    warnings: string[];
  };
  l1ght: {
    expandedContracts: number;
    crossNodeIssues: number;
    artifacts: { routeMap?: string; envTemplate?: string; dbSchema?: string };
  };
  qualityGate: { passed: boolean; iterations: number; remainingIssues: string[] };
  meta: {
    totalTimeMs: number;
    stages: Record<string, { durationMs: number; details?: Record<string, unknown> }>;
  };
}

// ─── Smart Triage ──────────────────────────────────────────────────────

async function smartTriage(
  nodes: NodeData[],
  prompt: string,
  model?: string,
): Promise<TriageResult[]> {
  const nodeList = nodes.map(n => `- ${n.id}: "${n.label}" (type: ${n.type}) — ${n.description?.substring(0, 80) || 'no description'}`).join('\n');

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a research triage agent. Given a list of system modules, classify each one into:

- "critical": Needs full deep research (7+ sources including Scholar). Domain-specific, compliance-heavy, or external API integration modules.
- "standard": Needs quick research (Perplexity summary only). Well-known patterns but benefits from grounding.
- "skip": No research needed. Standard infrastructure with well-established patterns (databases, standard auth, basic frontends).

Return a JSON array: [{ "nodeId": "...", "depth": "critical"|"standard"|"skip", "reason": "..." }]

CRITICAL: Return ONLY the JSON array.`,
    },
    {
      role: 'user',
      content: `System description: ${prompt}\n\nModules:\n${nodeList}`,
    },
  ];

  try {
    const result = await chatCompletionWithFallback(messages, { jsonMode: true, model }, 'kompletus:triage');
    const parsed = JSON.parse(result.content);
    const arr = Array.isArray(parsed) ? parsed : parsed.triage || parsed.results || [];
    return arr.map((item: any) => ({
      nodeId: item.nodeId || item.node_id || item.id,
      label: nodes.find(n => n.id === (item.nodeId || item.node_id || item.id))?.label || item.nodeId,
      depth: ['critical', 'standard', 'skip'].includes(item.depth) ? item.depth : 'standard',
      reason: item.reason || '',
    }));
  } catch (e: any) {
    console.warn(`[KOMPLETUS] Triage failed, defaulting all to standard: ${e.message}`);
    return nodes.map(n => ({
      nodeId: n.id,
      label: n.label,
      depth: 'standard' as const,
      reason: 'Triage fallback — defaulting to standard research',
    }));
  }
}

// ─── Parallel Research ─────────────────────────────────────────────────

async function parallelResearch(
  nodes: NodeData[],
  triage: TriageResult[],
  projectContext: string,
  model: string | undefined,
  onProgress: (event: KompletusEvent) => void,
): Promise<Record<string, { report: string; meta: Record<string, unknown> }>> {
  const results: Record<string, { report: string; meta: Record<string, unknown> }> = {};

  const toResearch = triage.filter(t => t.depth !== 'skip');
  const criticalNodes = toResearch.filter(t => t.depth === 'critical');
  const standardNodes = toResearch.filter(t => t.depth === 'standard');

  // Batch size: 3 concurrent to respect rate limits
  const BATCH_SIZE = 3;
  let completed = 0;

  async function researchNode(triageItem: TriageResult) {
    const node = nodes.find(n => n.id === triageItem.nodeId);
    if (!node) return;

    try {
      onProgress({
        stage: 'research',
        status: 'running',
        message: `Researching: ${node.label} (${triageItem.depth})`,
        data: { current: node.label, progress: `${++completed}/${toResearch.length}` },
      });

      const result = await performDeepResearchWorkflow({ node, projectContext, model });
      results[node.id] = { report: result.research, meta: result.meta };
    } catch (e: any) {
      console.error(`[KOMPLETUS] Research failed for ${node.label}: ${e.message}`);
      results[node.id] = {
        report: `Research failed: ${e.message}. Using structural data only.`,
        meta: { error: e.message },
      };
    }
  }

  // Process critical first, then standard, in batches
  const allToResearch = [...criticalNodes, ...standardNodes];
  for (let i = 0; i < allToResearch.length; i += BATCH_SIZE) {
    const batch = allToResearch.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(batch.map(item => researchNode(item)));
  }

  return results;
}

// ─── SPECULAR AUDIT ────────────────────────────────────────────────────

async function specularAudit(
  nodes: NodeData[],
  research: Record<string, { report: string; meta: Record<string, unknown> }>,
  model?: string,
): Promise<SpecularAuditResult> {
  const nodeList = nodes.map(n =>
    `- ${n.id}: "${n.label}" (type: ${n.type}) — ${n.description?.substring(0, 100) || 'no description'}`
  ).join('\n');

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a SPECULAR AUDIT agent. You analyze system modules and create a UIX parity map that ensures every central and important backend phase has a corresponding user experience.

Your job:
1. Create 3-5 "User Moments" — consolidated phases the user sees during pipeline execution. Use DOMAIN LANGUAGE (not technical jargon). Each moment maps to one or more backend stages.
2. For each node, determine if it needs a user-facing screen. Backend-only nodes (databases, auth services, queues) do NOT need screens. Frontend, dashboard, and user-interaction nodes DO.
3. For nodes that need screens, specify: screenType (dashboard, form, list, calendar, chat, detail, wizard), userActions (what can the user DO), dataDisplayed (what does the user SEE).
4. Calculate a parity score (0-100): what percentage of user-facing functionality has clear UIX coverage.

PARSIMÔNIA RULE: Maximum 5 user moments. Consolidate related backend stages. Never expose internal implementation details to the user.

Return JSON:
{
  "moments": [{ "id": "m1", "label": "human-readable moment", "backendStages": ["stage1"], "userQuestion": "what would the user ask?" }],
  "nodeScreenMap": [{ "nodeId": "...", "label": "...", "hasUserSurface": true/false, "screenType": "dashboard|form|list|calendar|chat|detail|wizard", "userActions": ["action1"], "dataDisplayed": ["field1"] }],
  "coverage": [{ "backendPhase": "stageName", "momentId": "m1", "momentLabel": "...", "confidence": 0.95 }],
  "parityScore": 85
}

Return ONLY the JSON.`,
    },
    {
      role: 'user',
      content: `Analyze these ${nodes.length} system modules for UIX parity:\n\n${nodeList}`,
    },
  ];

  try {
    const result = await chatCompletionWithFallback(messages, { jsonMode: true, model }, 'kompletus:specular');
    const parsed = JSON.parse(result.content);

    return {
      moments: Array.isArray(parsed.moments) ? parsed.moments.slice(0, 5) : [],
      coverage: Array.isArray(parsed.coverage) ? parsed.coverage : [],
      nodeScreenMap: Array.isArray(parsed.nodeScreenMap)
        ? parsed.nodeScreenMap.map((entry: any) => ({
          nodeId: entry.nodeId || entry.node_id,
          label: entry.label || nodes.find(n => n.id === (entry.nodeId || entry.node_id))?.label || '',
          hasUserSurface: !!entry.hasUserSurface,
          screenType: entry.screenType,
          userActions: Array.isArray(entry.userActions) ? entry.userActions : [],
          dataDisplayed: Array.isArray(entry.dataDisplayed) ? entry.dataDisplayed : [],
        }))
        : [],
      parityScore: typeof parsed.parityScore === 'number' ? Math.min(100, Math.max(0, parsed.parityScore)) : 0,
    };
  } catch (e: any) {
    console.warn(`[KOMPLETUS] SPECULAR audit LLM failed, using deterministic fallback: ${e.message}`);

    // Deterministic fallback: derive from node types
    const frontendNodes = nodes.filter(n => ['frontend', 'external'].includes(n.type));
    const backendNodes = nodes.filter(n => !['frontend', 'external'].includes(n.type));

    const moments: UserMoment[] = [
      { id: 'm1', label: 'Designing your system...', backendStages: ['konstruktor', 'hardener'], userQuestion: 'How is my system being structured?' },
      { id: 'm2', label: 'Researching best practices...', backendStages: ['triage', 'research'], userQuestion: 'What knowledge is being gathered?' },
      { id: 'm3', label: 'Validating quality...', backendStages: ['l1ght', 'quality'], userQuestion: 'Is everything ready to build?' },
      { id: 'm4', label: 'Ready for your review.', backendStages: ['complete'], userQuestion: 'Can I review and approve?' },
    ];

    const nodeScreenMap: NodeScreenEntry[] = nodes.map(n => ({
      nodeId: n.id,
      label: n.label,
      hasUserSurface: ['frontend', 'external'].includes(n.type),
      screenType: n.type === 'frontend' ? 'dashboard' : undefined,
      userActions: n.type === 'frontend' ? ['view', 'interact'] : [],
      dataDisplayed: n.data_contract ? ['contract data'] : [],
    }));

    const coverage: CoverageEntry[] = moments.flatMap(m =>
      m.backendStages.map(stage => ({
        backendPhase: stage,
        momentId: m.id,
        momentLabel: m.label,
        confidence: 0.7,
      }))
    );

    const coveredNodes = frontendNodes.length;
    const parityScore = nodes.length > 0 ? Math.round((coveredNodes / Math.max(1, frontendNodes.length + backendNodes.length * 0.3)) * 100) : 0;

    return { moments, coverage, nodeScreenMap, parityScore: Math.min(100, parityScore) };
  }
}

// ─── Quality Gate ──────────────────────────────────────────────────────

async function qualityGate(
  graph: GraphData,
  research: Record<string, { report: string; meta: Record<string, unknown> }>,
  triage: TriageResult[],
  manifesto: string,
  model?: string,
): Promise<{ passed: boolean; issues: string[]; fixedGraph?: GraphData }> {
  const skippedIds = new Set(triage.filter(t => t.depth === 'skip').map(t => t.nodeId));

  const nodesSummary = graph.nodes.map(n => {
    const hasResearch = !!research[n.id];
    const wasSkipped = skippedIds.has(n.id);
    const researchStatus = wasSkipped ? 'SKIP(intentional)' : (hasResearch ? '✓' : '⚠');
    return `- ${n.label} (${n.type}, P${n.priority || '?'}): DC=${n.data_contract ? `YES(${n.data_contract.length}c)` : 'MISSING'} EH=${n.error_handling?.length || 0} AC=${n.acceptance_criteria?.length || 0} Research=${researchStatus}`;
  }).join('\n');

  // Cross-node contract validation
  const crossIssues = validateCrossNodeContracts(graph.nodes, graph.links);

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are the FINAL QUALITY GATE for a system architecture blueprint. Determine if it's READY FOR AUTONOMOUS CONSTRUCTION by an AI builder.

ASSESSMENT CRITERIA (in order of importance):
1. CRITICAL: Every node MUST have a non-empty data_contract with actual field names (not generic "object" or "any")
2. CRITICAL: Every node MUST have at least 1 acceptance criterion and 1 error handling entry
3. IMPORTANT: Cross-node data flows should be labeled
4. IMPORTANT: Priorities should form a valid build order (low-priority = build first)
5. COSMETIC: Research marked as SKIP(intentional) is ACCEPTABLE — these are well-known infrastructure modules that don't need external research

IMPORTANT: Be PRACTICAL. A blueprint is ready if a competent AI builder can construct each module from the information given. Don't block on cosmetic issues.

Return JSON: { "passed": true/false, "issues": ["issue 1", "issue 2", ...] }
If all CRITICAL and IMPORTANT criteria are met, set passed=true even if some cosmetic issues exist.
Return ONLY JSON.`,
    },
    {
      role: 'user',
      content: `Manifesto: ${manifesto.substring(0, 500)}\n\nNodes (${graph.nodes.length} total, ${graph.links.length} links):\n${nodesSummary}\n\nCross-node issues: ${crossIssues.length > 0 ? crossIssues.join('; ') : 'None'}\n\nIs this blueprint ready for autonomous construction?`,
    },
  ];

  try {
    const result = await chatCompletionWithFallback(messages, { jsonMode: true, model }, 'kompletus:qualityGate');
    const parsed = JSON.parse(result.content);
    return {
      passed: parsed.passed === true,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    };
  } catch (e: any) {
    console.warn(`[KOMPLETUS] Quality gate LLM failed: ${e.message}`);
    // Programmatic fallback: check hard requirements
    const hardFails: string[] = [];
    for (const node of graph.nodes) {
      if (!node.data_contract || node.data_contract.length < 10) {
        hardFails.push(`${node.label}: missing or too short data contract`);
      }
      if (!node.acceptance_criteria?.length) {
        hardFails.push(`${node.label}: no acceptance criteria`);
      }
      if (!node.error_handling?.length) {
        hardFails.push(`${node.label}: no error handling`);
      }
    }
    return {
      passed: hardFails.length === 0,
      issues: hardFails.length > 0 ? hardFails : ['Quality gate check failed — manual review recommended'],
    };
  }
}

// ─── Main Pipeline ─────────────────────────────────────────────────────

export async function runKompletusPipeline(
  prompt: string,
  onProgress: (event: KompletusEvent) => void,
  options?: { model?: string; maxIterations?: number },
): Promise<KompletusResult> {
  const startTime = Date.now();
  const stageTimes: Record<string, { durationMs: number; details?: Record<string, unknown> }> = {};
  const maxIterations = options?.maxIterations ?? 2;

  function trackStage(name: string, start: number, details?: Record<string, unknown>) {
    stageTimes[name] = { durationMs: Date.now() - start, details };
  }

  try {
    // ── Stage 1+2: KONSTRUKTOR + HARDENER (combined in existing workflow) ──
    let stageStart = Date.now();
    onProgress({ stage: 'konstruktor', status: 'running', message: 'Generating system skeleton...' });

    const systemState = await generateGraphStructureWorkflow({
      prompt,
      model: options?.model,
    });

    onProgress({
      stage: 'hardener',
      status: 'done',
      message: `Skeleton hardened: ${systemState.graph.nodes.length} nodes, ${systemState.graph.links.length} links`,
      data: { nodes: systemState.graph.nodes.length, links: systemState.graph.links.length },
    });
    trackStage('konstruktor+hardener', stageStart, {
      nodes: systemState.graph.nodes.length,
      links: systemState.graph.links.length,
      selfCorrected: systemState.meta?.selfCorrected,
    });

    let graph = systemState.graph;
    const manifesto = systemState.manifesto;
    const architecture = systemState.architecture;

    // ── Stage 3: SMART TRIAGE ─────────────────────────────────────────
    stageStart = Date.now();
    onProgress({ stage: 'triage', status: 'running', message: 'Classifying modules for research depth...' });

    const triage = await smartTriage(graph.nodes, prompt, options?.model);
    const critical = triage.filter(t => t.depth === 'critical').length;
    const standard = triage.filter(t => t.depth === 'standard').length;
    const skip = triage.filter(t => t.depth === 'skip').length;

    onProgress({
      stage: 'triage',
      status: 'done',
      message: `Triage: ${critical} critical, ${standard} standard, ${skip} skip`,
      data: { critical, standard, skip, triage },
    });
    trackStage('triage', stageStart, { critical, standard, skip });

    // ── Stage 4: PARALLEL DEEP RESEARCH ───────────────────────────────
    stageStart = Date.now();
    onProgress({
      stage: 'research',
      status: 'running',
      message: `Researching ${critical + standard} modules in parallel...`,
    });

    const research = await parallelResearch(graph.nodes, triage, prompt, options?.model, onProgress);

    const researchCount = Object.keys(research).length;
    onProgress({
      stage: 'research',
      status: 'done',
      message: `Research complete: ${researchCount} modules grounded`,
      data: { researched: researchCount },
    });
    trackStage('research', stageStart, { researched: researchCount });

    // Inject research into nodes
    graph = {
      ...graph,
      nodes: graph.nodes.map(n => {
        const nodeResearch = research[n.id];
        if (nodeResearch) {
          return {
            ...n,
            researchContext: nodeResearch.report,
            researchMeta: nodeResearch.meta,
          };
        }
        return n;
      }),
    };

    // ── Stage 5: SPECULAR AUDIT ───────────────────────────────────────
    stageStart = Date.now();
    onProgress({ stage: 'specular', status: 'running', message: 'Auditing UIX parity — mapping user moments...' });

    const specular = await specularAudit(graph.nodes, research, options?.model);

    onProgress({
      stage: 'specular',
      status: 'done',
      message: `SPECULAR: ${specular.moments.length} user moments, ${specular.nodeScreenMap.filter(n => n.hasUserSurface).length} screens, parity ${specular.parityScore}%`,
      data: { moments: specular.moments.length, screens: specular.nodeScreenMap.filter(n => n.hasUserSurface).length, parityScore: specular.parityScore },
    });
    trackStage('specular', stageStart, {
      moments: specular.moments.length,
      screens: specular.nodeScreenMap.filter(n => n.hasUserSurface).length,
      parityScore: specular.parityScore,
    });

    // ── Stage 5.5: SPECULAR CREATE ───────────────────────────────────
    stageStart = Date.now();
    onProgress({
      stage: 'specular_create',
      status: 'running',
      message: 'Generating live UIX previews from SSOT contracts...',
    });

    const userFacingNodeIds = new Set(
      specular.nodeScreenMap
        .filter((entry) => entry.hasUserSurface)
        .map((entry) => entry.nodeId),
    );

    const specularArtifacts = graph.nodes
      .filter((node) => userFacingNodeIds.has(node.id))
      .map((node) => buildSpecularCreatePayload(node));

    graph = {
      ...graph,
      nodes: graph.nodes.map((node) => {
        const artifact = specularArtifacts.find((entry) => entry.nodeId === node.id);
        if (!artifact) {
          return node;
        }
        return {
          ...node,
          designProfile: artifact.designProfile,
          referenceCandidates: artifact.referenceCandidates,
          selectedReferenceIds: artifact.selectedReferenceIds,
          selectedProductDnaPackIds: artifact.selectedProductDnaPackIds,
          activeProductDnaContract: artifact.activeProductDnaContract,
          variantCandidates: artifact.variantCandidates,
          selectedVariantId: artifact.selectedVariantId,
          previewArtifact: artifact.previewArtifact,
          previewState: artifact.previewState,
          designVerdict: artifact.designVerdict,
        };
      }),
    };

    const specularCreateGate = buildSpecularDesignGate(graph.nodes);
    const specularCreateWarnings = specularCreateGate.designGateStatus === 'failed'
      ? specularCreateGate.designFindings
      : [];

    onProgress({
      stage: 'specular_create',
      status: 'done',
      message: `SPECULAR CREATE: ${specularArtifacts.length} previews generated, design gate ${specularCreateGate.designGateStatus} (${specularCreateGate.designScore}%)`,
      data: {
        previews: specularArtifacts.length,
        designGateStatus: specularCreateGate.designGateStatus,
        designScore: specularCreateGate.designScore,
      },
    });
    trackStage('specular_create', stageStart, {
      previews: specularArtifacts.length,
      designGateStatus: specularCreateGate.designGateStatus,
      designScore: specularCreateGate.designScore,
    });

    // ── Stage 6: L1GHT PRE-FLIGHT ────────────────────────────────────
    stageStart = Date.now();
    onProgress({ stage: 'l1ght', status: 'running', message: 'Expanding contracts and validating structure...' });

    const expanded = await expandContractsWithResearch(graph.nodes, research, options?.model);
    graph = { ...graph, nodes: expanded.nodes };
    const crossIssues = validateCrossNodeContracts(graph.nodes, graph.links);
    const artifacts = generateSystemArtifacts(graph.nodes, graph.links);

    onProgress({
      stage: 'l1ght',
      status: 'done',
      message: `L1GHT: ${expanded.expandedCount} contracts expanded, ${crossIssues.length} cross-node issues`,
      data: { expanded: expanded.expandedCount, crossIssues: crossIssues.length },
    });
    trackStage('l1ght', stageStart, { expanded: expanded.expandedCount, crossIssues: crossIssues.length });

    // ── Stage 7: QUALITY GATE ─────────────────────────────────────────
    stageStart = Date.now();
    let iteration = 0;
    let gateResult = { passed: false, issues: [] as string[] };

    while (iteration < maxIterations) {
      iteration++;
      onProgress({
        stage: 'quality',
        status: 'running',
        message: `Quality gate iteration ${iteration}/${maxIterations}...`,
        data: { iteration },
      });

      gateResult = await qualityGate(graph, research, triage, manifesto, options?.model);

      if (gateResult.passed) {
        console.log(`[KOMPLETUS] Quality gate PASSED on iteration ${iteration}`);
        break;
      }

      console.log(`[KOMPLETUS] Quality gate iteration ${iteration}: ${gateResult.issues.length} issues`);

      if (iteration < maxIterations && gateResult.issues.length > 0) {
        // Smart self-heal: address what we can programmatically
        graph = {
          ...graph,
          nodes: graph.nodes.map(n => {
            const fixes: Partial<NodeData> = {};

            // Ensure minimum viable data contract
            if (!n.data_contract || n.data_contract.length < 10) {
              fixes.data_contract = `Input: { id: string, ${n.label.toLowerCase().replace(/\s+/g, '_')}_data: Record<string, unknown> } → Output: { success: boolean, data: Record<string, unknown>, error?: string }`;
            }

            // Ensure at least 1 AC
            if (!n.acceptance_criteria?.length) {
              fixes.acceptance_criteria = [`${n.label} responds to valid input within 500ms`, `${n.label} returns appropriate error codes for invalid input`];
            }

            // Ensure at least 1 EH
            if (!n.error_handling?.length) {
              fixes.error_handling = [`Returns structured error { code, message } on failure`, `Logs errors with correlation ID for tracing`];
            }

            return Object.keys(fixes).length > 0 ? { ...n, ...fixes } : n;
          }),
        };
      }
    }

    onProgress({
      stage: 'quality',
      status: 'done',
      message: gateResult.passed
        ? `✓ Quality gate PASSED (iteration ${iteration})`
        : `⚠ Quality gate: ${gateResult.issues.length} minor issues remaining`,
      data: { passed: gateResult.passed, iterations: iteration, issues: gateResult.issues },
    });
    trackStage('quality', stageStart, {
      passed: gateResult.passed,
      iterations: iteration,
      issues: gateResult.issues.length,
    });

    const finalSpecularArtifacts = graph.nodes
      .filter((node) => userFacingNodeIds.has(node.id))
      .map((node) => buildSpecularCreatePayload(node));

    graph = {
      ...graph,
      nodes: graph.nodes.map((node) => {
        const artifact = finalSpecularArtifacts.find((entry) => entry.nodeId === node.id);
        if (!artifact) {
          return node;
        }
        return {
          ...node,
          designProfile: artifact.designProfile,
          referenceCandidates: artifact.referenceCandidates,
          selectedReferenceIds: artifact.selectedReferenceIds,
          selectedProductDnaPackIds: artifact.selectedProductDnaPackIds,
          activeProductDnaContract: artifact.activeProductDnaContract,
          variantCandidates: artifact.variantCandidates,
          selectedVariantId: artifact.selectedVariantId,
          previewArtifact: artifact.previewArtifact,
          previewState: artifact.previewState,
          designVerdict: artifact.designVerdict,
        };
      }),
    };

    const finalSpecularCreateGate = buildSpecularDesignGate(graph.nodes);
    const finalSpecularCreateWarnings = finalSpecularCreateGate.designGateStatus === 'failed'
      ? finalSpecularCreateGate.designFindings
      : [];

    // ── Complete ──────────────────────────────────────────────────────
    const totalTimeMs = Date.now() - startTime;
    const explanation = systemState.explanation || '';

    onProgress({
      stage: 'complete',
      status: 'done',
      message: `KOMPLETUS complete: ${graph.nodes.length} nodes, ${Object.keys(research).length} researched, ${totalTimeMs / 1000}s total`,
      data: { totalTimeMs, nodes: graph.nodes.length },
    });

    return {
      graph,
      manifesto,
      architecture,
      explanation,
      research,
      specular,
      specularCreate: {
        designProfile: '21st',
        artifacts: finalSpecularArtifacts,
        gate: finalSpecularCreateGate,
        warnings: finalSpecularCreateWarnings,
      },
      l1ght: {
        expandedContracts: expanded.expandedCount,
        crossNodeIssues: crossIssues.length,
        artifacts,
      },
      qualityGate: {
        passed: gateResult.passed,
        iterations: iteration,
        remainingIssues: gateResult.issues,
      },
      meta: {
        totalTimeMs,
        stages: stageTimes,
      },
    };
  } catch (e: any) {
    onProgress({ stage: 'error', status: 'error', message: e.message });
    throw e;
  }
}
