import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });
import express from "express";
import rateLimit from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createConfigRouter } from "./src/server/routes/config.js";
import { createM1ndRouter } from "./src/server/routes/m1nd.js";
import { createOmxRouter } from "./src/server/routes/omx.js";
import { createSessionRouter } from "./src/server/routes/sessions.js";
import { initM1ndBridge, getM1ndBridge } from "./src/server/m1nd-bridge.js";
import {
  ensureSessionStorage,
} from "./src/server/session-store.js";
import {
  analyzeArchitectureWorkflow,
  applyProposalWorkflow,
  generateGraphStructureWorkflow,
  generateProposalWorkflow,
  performDeepResearchWorkflow,
} from "./src/server/ai-workflows.js";
import { runKompletusPipeline } from "./src/server/kompletus-pipeline.js";
import {
  getActiveProvider,
} from "./src/server/provider-runtime.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

  app.use(createSessionRouter());
  app.use(createConfigRouter());
  app.use(createM1ndRouter());
  app.use(createOmxRouter());

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

  // ─── KOMPLETUS Pipeline (SSE) ──────────────────────────────────────

  app.post("/api/ai/kompletus", async (req, res) => {
    const { prompt, model } = req.body;

    if (!prompt?.trim()) {
      return res.status(400).json({ error: "Missing 'prompt' field." });
    }

    // Set up SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    function sendEvent(event: string, data: unknown) {
      try {
        const payload = JSON.stringify(data);
        if (event === 'result') {
          console.log(`[KOMPLETUS] Sending result event: ${(payload.length / 1024).toFixed(1)}KB`);
        }
        res.write(`event: ${event}\ndata: ${payload}\n\n`);
      } catch (serErr: any) {
        console.error(`[KOMPLETUS] Failed to serialize ${event} event:`, serErr.message);
        // Send a minimal error event instead
        res.write(`event: error\ndata: ${JSON.stringify({ error: `Serialization failed: ${serErr.message}` })}\n\n`);
      }
    }

    try {
      const result = await runKompletusPipeline(
        prompt,
        (evt) => {
          sendEvent('progress', evt);
        },
        { model, maxIterations: 2 },
      );

      // Trim research reports to keep SSE payload under ~500KB
      // Full reports can be 10-30KB each; truncate to 4KB for the SSE transport
      const trimmedResult = {
        ...result,
        research: Object.fromEntries(
          Object.entries(result.research).map(([id, r]) => [
            id,
            {
              ...r,
              report: typeof r.report === 'string' && r.report.length > 4000
                ? r.report.substring(0, 4000) + '\n\n... [truncated for transport]'
                : r.report,
            },
          ]),
        ),
      };

      sendEvent('result', trimmedResult);
      sendEvent('done', { success: true });
    } catch (e: any) {
      console.error("[KOMPLETUS] Pipeline failed:", e.message);
      sendEvent('error', { error: e.message });
    } finally {
      res.end();
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
