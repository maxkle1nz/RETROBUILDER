import { type ChatMessage } from './providers/index.js';
import { type GraphData, type NodeData } from '../lib/api.js';
import { extractJSON, hydratePromptWithFiles } from './ai-helpers.js';
import { chatCompletionWithFallback } from './provider-runtime.js';
import { validateAIResponse, validateGraphIntegrity, AnalysisResultSchema, GraphDataSchema, SystemStateSchema } from './validation.js';
import { buildResearchContext, performWebResearch } from './web-research.js';
import { getM1ndBridge } from './m1nd-bridge.js';
import { hardenGraphForDelivery, hasPositiveNumber } from './graph-composition.js';

export { consolidatePresentationFrontendNodes, hardenGraphForDelivery } from './graph-composition.js';

export class WorkflowInputError extends Error {
  statusCode = 422;
  code = 'NON_ACTIONABLE_PROMPT';

  constructor(message: string) {
    super(message);
    this.name = 'WorkflowInputError';
  }
}

export class WorkflowProviderRuntimeError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, options: { statusCode?: number; code?: string } = {}) {
    super(message);
    this.name = 'WorkflowProviderRuntimeError';
    this.statusCode = options.statusCode || 502;
    this.code = options.code || 'PROVIDER_RUNTIME_UNAVAILABLE';
  }
}

function assertActionableProjectPrompt(prompt: string) {
  const normalized = prompt.trim();
  const letterCount = (normalized.match(/\p{L}/gu) || []).length;
  const hasFileContext = normalized.includes('file://');

  if (!hasFileContext && letterCount < 3) {
    throw new WorkflowInputError(
      `I need a project description before I can generate the architecture graph. "${normalized || 'empty prompt'}" is not enough context. Tell me what you want to build, who it is for, and the main features.`,
    );
  }
}

export function classifyNonJsonAIResponse(content: string) {
  const normalized = content.toLowerCase();
  const fromBridgeFallback = normalized.includes('thebridge returned a resilient fallback summary');
  const codexTimedOut = normalized.includes('codex exec request timed out');

  if (fromBridgeFallback || codexTimedOut) {
    return new WorkflowProviderRuntimeError(
      'THE BRIDGE Codex runtime did not return structured JSON for graph generation. Codex execution timed out or fell back to a summary; try again with a smaller request or switch to a provider with native JSON support.',
      {
        statusCode: codexTimedOut ? 504 : 502,
        code: codexTimedOut ? 'BRIDGE_CODEX_TIMEOUT' : 'BRIDGE_CODEX_FALLBACK',
      },
    );
  }

  return null;
}

function validateSystemStateFromAI(content: string, endpoint: string) {
  const extracted = extractJSON(content);
  if (!extracted.includes('{')) {
    if (process.env.RETROBUILDER_DEBUG_AI_JSON === '1') {
      console.warn(`[Validation] ${endpoint}: non-JSON AI response sample: ${content.slice(0, 1200)}`);
    }
    const providerRuntimeError = classifyNonJsonAIResponse(content);
    if (providerRuntimeError) {
      throw providerRuntimeError;
    }
    throw new WorkflowInputError(
      `I could not generate an architecture graph because the request does not contain enough project scope. Tell me what you want to build, who it is for, and the main features.`,
    );
  }
  return validateAIResponse(extracted, SystemStateSchema, endpoint);
}

// ─── Inline Blueprint Quality Auditor ────────────────────────────────────

interface QualityIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  nodeIds?: string[];
}

/**
 * Lightweight inline quality audit — runs BEFORE delivery to user.
 * Does NOT require a session. Operates on raw graph data.
 * Returns a list of issues that should be fed back to the LLM.
 */
function auditBlueprintQuality(graph: GraphData): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const { nodes, links } = graph;

  // 1. Error handling coverage — MUST be present on all nodes
  const noEH = nodes.filter(n => !n.error_handling || n.error_handling.length === 0);
  if (noEH.length > 0) {
    issues.push({
      code: 'MISSING_ERROR_HANDLING',
      severity: 'error',
      message: `${noEH.length}/${nodes.length} modules have NO error handling. Every module must define at least 2 failure scenarios and recovery strategies. Missing: ${noEH.map(n => `"${n.label}"`).join(', ')}`,
      nodeIds: noEH.map(n => n.id),
    });
  }

  // 2. Data contract coverage — MUST be present
  const noDC = nodes.filter(n => !n.data_contract || !n.data_contract.trim());
  if (noDC.length > 0) {
    issues.push({
      code: 'MISSING_DATA_CONTRACT',
      severity: 'error',
      message: `${noDC.length}/${nodes.length} modules have no data contract (input/output specification). Missing: ${noDC.map(n => `"${n.label}"`).join(', ')}`,
      nodeIds: noDC.map(n => n.id),
    });
  }

  // 3. Acceptance criteria depth — must have at least 2 per node
  const thinAC = nodes.filter(n => !n.acceptance_criteria || n.acceptance_criteria.length < 2);
  if (thinAC.length > 0) {
    issues.push({
      code: 'THIN_ACCEPTANCE_CRITERIA',
      severity: 'warning',
      message: `${thinAC.length}/${nodes.length} modules have fewer than 2 acceptance criteria. Each module needs at least 2 testable conditions. Weak: ${thinAC.map(n => `"${n.label}" (${n.acceptance_criteria?.length ?? 0} AC)`).join(', ')}`,
      nodeIds: thinAC.map(n => n.id),
    });
  }

  // 4. Security wiring — security nodes must connect to ALL backend/external services
  const securityNodes = nodes.filter(n => n.type === 'security');
  const protectedTypes = new Set(['backend', 'external']);
  const needsProtection = nodes.filter(n => protectedTypes.has(n.type || ''));
  if (securityNodes.length > 0 && needsProtection.length > 0) {
    const secIds = new Set(securityNodes.map(n => n.id));
    const securityTargets = new Set(
      links.filter(l => secIds.has(l.source) || secIds.has(l.target))
        .flatMap(l => [l.source, l.target])
    );
    const unprotected = needsProtection.filter(n => !securityTargets.has(n.id));
    if (unprotected.length > 0) {
      issues.push({
        code: 'SECURITY_WIRING_GAP',
        severity: 'error',
        message: `Security module exists but ${unprotected.length} backend/external services are NOT connected to it: ${unprotected.map(n => `"${n.label}"`).join(', ')}. Security must protect all services.`,
        nodeIds: unprotected.map(n => n.id),
      });
    }
  }

  // 5. Missing critical types
  const typeSet = new Set(nodes.map(n => n.type));
  const missing: string[] = [];
  if (!typeSet.has('security') && (typeSet.has('backend') || typeSet.has('external'))) {
    missing.push('security/auth module (no security layer for backend services)');
  }
  if (!typeSet.has('database') && typeSet.has('backend')) {
    missing.push('database/persistence module (backend services have no storage)');
  }
  if (missing.length > 0) {
    issues.push({
      code: 'MISSING_MODULE_TYPES',
      severity: 'error',
      message: `Architecture is missing critical modules: ${missing.join('; ')}. Add them.`,
    });
  }

  // 6. Orphan detection — nodes with zero connections in a multi-node graph  
  if (nodes.length > 1) {
    const connected = new Set<string>();
    for (const l of links) { connected.add(l.source); connected.add(l.target); }
    const orphans = nodes.filter(n => !connected.has(n.id));
    if (orphans.length > 0) {
      issues.push({
        code: 'ORPHAN_NODES',
        severity: 'warning',
        message: `${orphans.length} module(s) have zero connections (structural islands): ${orphans.map(n => `"${n.label}"`).join(', ')}. Wire them into the DAG.`,
        nodeIds: orphans.map(n => n.id),
      });
    }
  }

  return issues;
}

// ─── KONSTRUKTOR System Prompt ───────────────────────────────────────────

const KONSTRUKTOR_SYSTEM_PROMPT = `You are an expert system architect and mind-map generator (m1nd).
Your task is to break down a user's project request into a detailed DAG (Directed Acyclic Graph) structure AND generate project artifacts.
If a current graph or manifesto is provided, modify or expand them based on the user's prompt.
Return the result as a JSON object with 'manifesto', 'architecture', 'graph' (containing 'nodes' and 'links'), and 'explanation'.

Artifacts:
- manifesto: A high-level project manifesto, core objectives, and business rules (Markdown).
- architecture: Technical architecture decisions, patterns, and stack rationale (Markdown).
- explanation: A concise, human-readable summary (2-4 sentences) of the skeleton you created — what modules were generated, the key architectural decisions made, and what the user should do next (e.g. "Run deep research on the Auth and Database modules to ground them with real-world patterns before proceeding to build"). Write in a direct, confident, technical tone. Do NOT use markdown formatting — plain text only.

Nodes MUST have ALL of the following (no exceptions):
- id (string)
- label (string)
- description (string — at least 2 sentences describing responsibility)
- status (pending|in-progress|completed)
- type (frontend|backend|database|external|security)
- data_contract (string — REQUIRED: what inputs it receives and outputs it returns, in "Input: {...} → Output: {...}" format)
- decision_rationale (string — why this architectural choice was made)
- acceptance_criteria (string array: 2-5 testable conditions. Each criterion must be verifiable by an autonomous agent — e.g. "POST /auth/login returns 200 with JWT for valid credentials")
- error_handling (string array — REQUIRED, at least 2 entries: how this module handles failures — e.g. "If payment gateway timeout > 30s, circuit-break and return 503", "If DB connection lost, retry 3x with exponential backoff then fail gracefully")
- priority (number: 1 = foundation with no deps, higher = depends on lower priorities)
- group (number for clustering)

Links must have: source (node id), target (node id), label (optional string describing the data flow).
Security modules MUST connect to ALL backend and external services they protect.
Ensure the graph has a clear hierarchy and SSOT. Avoid circular dependencies.
IMPORTANT: The graph must be buildable by an autonomous agent in priority order.

Node granularity rule:
- Nodes are deployable construction lanes: apps, services, databases, integrations, security/compliance layers, or durable domain capabilities.
- Do NOT create separate frontend nodes for visual/page sections such as Hero Section, Pricing Section, Feature Cards Grid, How It Works, Problem/Solution Sections, Final CTA, Title Screen, Beat Lab, Career Map, Header, Footer, or Visual System.
- Put requested screens, sections, interactions, art direction, and layout requirements inside the acceptance criteria and description of ONE cohesive frontend app node.
- Use multiple frontend nodes only for truly separate products or staff/customer surfaces, such as Customer App plus Admin Console.

CRITICAL: You must return ONLY valid JSON.`;

// ─── KONSTRUKTOR Workflow with Self-Correction Loop ──────────────────────

export async function generateGraphStructureWorkflow(input: {
  prompt: string;
  currentGraph?: GraphData;
  currentManifesto?: string;
  model?: string;
}) {
  assertActionableProjectPrompt(input.prompt);
  const hydratedPrompt = await hydratePromptWithFiles(input.prompt);

  // ── Pass 1: Initial Generation ──────────────────────────────────────
  const pass1Messages: ChatMessage[] = [
    { role: 'system', content: KONSTRUKTOR_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `User Prompt: ${hydratedPrompt}\n\nCurrent Manifesto: ${input.currentManifesto || 'None'}\nCurrent Graph: ${input.currentGraph ? JSON.stringify(input.currentGraph) : 'None'}`,
    },
  ];

  console.log('[KONSTRUKTOR] Pass 1: Generating initial skeleton...');
  const pass1Result = await chatCompletionWithFallback(pass1Messages, { jsonMode: true, model: input.model }, 'generateGraphStructure');
  let validated = validateSystemStateFromAI(pass1Result.content, 'generateGraphStructure');
  let repairedGraph = validateGraphIntegrity(validated.graph, 'generateGraphStructure:pass1', { allowCycleBreaking: true });

  // ── Quality Audit (Pass 1) ───────────────────────────────────────────
  const pass1Issues = auditBlueprintQuality(repairedGraph);
  const pass1Errors = pass1Issues.filter(i => i.severity === 'error');
  const pass1Warnings = pass1Issues.filter(i => i.severity === 'warning');

  console.log(`[KONSTRUKTOR] Pass 1 audit: ${pass1Errors.length} errors, ${pass1Warnings.length} warnings, ${repairedGraph.nodes.length} nodes`);

  // ── Pass 2: Critic + Dreamer (ALWAYS RUNS) ─────────────────────────
  // Half critic: fixes structural gaps detected by audit
  // Half dreamer: proactively adds modules that improve the architecture
  console.log('[KONSTRUKTOR] Pass 2: Critic + Dreamer engaged...');

  const issueReport = pass1Issues.length > 0
    ? `\n\nQUALITY AUDIT FINDINGS:\n${pass1Issues.map(i => `[${i.severity.toUpperCase()}] ${i.code}: ${i.message}`).join('\n')}`
    : '\n\nQUALITY AUDIT: All checks passed. No structural issues detected.';

  const pass2Messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are the HARDENER — a dual-mode architect that is half Critic, half Dreamer.

CRITIC MODE: Fix every structural and completeness issue found by the quality audit. Zero tolerance for missing error_handling, missing data_contract, or disconnected security.

DREAMER MODE: Proactively enhance the architecture by adding modules that a senior architect would expect but a first draft typically misses. Think about:
- Observability (logging, monitoring, health checks)
- Resilience (message queues, circuit breakers, retry policies)
- Compliance (LGPD/GDPR consent management, audit trails, data deletion workflows)
- Operational (backup/restore, rate limiting, feature flags)
- Developer experience (API gateway, documentation service)

Only add modules that genuinely serve the system's domain. Don't add unnecessary complexity.

RULES:
- EVERY node MUST have error_handling (string array, at least 2 entries). NO EXCEPTIONS.
- EVERY node MUST have data_contract (string, non-empty). NO EXCEPTIONS.
- EVERY node MUST have acceptance_criteria (string array, at least 2 entries).
- Security modules MUST connect to ALL backend and external services.
- Merge accidental visual-section frontend nodes into a single cohesive frontend app node. Do NOT preserve or add separate modules for Hero Section, Pricing Section, Feature Cards Grid, How It Works, Problem/Solution Sections, Final CTA, Title Screen, Beat Lab, Career Map, Header, Footer, or Visual System.
- Treat visual sections, screens, Framer Motion guidance, generated assets, and content blocks as implementation details inside the app node, not standalone graph nodes.
- New modules you add must have ALL required fields fully populated.
- Update the manifesto and architecture documents to reflect your additions.
- Update the explanation to describe what you improved and what you added.

Return the COMPLETE updated JSON with manifesto, architecture, graph, and explanation.
CRITICAL: You must return ONLY valid JSON.`,
    },
    {
      role: 'user',
      content: `Original user request: ${hydratedPrompt}`,
    },
    {
      role: 'assistant',
      content: JSON.stringify({ manifesto: validated.manifesto, architecture: validated.architecture, graph: repairedGraph, explanation: validated.explanation }),
    },
    {
      role: 'user',
      content: `Review and harden this architecture.${issueReport}

As the HARDENER, you must:
1. [CRITIC] Fix every issue listed above (if any). Every node needs error_handling and data_contract — fill them ALL.
2. [COMPOSITION] Collapse any frontend nodes that are merely visual/page sections into one cohesive frontend app node. Screens and sections belong in that node's acceptance criteria, not in separate modules.
3. [DREAMER] Add 2-4 modules that a production system would need but this draft is missing (observability, resilience, compliance, etc). Fully populate all fields for new modules.
4. [WIRING] Ensure security covers all services. Ensure no orphan nodes. Ensure all links have descriptive labels.
5. [EXPLANATION] Rewrite the explanation to summarize both the corrections and the enhancements you made.

Return the COMPLETE hardened JSON.`,
    },
  ];

  const pass2Result = await chatCompletionWithFallback(pass2Messages, { jsonMode: true, model: input.model }, 'generateGraphStructure:harden');
  validated = validateSystemStateFromAI(pass2Result.content, 'generateGraphStructure:pass2');
  repairedGraph = validateGraphIntegrity(validated.graph, 'generateGraphStructure:pass2', { allowCycleBreaking: true });

  // ── Final Audit + Programmatic Guarantee ────────────────────────────
  const finalIssues = auditBlueprintQuality(repairedGraph);
  const finalErrors = finalIssues.filter(i => i.severity === 'error');
  console.log(`[KONSTRUKTOR] Pass 2 result: ${finalErrors.length} errors remaining (was ${pass1Errors.length}), ${repairedGraph.nodes.length} nodes`);

  // Programmatic safety net — guarantee zero missing fields even if LLM flakes
  repairedGraph = hardenGraphForDelivery(repairedGraph);
  const hardenedNodes = repairedGraph.nodes;

  // Final verification log
  const postHardenGaps = hardenedNodes.filter(n =>
    !n.data_contract?.trim()
    || !n.error_handling?.length
    || !hasPositiveNumber((n as any).priority)
    || !hasPositiveNumber((n as any).group)
  );
  console.log(`[KONSTRUKTOR] ✓ Delivered: ${hardenedNodes.length} nodes, ${repairedGraph.links.length} links, ${postHardenGaps.length} gaps (guaranteed 0)`);

  return {
    ...validated,
    graph: repairedGraph,
    meta: {
      provider: pass1Result.providerName,
      fallbackUsed: pass1Result.fallbackUsed,
      selfCorrected: true,
      pass1Issues: pass1Issues.length,
      pass1Nodes: pass1Issues.length > 0 ? repairedGraph.nodes.length : 0,
      enhancedNodes: repairedGraph.nodes.length,
    },
  };
}

export async function generateProposalWorkflow(input: {
  prompt: string;
  currentGraph: GraphData;
  manifesto: string;
  model?: string;
}) {
  const hydratedPrompt = await hydratePromptWithFiles(input.prompt);
  const m1ndBridge = getM1ndBridge();
  let structuralContext = '';

  if (m1ndBridge.isConnected) {
    try {
      console.log(`[SSOT] 🧠 Gathering m1nd structural context for: "${input.prompt.substring(0, 60)}..."`);
      const ctx = await m1ndBridge.gatherStructuralContext(input.prompt);
      if (ctx) {
        const parts: string[] = ['\n--- M1ND STRUCTURAL CONTEXT ---'];
        if (ctx.activatedNodes.length > 0) {
          parts.push(`Activated nodes (most relevant): ${JSON.stringify(ctx.activatedNodes.slice(0, 5).map((n: any) => n.label || n.id || n.external_id))}`);
        }
        if (ctx.blastRadius) {
          parts.push(`Blast radius: ${JSON.stringify(ctx.blastRadius.blast_radius || ctx.blastRadius).substring(0, 300)}`);
        }
        if (ctx.coChangePredictions) {
          parts.push(`Co-change predictions: ${JSON.stringify(ctx.coChangePredictions).substring(0, 300)}`);
        }
        if (ctx.riskScore) {
          parts.push(`Risk assessment: ${JSON.stringify(ctx.riskScore).substring(0, 200)}`);
        }
        if (ctx.layerViolations.length > 0) {
          parts.push(`⚠ Layer violations: ${JSON.stringify(ctx.layerViolations.slice(0, 3))}`);
        }
        parts.push('--- END STRUCTURAL CONTEXT ---');
        structuralContext = parts.join('\n');
      }
    } catch (e: any) {
      console.warn(`[SSOT] m1nd context gather failed (degrading gracefully): ${e.message}`);
    }
  }

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are the KREATOR, an advanced AI system architect with structural awareness.
The user wants to modify the existing system architecture.
Analyze their prompt against the current graph, manifesto, and any structural context provided by the m1nd graph engine.
If structural context is available, use it to:
- Reference specific affected modules and their blast radius
- Warn about co-change dependencies that should be updated together
- Flag layer violations or structural risks
Respond with a concise, highly technical, cyberpunk-flavored confirmation of what exactly you are going to change.
Keep it under 4 sentences. Be direct, authoritative, and analytical. Do not use markdown formatting, just plain text.`,
    },
    {
      role: 'user',
      content: `Manifesto: ${input.manifesto}\nCurrent Graph Nodes: ${input.currentGraph?.nodes?.length || 0}\nUser Prompt: ${hydratedPrompt}${structuralContext}\n\nWhat is your modification plan?`,
    },
  ];

  const result = await chatCompletionWithFallback(messages, { model: input.model }, 'generateProposal');

  return {
    proposal: result.content || 'Awaiting confirmation to modify system topology.',
    m1nd: m1ndBridge.isConnected ? { structuralContextChars: structuralContext.length, grounded: structuralContext.length > 0 } : null,
    meta: {
      provider: result.providerName,
      fallbackUsed: result.fallbackUsed,
    },
  };
}

export async function applyProposalWorkflow(input: {
  prompt: string;
  currentGraph: GraphData;
  manifesto: string;
  proposal: string;
  model?: string;
}) {
  const hydratedPrompt = await hydratePromptWithFiles(input.prompt);

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a master system architect.
You are given the current system graph, a user prompt, and a proposal that was agreed upon.
Your task is to output the NEW updated graph structure in JSON format.
The output MUST be a valid JSON object with 'nodes' and 'links' arrays.
Nodes must have: id, label, group, description, data_contract, status, type, acceptance_criteria (string array of 2-5 testable conditions), priority (number, build order), error_handling (string array, optional).
Links must have: source, target, label.
Preserve existing acceptance_criteria and priority values for unchanged nodes. Generate new ones for added/modified nodes.
CRITICAL: Return ONLY valid JSON.`,
    },
    {
      role: 'user',
      content: `Current Graph: ${JSON.stringify(input.currentGraph)}\n\nUser Prompt: ${hydratedPrompt}\n\nAgreed Proposal: ${input.proposal}\n\nGenerate the new graph JSON.`,
    },
  ];

  const result = await chatCompletionWithFallback(messages, { jsonMode: true, model: input.model }, 'applyProposal');
  const validated = validateAIResponse(extractJSON(result.content), GraphDataSchema, 'applyProposal');

  // P0: Enforce DAG invariants — strict mode, no cycle-breaking on mutations (reject outright)
  const repairedGraph = validateGraphIntegrity(validated, 'applyProposal', { allowCycleBreaking: false });
  return repairedGraph;
}

export async function analyzeArchitectureWorkflow(input: {
  graph: GraphData;
  manifesto: string;
  model?: string;
}) {
  // Strip research enrichment data — the critic should analyze ARCHITECTURE, not research content.
  // researchContext/researchMeta are knowledge blobs from deep research, not structural modules.
  const hasResearch = input.graph.nodes.some(n => (n as any).researchContext);
  const strippedGraph: GraphData = {
    nodes: input.graph.nodes.map(n => {
      const { researchContext, researchMeta, constructionNotes, ...structural } = n as any;
      // Preserve a lightweight hint so the critic knows research was done
      if (researchContext) {
        (structural as any).researchStatus = 'grounded';
      }
      return structural;
    }),
    links: input.graph.links,
  };

  const researchNote = hasResearch
    ? `\n\nNOTE: This system has already been through Deep Research grounding. Nodes marked with "researchStatus": "grounded" have validated research backing their data contracts. Do NOT treat research content as system modules — focus only on the structural architecture (nodes, links, types, data contracts, acceptance criteria).`
    : '';

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are the "Critic", a senior software architect auditor.
Your job is to analyze the provided system graph and manifesto for flaws, security risks, missing components (like missing databases or auth), and circular dependencies.

IMPORTANT DISTINCTIONS:
- Each node in the graph represents a SYSTEM MODULE (backend service, frontend page, database, external integration, etc.)
- Node fields like "data_contract", "acceptance_criteria", "error_handling" describe the MODULE's technical contract
- Nodes with "researchStatus": "grounded" have been validated through deep research — their contracts are already evidence-based
- Do NOT confuse research CONTENT with system MODULES — only analyze the structural architecture
- Focus on: module relationships (links), missing integrations, security gaps, data flow, redundant modules, circular dependencies

If the architecture is solid, set isGood to true and provide a brief positive critique.
If it has flaws, set isGood to false, provide a harsh but constructive critique, and provide an 'optimizedGraph' with the necessary fixes (adding missing nodes, fixing links, updating data contracts).

CRITICAL: You must return ONLY valid JSON.`,
    },
    {
      role: 'user',
      content: `Manifesto: ${input.manifesto}${researchNote}\n\nCurrent Graph (${strippedGraph.nodes.length} modules, ${strippedGraph.links.length} links): ${JSON.stringify(strippedGraph)}\n\nAnalyze this architecture.`,
    },
  ];

  const result = await chatCompletionWithFallback(messages, { jsonMode: true, model: input.model }, 'analyzeArchitecture');
  const analysisResult = validateAIResponse(extractJSON(result.content), AnalysisResultSchema, 'analyzeArchitecture');

  // P0: If the critic proposed an optimized graph, validate it too
  if (analysisResult.optimizedGraph) {
    analysisResult.optimizedGraph = validateGraphIntegrity(analysisResult.optimizedGraph, 'analyzeArchitecture:optimizedGraph', { allowCycleBreaking: true });
  }
  return analysisResult;
}

export async function performDeepResearchWorkflow(input: {
  node: NodeData;
  projectContext: string;
  model?: string;
}) {
  const researchQuery = `${input.node.label}: ${input.node.description || ''} ${input.node.data_contract ? 'Data contract: ' + input.node.data_contract : ''} best practices, architecture patterns, implementation`;

  console.log(`[SSOT] 🔬 Deep Research: "${input.node.label}" — querying 6 sources...`);
  const webResearch = await performWebResearch(researchQuery, {
    perplexityKey: process.env.PERPLEXITY_API_KEY,
    serperKey: process.env.SERPER_API_KEY,
    readTopUrls: 2,
    includeScholar: true,
  });

  const researchContext = buildResearchContext(webResearch);
  const m1ndBridge = getM1ndBridge();
  let structuralBindings = '';

  if (m1ndBridge.isConnected) {
    try {
      const [bindings, drift] = await Promise.allSettled([
        m1ndBridge.documentBindings(undefined, input.node.label),
        m1ndBridge.documentDrift(undefined, input.node.label),
      ]);

      const bindingData = bindings.status === 'fulfilled' ? bindings.value : null;
      const driftData = drift.status === 'fulfilled' ? drift.value : null;

      if (bindingData || driftData) {
        const parts: string[] = ['\n# Structural Bindings (m1nd Graph Engine)'];
        if (bindingData?.bindings?.length > 0) {
          parts.push(`This concept is bound to ${bindingData.bindings.length} code locations:`);
          for (const b of bindingData.bindings.slice(0, 5)) {
            parts.push(`- ${b.source_path || b.file_path || b.node_id} (confidence: ${b.score || b.confidence || 'n/a'})`);
          }
        }
        if (driftData?.findings?.length > 0) {
          parts.push(`\n⚠ Document drift detected: ${driftData.findings.length} stale bindings`);
          for (const f of driftData.findings.slice(0, 3)) {
            parts.push(`- ${f.message || f.description || JSON.stringify(f)}`);
          }
        }
        structuralBindings = parts.join('\n');
      }
    } catch (e: any) {
      console.warn(`[SSOT] m1nd bindings failed (degrading): ${e.message}`);
    }
  }

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are an advanced AI research assistant for the 'm1nd' architectural system.
You will receive REAL web research data (papers, articles, source excerpts) gathered from Perplexity, Google Scholar, Semantic Scholar, CrossRef, and live web pages.
You may also receive STRUCTURAL BINDINGS from the m1nd graph engine showing where this concept is implemented in the codebase.

Your task is to synthesize this research into a comprehensive report covering:
1. **Current State of the Art** — what the latest research and industry practices say.
2. **Academic Foundations** — relevant papers and their key findings.
3. **Open Source Landscape** — promising repositories, frameworks, and tools.
4. **Structural Grounding** — if m1nd bindings are available, show how this concept maps to the actual codebase.
5. **Implementation Recommendations** — concrete, actionable suggestions.
6. **Risk Analysis** — potential pitfalls and how to mitigate them.
7. **5-Year Forecast** — where this technology is heading.

CITATION RULES:
- Reference specific papers by title and year when available.
- Include URLs for web sources.
- Distinguish between established consensus and emerging ideas.

Format your response in clean Markdown with clear sections.`,
    },
    {
      role: 'user',
      content: `Project Context: ${input.projectContext}\n\nModule to Research:\nName: ${input.node.label}\nDescription: ${input.node.description}\nData Contract: ${input.node.data_contract || 'None'}\n\n---\n\n# Real-Time Research Data\n\n${researchContext}${structuralBindings}\n\n---\n\nPlease synthesize the above research data into a comprehensive deep research report for this module.`,
    },
  ];

  const result = await chatCompletionWithFallback(messages, { model: input.model }, 'performDeepResearch');

  return {
    research: result.content || 'Research failed.',
    meta: {
      sourcesFound: webResearch.totalSourcesFound,
      searchTimeMs: webResearch.searchTimeMs,
      sourcesBreakdown: {
        perplexity: webResearch.perplexityAnswer ? 1 : 0,
        webArticles: webResearch.sources.filter((s) => s.source === 'serper').length,
        scholarPapers: webResearch.sources.filter((s) => s.source === 'scholar').length,
        semanticScholar: webResearch.sources.filter((s) => s.source === 'semantic_scholar').length,
        crossref: webResearch.sources.filter((s) => s.source === 'crossref').length,
        githubDonors: webResearch.githubDonors.length,
      },
      enrichedPages: webResearch.enrichedContent.length,
      m1nd: m1ndBridge.isConnected ? { structuralBindingsChars: structuralBindings.length, grounded: structuralBindings.length > 0 } : null,
      provider: result.providerName,
      fallbackUsed: result.fallbackUsed,
    },
  };
}
