import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });
import express from "express";
import rateLimit from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createAiRouter } from "./src/server/routes/ai.js";
import { createConfigRouter } from "./src/server/routes/config.js";
import { createM1ndRouter } from "./src/server/routes/m1nd.js";
import { createOmxRouter } from "./src/server/routes/omx.js";
import { createSessionRouter } from "./src/server/routes/sessions.js";
import { initM1ndBridge, getM1ndBridge } from "./src/server/m1nd-bridge.js";
import {
  ensureSessionStorage,
} from "./src/server/session-store.js";
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
  app.use(createAiRouter());

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
