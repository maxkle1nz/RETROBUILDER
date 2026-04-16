import { type ChatMessage } from './providers/index.js';
import { type GraphData, type NodeData } from '../lib/api.js';
import { extractJSON, hydratePromptWithFiles } from './ai-helpers.js';
import { chatCompletionWithFallback } from './provider-runtime.js';
import { validateAIResponse, validateGraphIntegrity, AnalysisResultSchema, GraphDataSchema, SystemStateSchema } from './validation.js';
import { buildResearchContext, performWebResearch } from './web-research.js';
import { getM1ndBridge } from './m1nd-bridge.js';

export async function generateGraphStructureWorkflow(input: {
  prompt: string;
  currentGraph?: GraphData;
  currentManifesto?: string;
  model?: string;
}) {
  const hydratedPrompt = await hydratePromptWithFiles(input.prompt);

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are an expert system architect and mind-map generator (m1nd).
Your task is to break down a user's project request into a detailed DAG (Directed Acyclic Graph) structure AND generate project artifacts.
If a current graph or manifesto is provided, modify or expand them based on the user's prompt.
Return the result as a JSON object with 'manifesto', 'architecture', and 'graph' (containing 'nodes' and 'links').

Artifacts:
- manifesto: A high-level project manifesto, core objectives, and business rules (Markdown).
- architecture: Technical architecture decisions, patterns, and stack rationale (Markdown).

Nodes must have:
- id (string)
- label (string)
- description (string)
- status (pending|in-progress|completed)
- type (frontend|backend|database|external|security)
- data_contract (string, optional: what inputs it receives and outputs it returns)
- decision_rationale (string, optional: why this architectural choice was made)
- acceptance_criteria (string array: 2-5 testable conditions that prove this module works correctly. Each criterion must be verifiable by an autonomous agent — e.g. "POST /auth/login returns 200 with JWT for valid credentials", "Database migration creates users table with email unique index")
- error_handling (string array, optional: how this module should handle failures — e.g. "If payment gateway timeout > 30s, circuit-break and return 503")
- priority (number: build order computed from dependencies — 1 = foundation with no deps, higher = depends on lower priorities. Foundation layers like databases should be priority 1, services that depend on them priority 2, UI layers that depend on services priority 3+)
- group (number for clustering)

Links must have: source (node id), target (node id), label (optional string describing the data flow).
Ensure the graph has a clear hierarchy and Single Source of Truth (SSOT). Avoid circular dependencies.
IMPORTANT: The graph must be buildable by an autonomous agent in priority order. Lower priority numbers are built first.

CRITICAL: You must return ONLY valid JSON.`,
    },
    {
      role: 'user',
      content: `User Prompt: ${hydratedPrompt}\n\nCurrent Manifesto: ${input.currentManifesto || 'None'}\nCurrent Graph: ${input.currentGraph ? JSON.stringify(input.currentGraph) : 'None'}`,
    },
  ];

  const result = await chatCompletionWithFallback(messages, { jsonMode: true, model: input.model }, 'generateGraphStructure');
  const validated = validateAIResponse(extractJSON(result.content), SystemStateSchema, 'generateGraphStructure');

  // P0: Enforce DAG invariants — reject cycles, repair dangling links
  const repairedGraph = validateGraphIntegrity(validated.graph, 'generateGraphStructure', { allowCycleBreaking: true });

  return {
    ...validated,
    graph: repairedGraph,
    meta: {
      provider: result.providerName,
      fallbackUsed: result.fallbackUsed,
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
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are the "Critic", a senior software architect auditor.
Your job is to analyze the provided system graph and manifesto for flaws, security risks, missing components (like missing databases or auth), and circular dependencies.
If the architecture is solid, set isGood to true and provide a brief positive critique.
If it has flaws, set isGood to false, provide a harsh but constructive critique, and provide an 'optimizedGraph' with the necessary fixes (adding missing nodes, fixing links, updating data contracts).

CRITICAL: You must return ONLY valid JSON.`,
    },
    {
      role: 'user',
      content: `Manifesto: ${input.manifesto}\n\nCurrent Graph: ${JSON.stringify(input.graph)}\n\nAnalyze this architecture.`,
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
