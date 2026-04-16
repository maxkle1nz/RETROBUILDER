import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });
import express from "express";
import rateLimit from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createProvider } from "./src/server/providers/index.js";
import { initM1ndBridge, getM1ndBridge } from "./src/server/m1nd-bridge.js";
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
import {
  analyzeArchitectureWorkflow,
  applyProposalWorkflow,
  generateGraphStructureWorkflow,
  generateProposalWorkflow,
  performDeepResearchWorkflow,
} from "./src/server/ai-workflows.js";
import { readEnvConfigState, writeEnvConfig } from "./src/server/env-config.js";
import {
  chatCompletionWithFallback,
  collectProviderStates,
  getActiveProvider,
  getActiveProviderName,
  setActiveProvider,
} from "./src/server/provider-runtime.js";
import { runOMXSimulation } from "./src/server/omx-runner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    const provider = getActiveProvider();
    res.json({
      status: "ok",
      provider: provider.name,
      label: provider.label,
      defaultModel: provider.defaultModel,
    });
  });

  // ─── Session API ────────────────────────────────────────────────

  // ─── OMX Build Stream (SSE) ────────────────────────────────────

  app.get("/api/omx/stream/:sessionId", async (req, res) => {
    const { sessionId } = req.params;

    let session;
    try {
      session = await loadSession(sessionId);
    } catch {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Keep alive ping every 15s
    const keepAlive = setInterval(() => {
      if (!res.writableEnded) res.write(':ping\n\n');
    }, 15000);

    req.on('close', () => clearInterval(keepAlive));

    try {
      await runOMXSimulation(session.graph as any, res, req);
    } catch (err) {
      console.error('[OMX] Simulation error:', err);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'node_error', nodeId: 'system', error: String(err), retrying: false })}\n\n`);
        res.end();
      }
    } finally {
      clearInterval(keepAlive);
    }
  });


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
      const desiredProvider = process.env.AI_PROVIDER || getActiveProviderName();
      try {
        await setActiveProvider(desiredProvider);
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
    res.json({ providers, active: getActiveProviderName() });
  });

  /** List models for a specific provider (or active provider) */
  app.get("/api/ai/models", async (req, res) => {
    const targetProvider = req.query.provider as string | undefined;
    
    try {
      let targetP = getActiveProvider();
      if (targetProvider && targetProvider !== targetP.name) {
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
  app.post("/api/ai/switch-provider", async (req, res) => {
    const { provider: newProviderName } = req.body;
    
    if (!newProviderName || typeof newProviderName !== 'string') {
      return res.status(400).json({ error: "Missing 'provider' field" });
    }
    
    try {
      const provider = await setActiveProvider(newProviderName);
      
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
    const provider = getActiveProvider();
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

    try {
      const result = await generateGraphStructureWorkflow({ prompt, currentGraph, currentManifesto, model });
      res.json(result);
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
    try {
      const result = await generateProposalWorkflow({ prompt, currentGraph, manifesto, model });
      res.json(result);
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
    try {
      const result = await applyProposalWorkflow({ prompt, currentGraph, manifesto, proposal, model });
      res.json(result);
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
    try {
      const result = await analyzeArchitectureWorkflow({ graph, manifesto, model });
      res.json(result);
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
    try {
      const result = await performDeepResearchWorkflow({ node, projectContext, model });
      res.json(result);
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
    const provider = getActiveProvider();
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
