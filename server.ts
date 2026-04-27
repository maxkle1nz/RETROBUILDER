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
import { createSpecularRouter } from "./src/server/routes/specular.js";
import { createKnowledgeBankRouter } from "./src/server/routes/knowledge-bank.js";
import { createSessionRouter } from "./src/server/routes/sessions.js";
import { initM1ndBridge, getM1ndBridge } from "./src/server/m1nd-bridge.js";
import {
  ensureSessionStorage,
} from "./src/server/session-store.js";
import {
  getActiveProvider,
} from "./src/server/provider-runtime.js";
import { ensureBridgeRuntime } from "./src/server/bridge-bootstrap.js";
import { assertLocalApiTokenForHost, requireLocalApiToken } from "./src/server/local-api-auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
type BridgeRuntimeEnsureResult = Awaited<ReturnType<typeof ensureBridgeRuntime>>;
let bridgeCompanionTimer: NodeJS.Timeout | null = null;
let lastBridgeCompanionSignature: string | null = null;
const RETROBUILDER_WATCH_IGNORES = [
  '**/.retrobuilder/**',
  '**/.omx/**',
  '**/artifacts/**',
  '**/generated-workspace/**',
  '**/dist/**',
];

function resolveServerHost() {
  const configured = (process.env.RETROBUILDER_HOST || process.env.HOST || '').trim();
  return configured || '127.0.0.1';
}

function bridgeCompanionEnabled() {
  return process.env.THEBRIDGE_AUTO_START !== '0';
}

function bridgeCompanionIntervalMs() {
  const configured = Number(process.env.THEBRIDGE_KEEPALIVE_INTERVAL_MS);
  return Number.isFinite(configured) && configured >= 5000 ? configured : 30000;
}

function bridgeRuntimeSignature(runtime: BridgeRuntimeEnsureResult) {
  return [
    runtime.ok,
    runtime.installed,
    runtime.baseUrl,
    runtime.protocol,
    runtime.source,
    runtime.autoStarted,
  ].join(':');
}

function logBridgeCompanion(label: string, runtime: BridgeRuntimeEnsureResult, force = false) {
  const signature = bridgeRuntimeSignature(runtime);
  if (!force && signature === lastBridgeCompanionSignature) return;
  lastBridgeCompanionSignature = signature;

  if (runtime.ok) {
    const action = runtime.autoStarted ? 'launched' : 'ready';
    console.log(`[BRIDGE] ${label}: THE BRIDGE ${action} at ${runtime.baseUrl} (${runtime.protocol}/${runtime.source})`);
    return;
  }

  const reason = runtime.installed
    ? 'installed but health check failed'
    : 'executable not discovered';
  console.warn(`[BRIDGE] ${label}: THE BRIDGE unavailable at ${runtime.baseUrl} (${reason}; command: ${runtime.command})`);
}

async function ensureBridgeCompanion(label: string) {
  if (!bridgeCompanionEnabled()) {
    if (label === 'boot') {
      console.log('[BRIDGE] boot: companion auto-start disabled by THEBRIDGE_AUTO_START=0');
    }
    return null;
  }

  const runtime = await ensureBridgeRuntime();
  logBridgeCompanion(label, runtime, label === 'boot' || runtime.autoStarted || !runtime.ok);
  return runtime;
}

function startBridgeCompanionLoop() {
  if (bridgeCompanionTimer || !bridgeCompanionEnabled()) return;
  bridgeCompanionTimer = setInterval(() => {
    void ensureBridgeCompanion('keepalive').catch((error) => {
      console.warn(`[BRIDGE] keepalive failed: ${(error as Error).message}`);
    });
  }, bridgeCompanionIntervalMs());
  bridgeCompanionTimer.unref?.();
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
  const PORT = Number(process.env.RETROBUILDER_PORT || process.env.PORT || 7777);
  const HOST = resolveServerHost();
  assertLocalApiTokenForHost(HOST);

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

  app.use('/api/m1nd', requireLocalApiToken);
  app.use('/api/omx', requireLocalApiToken);
  app.use('/api/config', requireLocalApiToken);
  app.use('/api/ai', requireLocalApiToken);
  app.use('/api/sessions/import/codebase', requireLocalApiToken);

  app.use(createSessionRouter());
  app.use(createConfigRouter());
  app.use(createM1ndRouter());
  app.use(createOmxRouter());
  app.use(createSpecularRouter());
  app.use(createKnowledgeBankRouter());

  // Apply rate limiting to all AI endpoints after the local API guard.
  app.use("/api/ai", aiLimiter);
  app.use(createAiRouter());

  // THE BRIDGE is the local AI companion runtime. Keep it available with RETROBUILDER.
  const bridgeRuntime = await ensureBridgeCompanion('boot');
  startBridgeCompanionLoop();

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ...(disableHmr
          ? { hmr: false as const, ws: false as const, watch: null }
          : { watch: { ignored: RETROBUILDER_WATCH_IGNORES } }),
      },
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

  app.listen(PORT, HOST, () => {
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
    const fit = (s: string, n: number) => s.length > n ? `${s.slice(0, Math.max(0, n - 3))}...` : pad(s, n);

    console.log('');
    console.log(`${BORDER}╭──────────────────────────────────────────────────────────────╮${R}`);
    console.log(`${BORDER}│${R} ${ACCENT}◉${R} ${B}${TITLE}M1ND${R} ${D}${VALUE}//${R} ${B}${TITLE}RETROBUILDER${R} ${D}${VALUE}· cognition layer online${R}        ${BORDER}│${R}`);
    console.log(`${BORDER}├──────────────────────────────────────────────────────────────┤${R}`);
    const displayHost = HOST === '0.0.0.0' || HOST === '::' ? 'localhost' : HOST;
    console.log(`${BORDER}│${R} ${LABEL}◈ Server${R}     ${VALUE}http://${displayHost}:${PORT}${R}${' '.repeat(Math.max(0, 31 - String(PORT).length - displayHost.length))}${BORDER}│${R}`);
    if (HOST === '0.0.0.0' || HOST === '::') {
      console.log(`${BORDER}│${R} ${WARN}⚠ LAN bind enabled by RETROBUILDER_HOST=${HOST}; local-only is safer.${R}${' '.repeat(4)}${BORDER}│${R}`);
    }
    const provider = getActiveProvider();
    console.log(`${BORDER}│${R} ${LABEL}◆ Provider${R}   ${VALUE}${pad(provider.label, 42)}${R}${BORDER}│${R}`);
    console.log(`${BORDER}│${R} ${LABEL}⬢ Model${R}      ${VALUE}${pad(provider.defaultModel, 42)}${R}${BORDER}│${R}`);
    console.log(`${BORDER}│${R} ${LABEL}⟳ Rate${R}       ${WARN}${pad('20 req/min per IP', 42)}${R}${BORDER}│${R}`);
    console.log(`${BORDER}├──────────────────────────────────────────────────────────────┤${R}`);
    const pplx = process.env.PERPLEXITY_API_KEY ? `${OK}●` : `${WARN}○`;
    const srp = process.env.SERPER_API_KEY ? `${OK}●` : `${WARN}○`;
    const jina = `${OK}●`; // always free
    const m1ndStatus = m1ndBridge.isConnected ? `${OK}●` : `${WARN}○`;
    const m1ndSummary = m1ndBridge.isConnected ? 'graph engine · structural awareness' : 'bootstrapping · handshake pending';
    const researchStatus = `${pplx} Perplexity ${srp} Serper ${jina} Jina+Scholar${R}`;
    console.log(`${BORDER}│${R} ${LABEL}⚡ Research${R}  ${researchStatus}${' '.repeat(5)}${BORDER}│${R}`);
    console.log(`${BORDER}│${R} ${LABEL}🧠 M1ND${R}      ${m1ndStatus} ${VALUE}${pad(m1ndSummary, 40)}${R}${BORDER}│${R}`);
    const bridgeStatus = bridgeRuntime?.ok ? `${OK}●` : `${WARN}○`;
    const bridgeSummary = bridgeRuntime
      ? `${bridgeRuntime.protocol} · ${bridgeRuntime.source} · ${bridgeRuntime.baseUrl}`
      : 'auto-start disabled';
    console.log(`${BORDER}│${R} ${LABEL}🌉 BRIDGE${R}    ${bridgeStatus} ${VALUE}${fit(bridgeSummary, 40)}${R}${BORDER}│${R}`);
    console.log(`${BORDER}├──────────────────────────────────────────────────────────────┤${R}`);
    console.log(`${BORDER}│${R} ${OK}████${R}${TITLE}██${R} ${D}${VALUE}neural ingress · memory graph · semantic reconstruction${R} ${BORDER}│${R}`);
    console.log(`${BORDER}╰──────────────────────────────────────────────────────────────╯${R}`);
    console.log('');
  });
}

startServer();
