import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });
import express from "express";
import rateLimit from "express-rate-limit";
import { readFile } from 'node:fs/promises';
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createProvider, getProviderNames, PROVIDER_FACTORIES, type AIProvider, type ChatMessage } from "./src/server/providers/index.js";
import { validateAIResponse, SystemStateSchema, GraphDataSchema, AnalysisResultSchema } from "./src/server/validation.js";
import { performWebResearch, buildResearchContext } from "./src/server/web-research.js";
import { initM1ndBridge, getM1ndBridge, type M1ndBridge } from "./src/server/m1nd-bridge.js";
import {
  createSession,
  deleteSession,
  ensureSessionStorage,
  listSessions,
  loadSession,
  saveSession,
  type SessionDocument,
} from "./src/server/session-store.js";
import {
  activateSessionQuery,
  analyzeBlueprintGaps,
  analyzeBlueprintImpact,
  analyzeSessionReadiness,
  runSessionAdvancedAction,
} from "./src/server/session-analysis.js";
import { importCodebaseToSession } from "./src/server/codebase-import.js";
import { readEnvConfigState, writeEnvConfig } from "./src/server/env-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── SSOT Provider Initialization ────────────────────────────────────
// Provider is now mutable — can be switched at runtime via API
let provider: AIProvider = createProvider();

type CompletionConfigLike = {
  model?: string;
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
};

type ProviderProbe = {
  status: 'ready' | 'offline' | 'blocked' | 'missing_config';
  error?: string;
};

function extractJSON(text: string): string {
  // 1. Try the raw text as-is (works when json_object mode returns clean JSON)
  const trimmed = text.trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {}

  // 2. Strip markdown code fences if present (Claude often wraps JSON in ```json ... ```)
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    const fenced = fenceMatch[1].trim();
    try {
      JSON.parse(fenced);
      return fenced;
    } catch {}
  }
  
  // 3. Bracket-match: find the outermost { ... } using depth tracking
  //    This avoids the old bug where indexOf/lastIndexOf matched braces inside string values
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        return trimmed.substring(start, i + 1);
      }
    }
  }
  
  // 4. Fallback: return as-is and let the validator handle it
  return trimmed;
}

function createEphemeralSession(input: {
  id?: string;
  name?: string;
  source?: SessionDocument['source'];
  graph: { nodes: any[]; links: any[] };
  manifesto?: string;
  architecture?: string;
  projectContext?: string;
  importMeta?: SessionDocument['importMeta'];
}): SessionDocument {
  const now = new Date().toISOString();
  return {
    id: input.id || 'ephemeral-session',
    name: input.name || 'Ephemeral Session',
    source: input.source || 'manual',
    createdAt: now,
    updatedAt: now,
    manifesto: input.manifesto || '',
    architecture: input.architecture || '',
    graph: input.graph || { nodes: [], links: [] },
    projectContext: input.projectContext || '',
    importMeta: input.importMeta,
  };
}

async function resolveSessionPayload(
  sessionId: string,
  draft?: Partial<SessionDocument> & { graph?: { nodes: any[]; links: any[] } },
): Promise<SessionDocument | null> {
  if (draft) {
    return createEphemeralSession({
      id: sessionId,
      name: draft.name || 'Draft Session',
      source: draft.source || 'manual',
      graph: draft.graph || { nodes: [], links: [] },
      manifesto: draft.manifesto || '',
      architecture: draft.architecture || '',
      projectContext: draft.projectContext || '',
      importMeta: draft.importMeta,
    });
  }

  return loadSession(sessionId);
}

function collectFileUris(prompt: string): string[] {
  const matches = prompt.match(/file:\/\/[^\s]+/g) || [];
  return [...new Set(matches)];
}

async function hydratePromptWithFiles(prompt: string): Promise<string> {
  const uris = collectFileUris(prompt);
  if (uris.length === 0) return prompt;

  const sections: string[] = [];
  for (const uri of uris.slice(0, 6)) {
    try {
      const url = new URL(uri);
      const filePath = decodeURIComponent(url.pathname);
      const content = await readFile(filePath, 'utf8');
      sections.push(
        [
          `## FILE CONTEXT`,
          `Source: ${filePath}`,
          content.slice(0, 24000),
        ].join('\n'),
      );
    } catch (error: any) {
      sections.push(
        [
          `## FILE CONTEXT`,
          `Source: ${uri}`,
          `ERROR: failed to read file (${error.message || 'unknown error'})`,
        ].join('\n'),
      );
    }
  }

  return `${prompt}\n\n--- ATTACHED FILE CONTENT ---\n\n${sections.join('\n\n---\n\n')}`;
}

function fallbackProviderOrder(activeProviderName: string): string[] {
  const ordered = [activeProviderName, 'bridge', 'openai', 'xai'];
  return [...new Set(ordered.filter(Boolean))];
}

async function chatCompletionWithFallback(
  messages: ChatMessage[],
  config: CompletionConfigLike,
  purpose: string,
): Promise<{ content: string; providerName: string; providerLabel: string; fallbackUsed: boolean }> {
  const attempted: string[] = [];

  for (const providerName of fallbackProviderOrder(provider.name)) {
    let candidate: AIProvider;
    try {
      candidate = providerName === provider.name ? provider : createProvider(providerName);
    } catch (error: any) {
      attempted.push(`${providerName}: unavailable (${error.message})`);
      continue;
    }

    try {
      const content = await candidate.chatCompletion(messages, config);
      return {
        content,
        providerName: candidate.name,
        providerLabel: candidate.label,
        fallbackUsed: candidate.name !== provider.name,
      };
    } catch (error: any) {
      attempted.push(`${candidate.name}: ${error.message || 'request failed'}`);
      console.warn(`[SSOT] ${purpose} failed on ${candidate.name}: ${error.message}`);
    }
  }

  throw new Error(`[AI] ${purpose} failed across providers — ${attempted.join(' | ')}`);
}

async function probeProviderHealth(providerName: string): Promise<ProviderProbe> {
  const timeout = AbortSignal.timeout(4000);

  try {
    switch (providerName) {
      case 'xai': {
        if (!process.env.XAI_API_KEY) {
          return { status: 'missing_config', error: '[xAI] XAI_API_KEY environment variable is required.' };
        }
        const res = await fetch('https://api.x.ai/v1/models', {
          headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}` },
          signal: timeout,
        });
        if (res.ok) return { status: 'ready' };
        const body = await res.text();
        return {
          status: res.status === 403 ? 'blocked' : 'offline',
          error: `[xAI] ${res.status} ${body}`.slice(0, 300),
        };
      }
      case 'openai': {
        if (!process.env.OPENAI_API_KEY) {
          return { status: 'missing_config', error: '[OpenAI] OPENAI_API_KEY environment variable is required.' };
        }
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          signal: timeout,
        });
        if (res.ok) return { status: 'ready' };
        const body = await res.text();
        return {
          status: res.status === 403 ? 'blocked' : 'offline',
          error: `[OpenAI] ${res.status} ${body}`.slice(0, 300),
        };
      }
      case 'bridge': {
        const baseUrl = (process.env.THEBRIDGE_URL || 'http://127.0.0.1:7788/v1').replace(/\/v1$/, '');
        const res = await fetch(`${baseUrl}/health`, { signal: timeout });
        if (res.ok) return { status: 'ready' };
        const body = await res.text();
        return { status: 'offline', error: `[BRIDGE] ${res.status} ${body}`.slice(0, 300) };
      }
      default:
        return { status: 'offline', error: 'Unknown provider.' };
    }
  } catch (error: any) {
    return {
      status: providerName === 'bridge' ? 'offline' : 'blocked',
      error: `[${providerName}] ${error.message || 'Probe failed'}`,
    };
  }
}

async function collectProviderStates() {
  const names = getProviderNames();
  const providers = [];

  for (const name of names) {
    const probe = await probeProviderHealth(name);
    try {
      const p = PROVIDER_FACTORIES[name]();
      providers.push({
        name: p.name,
        label: p.label,
        defaultModel: p.defaultModel,
        active: p.name === provider.name,
        status: probe.status,
        error: probe.error,
      });
    } catch (e: any) {
      providers.push({
        name,
        label: name,
        defaultModel: null,
        active: false,
        status: probe.status,
        error: probe.error || e.message,
      });
    }
  }

  return providers;
}

// ─── Rate Limiting ───────────────────────────────────────────────────
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,      // 1 minute window
  max: 20,                   // 20 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Rate limit exceeded. Try again in a moment." },
});

async function startServer() {
  await ensureSessionStorage();
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // --- Health & Config API Routes ---
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      provider: provider.name,
      label: provider.label,
      defaultModel: provider.defaultModel,
    });
  });

  // ─── Session API ────────────────────────────────────────────────────

  app.get("/api/sessions", async (req, res) => {
    const sessions = await listSessions();
    res.json({ sessions });
  });

  app.post("/api/sessions", async (req, res) => {
    const { name, source, manifesto, architecture, graph, projectContext, importMeta } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: "Missing or invalid 'name' field." });
    }

    const session = await createSession({
      name,
      source: source || 'manual',
      manifesto: manifesto || '',
      architecture: architecture || '',
      graph: graph || { nodes: [], links: [] },
      projectContext: projectContext || '',
      importMeta,
    });

    res.status(201).json(session);
  });

  app.post("/api/sessions/import/codebase", async (req, res) => {
    const { path: codebasePath, model } = req.body;
    if (!codebasePath || typeof codebasePath !== 'string') {
      return res.status(400).json({ error: "Missing or invalid 'path' field." });
    }

    try {
      const result = await importCodebaseToSession(
        codebasePath,
        (messages, config) => chatCompletionWithFallback(messages, config || {}, 'importCodebaseToSession').then((out) => out.content),
        model,
      );
      res.status(201).json(result);
    } catch (e: any) {
      console.error("[sessions] Failed to import codebase:", e.message);
      res.status(500).json({ error: e.message || "Failed to import codebase" });
    }
  });

  app.get("/api/sessions/:id", async (req, res) => {
    const session = await loadSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }
    res.json(session);
  });

  app.put("/api/sessions/:id", async (req, res) => {
    try {
      const session = await saveSession(req.params.id, req.body || {});
      res.json(session);
    } catch (e: any) {
      res.status(404).json({ error: e.message || "Session not found." });
    }
  });

  app.delete("/api/sessions/:id", async (req, res) => {
    await deleteSession(req.params.id);
    res.status(204).end();
  });

  app.post("/api/sessions/:id/readiness", async (req, res) => {
    const draft = req.body?.draft;
    const session = await resolveSessionPayload(req.params.id, draft);
    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }
    const report = await analyzeSessionReadiness(session);
    res.json(report);
  });

  app.post("/api/sessions/:id/impact", async (req, res) => {
    const draft = req.body?.draft;
    const session = await resolveSessionPayload(req.params.id, draft);
    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }
    if (!req.body?.nodeId) {
      return res.status(400).json({ error: "Missing 'nodeId' field." });
    }
    try {
      const report = await analyzeBlueprintImpact(session, req.body.nodeId);
      res.json(report);
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to analyze impact." });
    }
  });

  app.post("/api/sessions/:id/gaps", async (req, res) => {
    const draft = req.body?.draft;
    const session = await resolveSessionPayload(req.params.id, draft);
    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }
    const report = await analyzeBlueprintGaps(session);
    res.json(report);
  });

  app.post("/api/sessions/:id/activate", async (req, res) => {
    const { query, top_k, draft } = req.body;
    if (!query) {
      return res.status(400).json({ error: "Missing 'query' field." });
    }
    const session = await resolveSessionPayload(req.params.id, draft);
    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }
    const result = await activateSessionQuery(session, query, top_k || 12);
    res.json(result);
  });

  app.post("/api/sessions/:id/advanced", async (req, res) => {
    const { action, nodeId, draft } = req.body;
    if (!action) {
      return res.status(400).json({ error: "Missing 'action' field." });
    }
    const session = await resolveSessionPayload(req.params.id, draft);
    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }
    const result = await runSessionAdvancedAction(session, action, nodeId);
    res.json(result);
  });

  // ─── Project Env Config ─────────────────────────────────────────────

  app.get("/api/config/env", async (req, res) => {
    const providers = await collectProviderStates();
    const state = await readEnvConfigState(providers);
    res.json(state);
  });

  app.put("/api/config/env", async (req, res) => {
    const { updates } = req.body || {};
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: "Missing 'updates' object." });
    }

    try {
      const targetFile = await writeEnvConfig(updates);
      const desiredProvider = process.env.AI_PROVIDER || provider.name;
      try {
        provider = createProvider(desiredProvider);
        if (provider.warmModel) {
          provider.warmModel().catch(() => {});
        }
      } catch (error) {
        console.warn(`[SSOT] Provider re-init after env save failed: ${(error as Error).message}`);
      }
      const providers = await collectProviderStates();
      const state = await readEnvConfigState(providers);
      res.json({
        success: true,
        targetFile,
        ...state,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to save env config." });
    }
  });

  // ─── Provider & Model Configuration ─────────────────────────────────
  
  /** List all available providers and their metadata */
  app.get("/api/ai/providers", async (req, res) => {
    const providers = await collectProviderStates();
    res.json({ providers, active: provider.name });
  });

  /** List models for a specific provider (or active provider) */
  app.get("/api/ai/models", async (req, res) => {
    const targetProvider = req.query.provider as string | undefined;
    
    try {
      let targetP = provider;
      if (targetProvider && targetProvider !== provider.name) {
        targetP = createProvider(targetProvider);
      }
      
      const models = await targetP.listModels();
      res.json({ 
        provider: targetP.name,
        defaultModel: targetP.defaultModel,
        models 
      });
    } catch (e: any) {
      console.error(`[SSOT] Failed to list models:`, e.message);
      res.status(500).json({ error: e.message });
    }
  });

  /** Switch active provider at runtime */
  app.post("/api/ai/switch-provider", (req, res) => {
    const { provider: newProviderName } = req.body;
    
    if (!newProviderName || typeof newProviderName !== 'string') {
      return res.status(400).json({ error: "Missing 'provider' field" });
    }
    
    try {
      provider = createProvider(newProviderName);
      
      // Background warmup — pre-fetch auth token + establish connection
      if (provider.warmModel) {
        provider.warmModel().catch(() => {});
      }
      
      res.json({ 
        success: true, 
        provider: provider.name, 
        label: provider.label,
        defaultModel: provider.defaultModel,
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Pre-warm a specific model connection (called when user selects a model in UI)
  app.post("/api/ai/warmup", (req, res) => {
    const { model } = req.body;
    if (provider.warmModel) {
      provider.warmModel(model).catch(() => {});
      res.json({ status: 'warming', model: model || provider.defaultModel });
    } else {
      res.json({ status: 'not_needed', provider: provider.name });
    }
  });

  // Apply rate limiting to all AI endpoints
  app.use("/api/ai", aiLimiter);

  app.post("/api/ai/generateGraphStructure", async (req, res) => {
    const { prompt, currentGraph, currentManifesto, model } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: "Missing or invalid 'prompt' field." });
    }

    const hydratedPrompt = await hydratePromptWithFiles(prompt);

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

CRITICAL: You must return ONLY valid JSON.`
      },
      {
        role: 'user',
        content: `User Prompt: ${hydratedPrompt}\n\nCurrent Manifesto: ${currentManifesto || 'None'}\nCurrent Graph: ${currentGraph ? JSON.stringify(currentGraph) : 'None'}`
      }
    ];

    try {
      const result = await chatCompletionWithFallback(messages, { jsonMode: true, model }, 'generateGraphStructure');
      const rawContent = result.content;
      const validated = validateAIResponse(extractJSON(rawContent), SystemStateSchema, 'generateGraphStructure');
      res.json({
        ...validated,
        meta: {
          provider: result.providerName,
          fallbackUsed: result.fallbackUsed,
        },
      });
    } catch (e: any) {
      console.error("[SSOT] Failed to generate graph structure:", e.message);
      res.status(500).json({ error: e.message || "Failed to generate graph structure" });
    }
  });

  app.post("/api/ai/generateProposal", async (req, res) => {
    const { prompt, currentGraph, manifesto, model } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: "Missing or invalid 'prompt' field." });
    }

    const hydratedPrompt = await hydratePromptWithFiles(prompt);

    // ─── Phase 0: Gather m1nd structural context (non-blocking) ───
    const m1ndBridge = getM1ndBridge();
    let structuralContext = '';
    if (m1ndBridge.isConnected) {
      try {
        console.log(`[SSOT] 🧠 Gathering m1nd structural context for: "${prompt.substring(0, 60)}..."`);
        const ctx = await m1ndBridge.gatherStructuralContext(prompt);
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
          console.log(`[SSOT] 🧠 Structural context: ${structuralContext.length} chars`);
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
Keep it under 4 sentences. Be direct, authoritative, and analytical. Do not use markdown formatting, just plain text.`
      },
      {
        role: 'user',
        content: `Manifesto: ${manifesto}\nCurrent Graph Nodes: ${currentGraph?.nodes?.length || 0}\nUser Prompt: ${hydratedPrompt}${structuralContext}\n\nWhat is your modification plan?`
      }
    ];

    try {
      const result = await chatCompletionWithFallback(messages, { model }, 'generateProposal');
      res.json({
        proposal: result.content || "Awaiting confirmation to modify system topology.",
        m1nd: m1ndBridge.isConnected ? { structuralContextChars: structuralContext.length, grounded: structuralContext.length > 0 } : null,
        meta: {
          provider: result.providerName,
          fallbackUsed: result.fallbackUsed,
        },
      });
    } catch (e: any) {
      console.error("[SSOT] Failed to generate proposal:", e.message);
      res.status(500).json({ error: e.message || "Failed to generate proposal" });
    }
  });

  app.post("/api/ai/applyProposal", async (req, res) => {
    const { prompt, manifesto, currentGraph, proposal, model } = req.body;

    if (!prompt || !proposal) {
      return res.status(400).json({ error: "Missing 'prompt' or 'proposal' field." });
    }

    const hydratedPrompt = await hydratePromptWithFiles(prompt);

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
CRITICAL: Return ONLY valid JSON.`
      },
      {
        role: 'user',
        content: `Current Graph: ${JSON.stringify(currentGraph)}\n\nUser Prompt: ${hydratedPrompt}\n\nAgreed Proposal: ${proposal}\n\nGenerate the new graph JSON.`
      }
    ];

    try {
      const result = await chatCompletionWithFallback(messages, { jsonMode: true, model }, 'applyProposal');
      const rawContent = result.content;
      const validated = validateAIResponse(extractJSON(rawContent), GraphDataSchema, 'applyProposal');
      res.json(validated);
    } catch (e: any) {
      console.error("[SSOT] Failed to apply proposal:", e.message);
      res.status(500).json({ error: e.message || "Failed to apply proposal" });
    }
  });

  app.post("/api/ai/analyzeArchitecture", async (req, res) => {
    const { graph, manifesto, model } = req.body;

    if (!graph || !graph.nodes) {
      return res.status(400).json({ error: "Missing or invalid 'graph' field." });
    }

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are the "Critic", a senior software architect auditor.
Your job is to analyze the provided system graph and manifesto for flaws, security risks, missing components (like missing databases or auth), and circular dependencies.
If the architecture is solid, set isGood to true and provide a brief positive critique.
If it has flaws, set isGood to false, provide a harsh but constructive critique, and provide an 'optimizedGraph' with the necessary fixes (adding missing nodes, fixing links, updating data contracts).

CRITICAL: You must return ONLY valid JSON.`
      },
      {
        role: 'user',
        content: `Manifesto: ${manifesto}\n\nCurrent Graph: ${JSON.stringify(graph)}\n\nAnalyze this architecture.`
      }
    ];

    try {
      const result = await chatCompletionWithFallback(messages, { jsonMode: true, model }, 'analyzeArchitecture');
      const rawContent = result.content;
      const validated = validateAIResponse(extractJSON(rawContent), AnalysisResultSchema, 'analyzeArchitecture');
      res.json(validated);
    } catch (e: any) {
      console.error("[SSOT] Failed to analyze architecture:", e.message);
      res.status(500).json({ error: e.message || "Failed to analyze architecture" });
    }
  });

  // ─── M1ND API Endpoints ──────────────────────────────────────────

  app.get("/api/m1nd/health", async (req, res) => {
    const m = getM1ndBridge();
    if (!m.isConnected) {
      return res.json({ connected: false, nodeCount: 0, edgeCount: 0, graphState: 'offline' });
    }
    const health = await m.health();
    res.json(health || { connected: false, nodeCount: 0, edgeCount: 0, graphState: 'error' });
  });

  app.post("/api/m1nd/activate", async (req, res) => {
    const { query, agent_id, top_k } = req.body;
    if (!query) return res.status(400).json({ error: "Missing 'query'" });
    const result = await getM1ndBridge().activate(query, top_k || 20);
    res.json(result || { error: 'm1nd offline' });
  });

  app.post("/api/m1nd/impact", async (req, res) => {
    const { node_id, direction } = req.body;
    if (!node_id) return res.status(400).json({ error: "Missing 'node_id'" });
    const result = await getM1ndBridge().impact(node_id, direction || 'forward');
    res.json(result || { error: 'm1nd offline' });
  });

  app.post("/api/m1nd/predict", async (req, res) => {
    const { changed_node, top_k } = req.body;
    if (!changed_node) return res.status(400).json({ error: "Missing 'changed_node'" });
    const result = await getM1ndBridge().predict(changed_node, top_k || 10);
    res.json(result || { error: 'm1nd offline' });
  });

  app.post("/api/m1nd/hypothesize", async (req, res) => {
    const { claim } = req.body;
    if (!claim) return res.status(400).json({ error: "Missing 'claim'" });
    const result = await getM1ndBridge().hypothesize(claim);
    res.json(result || { error: 'm1nd offline' });
  });

  app.post("/api/m1nd/validate-plan", async (req, res) => {
    const { actions } = req.body;
    if (!actions || !Array.isArray(actions)) return res.status(400).json({ error: "Missing 'actions' array" });
    const result = await getM1ndBridge().validatePlan(actions);
    res.json(result || { error: 'm1nd offline' });
  });

  app.post("/api/m1nd/panoramic", async (req, res) => {
    const { top_n } = req.body;
    const result = await getM1ndBridge().panoramic(top_n || 30);
    res.json(result || { error: 'm1nd offline' });
  });

  app.post("/api/m1nd/diagram", async (req, res) => {
    const { center, depth, format } = req.body;
    const result = await getM1ndBridge().diagram(center, depth || 2, format || 'mermaid');
    res.json(result || { error: 'm1nd offline' });
  });

  app.post("/api/m1nd/layers", async (req, res) => {
    const result = await getM1ndBridge().layers();
    res.json(result || { error: 'm1nd offline' });
  });

  app.post("/api/m1nd/metrics", async (req, res) => {
    const { scope, top_k } = req.body;
    const result = await getM1ndBridge().metrics(scope, top_k || 30);
    res.json(result || { error: 'm1nd offline' });
  });

  app.post("/api/m1nd/ingest", async (req, res) => {
    const { path: codePath, adapter, mode } = req.body;
    if (!codePath) return res.status(400).json({ error: "Missing 'path'" });
    const result = await getM1ndBridge().ingest(codePath, adapter || 'code', mode || 'replace');
    res.json(result || { error: 'm1nd offline' });
  });

  app.post("/api/m1nd/document/resolve", async (req, res) => {
    const { path: docPath, node_id } = req.body;
    const result = await getM1ndBridge().documentResolve(docPath, node_id);
    res.json(result || { error: 'm1nd offline' });
  });

  app.post("/api/m1nd/document/bindings", async (req, res) => {
    const { path: docPath, node_id, top_k } = req.body;
    const result = await getM1ndBridge().documentBindings(docPath, node_id, top_k || 10);
    res.json(result || { error: 'm1nd offline' });
  });

  app.post("/api/m1nd/document/drift", async (req, res) => {
    const { path: docPath, node_id } = req.body;
    const result = await getM1ndBridge().documentDrift(docPath, node_id);
    res.json(result || { error: 'm1nd offline' });
  });

  // ─── OMX Export Endpoint ─────────────────────────────────────────────

  app.post("/api/export/omx", (req, res) => {
    const { graph, manifesto, architecture, sessionId, draft } = req.body;

    const run = async () => {
      try {
        let sourceSession: SessionDocument;
        if (sessionId) {
          const loaded = await resolveSessionPayload(sessionId, draft);
          if (!loaded) {
            return res.status(404).json({ error: "Session not found." });
          }
          sourceSession = loaded;
        } else {
          if (!graph || !graph.nodes) {
            return res.status(400).json({ error: "Missing 'graph' field." });
          }
          sourceSession = createEphemeralSession({ graph, manifesto, architecture });
        }

        const readiness = await analyzeSessionReadiness(sourceSession);
        if (!readiness.exportAllowed) {
          return res.status(409).json({
            error: "Blueprint is blocked and cannot be exported to Ralph yet.",
            readiness,
          });
        }

        // Topological sort: compute priority from links if not already set
        const nodes = [...sourceSession.graph.nodes];
        const links = sourceSession.graph.links || [];

        // Build adjacency: who depends on whom
        const inDegree = new Map<string, number>();
        const dependents = new Map<string, string[]>();
        for (const n of nodes) {
          inDegree.set(n.id, 0);
          dependents.set(n.id, []);
        }
        for (const l of links) {
          inDegree.set(l.target, (inDegree.get(l.target) || 0) + 1);
          if (!dependents.has(l.source)) dependents.set(l.source, []);
          dependents.get(l.source)!.push(l.target);
        }

        // Kahn's algorithm for topological sort
        const queue: string[] = [];
        const order = new Map<string, number>();
        for (const [id, deg] of inDegree) {
          if (deg === 0) queue.push(id);
        }

        let level = 1;
        while (queue.length > 0) {
          const batch = [...queue];
          queue.length = 0;
          for (const id of batch) {
            order.set(id, level);
            for (const dep of (dependents.get(id) || [])) {
              const newDeg = (inDegree.get(dep) || 1) - 1;
              inDegree.set(dep, newDeg);
              if (newDeg === 0) queue.push(dep);
            }
          }
          level++;
        }

        for (const n of nodes) {
          if (!n.priority) {
            n.priority = order.get(n.id) || 1;
          }
        }

        const phases = new Map<number, typeof nodes>();
        for (const n of nodes) {
          const p = n.priority || 1;
          if (!phases.has(p)) phases.set(p, []);
          phases.get(p)!.push(n);
        }

        const planLines: string[] = [
          `# OMX Execution Plan`,
          ``,
          `> Auto-generated from RETROBUILDER blueprint`,
          `> Manifesto: ${(sourceSession.manifesto || 'Not specified').substring(0, 200)}`,
          ``,
        ];

        const sortedPhases = [...phases.keys()].sort((a, b) => a - b);
        const phaseNames = ['', 'Foundation', 'Core Services', 'Integration', 'Interface', 'Polish', 'Optimization'];

        for (const p of sortedPhases) {
          const phaseName = phaseNames[Math.min(p, phaseNames.length - 1)] || `Phase ${p}`;
          planLines.push(`## Phase ${p}: ${phaseName} (priority ${p})`);
          planLines.push('');

          for (const n of phases.get(p)!) {
            planLines.push(`### ${n.label}`);
            planLines.push(`- **Type:** ${n.type}`);
            planLines.push(`- **Description:** ${n.description}`);
            if (n.data_contract) {
              planLines.push(`- **Data Contract:** ${n.data_contract}`);
            }
            if (n.decision_rationale) {
              planLines.push(`- **Rationale:** ${n.decision_rationale}`);
            }

            const deps = links.filter((l: any) => l.target === n.id).map((l: any) => {
              const src = nodes.find((nn: any) => nn.id === l.source);
              return src ? src.label : l.source;
            });
            if (deps.length > 0) {
              planLines.push(`- **Depends on:** ${deps.join(', ')}`);
            }

            if (n.acceptance_criteria && n.acceptance_criteria.length > 0) {
              planLines.push(`- **Acceptance Criteria:**`);
              for (const ac of n.acceptance_criteria) {
                planLines.push(`  - [ ] ${ac}`);
              }
            }

            if (n.error_handling && n.error_handling.length > 0) {
              planLines.push(`- **Error Handling:**`);
              for (const eh of n.error_handling) {
                planLines.push(`  - ${eh}`);
              }
            }

            planLines.push('');
          }
        }

        const agentsLines: string[] = [
          `# AGENTS.md`,
          ``,
          `> Auto-generated from RETROBUILDER blueprint`,
          ``,
          `## Project Overview`,
          sourceSession.manifesto || 'No manifesto provided.',
          ``,
          `## Architecture`,
          sourceSession.architecture || 'No architecture specified.',
          ``,
          `## Build Order`,
          `Execute modules in priority order. Lower numbers are built first.`,
          `Do NOT start a higher-priority module until all its dependencies are verified.`,
          ``,
          `## Verification Rules`,
          `- Each module has explicit acceptance criteria`,
          `- A module is COMPLETE only when ALL acceptance criteria pass`,
          `- Run tests after each module completion`,
          `- If a criterion fails, fix and re-verify before proceeding`,
          ``,
          `## Module Summary`,
        ];

        for (const n of nodes.sort((a: any, b: any) => (a.priority || 0) - (b.priority || 0))) {
          agentsLines.push(`- **${n.label}** (P${n.priority || '?'}, ${n.type}): ${n.description.substring(0, 100)}`);
        }

        const plan = planLines.join('\n');
        const agents = agentsLines.join('\n');

        res.json({
          plan,
          agents,
          readiness,
          stats: {
            totalNodes: nodes.length,
            totalPhases: sortedPhases.length,
            totalAcceptanceCriteria: nodes.reduce((sum: number, n: any) => sum + (n.acceptance_criteria?.length || 0), 0),
            buildOrder: nodes
              .sort((a: any, b: any) => (a.priority || 0) - (b.priority || 0))
              .map((n: any) => ({ id: n.id, label: n.label, priority: n.priority })),
          },
        });
      } catch (e: any) {
        console.error("[SSOT] Failed to export OMX plan:", e.message);
        res.status(500).json({ error: e.message || "Failed to export OMX plan" });
      }
    };

    run();
  });

  // ─── Deep Research (enriched with m1nd) ──────────────────────────

  app.post("/api/ai/performDeepResearch", async (req, res) => {
    const { node, projectContext, model } = req.body;

    if (!node || !node.label) {
      return res.status(400).json({ error: "Missing or invalid 'node' field." });
    }

    const researchQuery = `${node.label}: ${node.description || ''} ${node.data_contract ? 'Data contract: ' + node.data_contract : ''} best practices, architecture patterns, implementation`;

    try {
      // Phase 1: Parallel web research across 6 sources
      console.log(`[SSOT] 🔬 Deep Research: "${node.label}" — querying 6 sources...`);
      const webResearch = await performWebResearch(researchQuery, {
        perplexityKey: process.env.PERPLEXITY_API_KEY,
        serperKey: process.env.SERPER_API_KEY,
        readTopUrls: 2,
        includeScholar: true,
      });

      const researchContext = buildResearchContext(webResearch);
      console.log(`[SSOT] 📚 Research context: ${researchContext.length} chars, ${webResearch.totalSourcesFound} sources`);

      // Phase 1.5: Enrich with m1nd document bindings (non-blocking)
      let structuralBindings = '';
      const m1ndBridge = getM1ndBridge();
      if (m1ndBridge.isConnected) {
        try {
          const [bindings, drift] = await Promise.allSettled([
            m1ndBridge.documentBindings(undefined, node.label),
            m1ndBridge.documentDrift(undefined, node.label),
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
            console.log(`[SSOT] 🧠 Structural bindings: ${structuralBindings.length} chars`);
          }
        } catch (e: any) {
          console.warn(`[SSOT] m1nd bindings failed (degrading): ${e.message}`);
        }
      }

      // Phase 2: Send enriched context to the active LLM for synthesis
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

Format your response in clean Markdown with clear sections.`
        },
        {
          role: 'user',
          content: `Project Context: ${projectContext}\n\nModule to Research:\nName: ${node.label}\nDescription: ${node.description}\nData Contract: ${node.data_contract || 'None'}\n\n---\n\n# Real-Time Research Data\n\n${researchContext}${structuralBindings}\n\n---\n\nPlease synthesize the above research data into a comprehensive deep research report for this module.`
        }
      ];

      const result = await chatCompletionWithFallback(messages, { model }, 'performDeepResearch');

      res.json({
        research: result.content || 'Research failed.',
        meta: {
          sourcesFound: webResearch.totalSourcesFound,
          searchTimeMs: webResearch.searchTimeMs,
          sourcesBreakdown: {
            perplexity: webResearch.perplexityAnswer ? 1 : 0,
            webArticles: webResearch.sources.filter(s => s.source === 'serper').length,
            scholarPapers: webResearch.sources.filter(s => s.source === 'scholar').length,
            semanticScholar: webResearch.sources.filter(s => s.source === 'semantic_scholar').length,
            crossref: webResearch.sources.filter(s => s.source === 'crossref').length,
            githubDonors: webResearch.githubDonors.length,
          },
          enrichedPages: webResearch.enrichedContent.length,
          m1nd: m1ndBridge.isConnected ? { structuralBindingsChars: structuralBindings.length, grounded: structuralBindings.length > 0 } : null,
          provider: result.providerName,
          fallbackUsed: result.fallbackUsed,
        },
      });
    } catch (e: any) {
      console.error("[SSOT] Failed to perform deep research:", e.message);
      res.status(500).json({ error: e.message || "Failed to perform deep research" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // ─── Initialize M1ND Bridge (non-blocking) ─────────────────────
  const m1ndBridge = await initM1ndBridge();

  app.listen(PORT, "0.0.0.0", () => {
    const R = '\x1b[0m';
    const B = '\x1b[1m';
    const D = '\x1b[2m';
    const BORDER = '\x1b[38;2;92;118;255m';
    const TITLE  = '\x1b[38;2;120;255;214m';
    const LABEL  = '\x1b[38;2;255;184;108m';
    const VALUE  = '\x1b[38;2;230;236;255m';
    const ACCENT = '\x1b[38;2;255;94;125m';
    const OK     = '\x1b[38;2;80;250;123m';
    const WARN   = '\x1b[38;2;255;203;107m';

    const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));

    console.log('');
    console.log(`${BORDER}╭──────────────────────────────────────────────────────────────╮${R}`);
    console.log(`${BORDER}│${R} ${ACCENT}◉${R} ${B}${TITLE}M1ND${R} ${D}${VALUE}//${R} ${B}${TITLE}RETROBUILDER${R} ${D}${VALUE}· cognition layer online${R}        ${BORDER}│${R}`);
    console.log(`${BORDER}├──────────────────────────────────────────────────────────────┤${R}`);
    console.log(`${BORDER}│${R} ${LABEL}◈ Server${R}     ${VALUE}http://localhost:${PORT}${R}${' '.repeat(Math.max(0, 31 - String(PORT).length))}${BORDER}│${R}`);
    console.log(`${BORDER}│${R} ${LABEL}◆ Provider${R}   ${VALUE}${pad(provider.label, 42)}${R}${BORDER}│${R}`);
    console.log(`${BORDER}│${R} ${LABEL}⬢ Model${R}      ${VALUE}${pad(provider.defaultModel, 42)}${R}${BORDER}│${R}`);
    console.log(`${BORDER}│${R} ${LABEL}⟳ Rate${R}       ${WARN}${pad('20 req/min per IP', 42)}${R}${BORDER}│${R}`);
    console.log(`${BORDER}├──────────────────────────────────────────────────────────────┤${R}`);
    const pplx = process.env.PERPLEXITY_API_KEY ? `${OK}●` : `${WARN}○`;
    const srp = process.env.SERPER_API_KEY ? `${OK}●` : `${WARN}○`;
    const jina = `${OK}●`; // always free
    const m1ndStatus = m1ndBridge.isConnected ? `${OK}●` : `${WARN}○`;
    const researchStatus = `${pplx} Perplexity ${srp} Serper ${jina} Jina+Scholar${R}`;
    console.log(`${BORDER}│${R} ${LABEL}⚡ Research${R}  ${researchStatus}${' '.repeat(5)}${BORDER}│${R}`);
    console.log(`${BORDER}│${R} ${LABEL}🧠 M1ND${R}      ${m1ndStatus} ${VALUE}${pad(m1ndBridge.isConnected ? 'graph engine · structural awareness' : 'offline · degraded mode', 40)}${R}${BORDER}│${R}`);
    console.log(`${BORDER}├──────────────────────────────────────────────────────────────┤${R}`);
    console.log(`${BORDER}│${R} ${OK}████${R}${TITLE}██${R} ${D}${VALUE}neural ingress · memory graph · semantic reconstruction${R} ${BORDER}│${R}`);
    console.log(`${BORDER}╰──────────────────────────────────────────────────────────────╯${R}`);
    console.log('');
  });
}

startServer();
