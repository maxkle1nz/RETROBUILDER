# Current State of the System

As of v0.6.1 (2026-04-17), the following features and components are implemented:

## 1. Frontend Interface (UI/UX)
- **Premium Typography:** Orbitron (display/header), Inter (UI), JetBrains Mono (code/terminal) — loaded from Google Fonts.
- **Cyberpunk Aesthetic:** Dark theme with neon accents, animated grid pulse background, CRT scanlines overlay, smooth transitions.
- **2D Graph Visualization:** Uses `@xyflow/react` (React Flow v12) for interactive node graphs with auto-layout (dagre).
- **Dual Modes (Header Switcher):** Toggle between **ARCHITECT**, **M1ND**, and **BU1LDER** modes. Each mode shifts the entire UI via CSS variable override (`data-mode="architect|m1nd|builder"`). Keyboard shortcuts: ⌘+1/⌘+2/⌘+3.
- **Live Header Stats:** Real-time uptime counter, live SYNC% (completed/total nodes), node count, version badge. No hardcoded data.
- **Dynamic Right Panel:** Sliding panel for node analysis, m1nd integration, blast radius highlighting.
- **Chat Footer (KREATOR/KONSTRUKTOR):** Adaptive prompt with full chat message history (timestamped, role-tagged, scrollable).
- **Node Context Menu:** Right-click any node for: Rename, Duplicate, Set Status (pending/in-progress/completed), Delete.
- **Panel Collapse/Expand:** Toggle left (checklist) and right (sidebar) panels with animated transitions.
- **Graph Export/Import:** Download graph as JSON, import from file. Buttons in the footer controls.
- **MiniMap Color Legend:** Visual legend showing Frontend (cyan), Backend (purple), Database (orange), Security (red), External (green).
- **Toast Notifications:** All operations (save, delete, error, export, import) surface feedback via Sonner toasts.
- **Keyboard Shortcuts:** ⌘Z (undo), ⌘⇧Z (redo), Esc (close panels), ⌘1/⌘2/⌘3 (mode switch), ⌘S (save session).
- **Error Boundaries:** App-level and GraphView-level boundaries prevent white-screen crashes.
- **Persistent State:** `zustand/persist` saves graph, manifesto, architecture, and mode to `localStorage`.
- **Priority & Status Demystifier Chips:** P1/P2/P3 build order indicators and explicit `PENDING` / `ACTIVE` / `DONE` chips rendered on CyberNode components.
- **Demystifier Metrics Grid:** Every m1ndmap node now exposes compact AC / EH / CTR / RCH summary slots instead of stacked metadata strips.
- **OMX Export Button:** "Export to OMX" in the RightPanel generates a downloadable `.omx/plan.md` for autonomous materialization and activates Build Mode.
- **BU1LDER Mode:** Live construction environment with CyberNodeBuild animations, BuildConsole, BuildView, Build Tracker Checklist, SSE Streaming.
- **KOMPLETUS Report Modal:** Full-screen report with tabs: Modules, Artifacts, Specular, Summary. "Accept & Continue" triggers zero-click flow into BU1LDER mode.

## 2. Backend API (Express)
- **Secure API Gateway:** Express.js server with all AI keys server-side only.
- **Route-Modular Composition:** `server.ts` is now a thin composition root wiring dedicated routers for `sessions`, `config`, `m1nd`, `omx`, and `ai`.
- **Rate Limiting:** `express-rate-limit` at 20 req/min per IP on all `/api/ai/*` routes.
- **Input Validation:** All POST body fields validated; returns `400` on failure.
- **Schema Validation:** Zod v4 schemas (`src/server/validation.ts`) for all AI responses with graceful defaults.
- **AI Endpoints:**
  - `/api/ai/generateGraphStructure` — DAG generation from prompts
  - `/api/ai/generateProposal` — Modification plan proposals
  - `/api/ai/applyProposal` — Execute proposals against current graph
  - `/api/ai/analyzeArchitecture` — Structural audit and optimization (strips research metadata)
  - `/api/ai/performDeepResearch` — Multi-source deep research on individual modules
  - `/api/ai/kompletus` — Full KOMPLETUS pipeline (SSE streaming, 8 stages)
  - `/api/omx/stream/:sessionId` — SSE endpoint for live build streaming with **SPECULAR MODE** (autonomous test→diagnose→fix→retest loop)

## 3. AI Integration (SSOT Provider Layer)
- **Provider Factory:** `src/server/providers/` with provider-agnostic factory pattern.
- **Four Providers:**
  - `xai` — X.AI Grok via `https://api.x.ai/v1` (OpenAI SDK)
  - `gemini` — Google Gemini via REST API with **key rotation** (`KeyRotator` class, round-robin on 429/quota)
  - `openai` — Direct OpenAI API
  - `bridge` — Local proxy via [THE BRIDGE](https://github.com/maxkle1nz/thebridge) at `http://127.0.0.1:7788/v1`
- **Key Rotation:** `GEMINI_API_KEYS="key1,key2,key3"` for round-robin rotation with auto-fallback on rate limits.
- **Fallback Chain:** `active provider → gemini → bridge → openai → xai`
- **Runtime Model Selector:** Switch providers and models without restart via floating config panel.
- **Live Model Discovery:** `/api/providers` endpoint lists available models per provider.
- **Health Probes:** All 4 providers have dedicated health probes in `provider-runtime.ts`.

## 4. m1nd Engine Integration
- **Server-Side MCP Bridge:** `M1ndBridge` class (`src/server/m1nd-bridge.ts`) spawns `m1nd-mcp` as a child process and communicates via JSON-RPC 2.0 over stdin/stdout (MCP stdio transport).
- **HTTP API (14 endpoints):** `/api/m1nd/*` for health, activate, impact, predict, validate, diagram, layers, metrics, panoramic, search, hypothesize, missing, ingest, and structural-context.
- **Frontend HTTP Client:** `M1ndClient` class (`src/lib/m1nd.ts`) communicates with the backend at `/api/m1nd/*`.
- **Structural Injection:** Kreator proposals are grounded in m1nd blast radius and co-change prediction data.
- **Blast Radius Visualization:** Red pulse for blast origin, orange glow for impact zone nodes.
- **Graceful Degradation:** All m1nd calls return `null` on failure — the Kreator continues without structural awareness.
- **Session Projection Pipeline:** session blueprints are projected through dedicated modules (`session-payload`, `session-topology`, `session-semantic`, `session-projection`, `session-advanced`, `session-insights`, `session-readiness`) instead of living in one oversized analysis file.

## 5. Deep Research Engine
- **Multi-Source Research:** `src/server/web-research.ts` integrates: Perplexity AI, Serper Web + Scholar Search, Semantic Scholar API, CrossRef API, GitHub Code Search, Jina Reader.
- **Document Bindings:** Research results are cross-referenced with m1nd graph nodes.
- **API Endpoint:** `/api/ai/performDeepResearch` with timeout-protected fetches.

## 6. OMX Bridge (v0.4.0)
- **Export Pipeline:** Topological sort (Kahn's algorithm) computes build priority from dependency edges.
- **Acceptance Criteria:** 2–5 testable conditions per module, enforced via Zod schema.
- **Output Format:** `.omx/plan.md` for autonomous materialization by OMX `$ralph`.

## 7. BU1LDER — Live Construction Environment (v0.5.0)
- **State Machine:** `useBuildStore` (Zustand) tracks per-node build status: dormant → queued → building → complete → error.
- **SSE Stream:** `useOMXStream` hook with exponential backoff auto-reconnect.
- **Visual System:** Dark-to-light paradigm with shimmer animations and propagation rings.
- **Build Console:** Animated log feed with "Mission Complete" summary screen.

## 8. KOMPLETUS — Full Pipeline Engine (v0.6.0)
- **8-Stage Pipeline:** `src/server/kompletus-pipeline.ts`
  1. KONSTRUKTOR — skeleton generation from prompt
  2. HARDENER — critic + dreamer pass (wiring + hardening)
  3. SMART TRIAGE — classify modules by research depth
  4. DEEP RESEARCH — parallel grounded research (6 sources)
  5. SPECULAR AUDIT — UIX parity mapping (user moments + coverage)
  6. L1GHT PRE-FLIGHT — contract expansion + cross-node validation
  7. QUALITY GATE — final structural validation with acceptance criteria
  8. KOMPLETUS — delivery with full report
- **SSE Streaming:** Real-time progress events per stage via `/api/ai/kompletus`.
- **Report Modal:** `KompletusReport.tsx` with 4 tabs (Modules, Artifacts, Specular, Summary).
- **Architecture Analyzer Fix:** Strips `researchContext`/`researchMeta` before sending to LLM critic, preventing code/knowledge confusion.

## 9. SPECULAR Protocol (v7)
- **Layer 0 — SPECULAR AUDIT + FRONTEND CREATE:** AI visual drafts per blueprint node.
  - PRIMARY: `gemini-3-pro-image-preview` (Nano Banana Pro)
  - FALLBACK: `gemini-3.1-flash-image-preview` (Nano Banana 2)
  - FALLBACK: Grok 4 Imagine (stack-local xAI)
- **Layer 1 — Parsimônia:** Max 4-5 user moments, domain language only.
- **Layer 2 — SSOT Flow:** Backend = truth, UIX + test = pure consumers.
- **Layer 3 — Technical Parity:** Mirror test uses same SSE parser as UIX.
- **SPECULAR MODE:** Agent autonomously tests → diagnoses → fixes → re-tests. UIX updated only when mirror passes.
- **Mirror Test:** `tests/kompletus-e2e.ts` with SPECULAR assertions (moments, parity score, coverage).

## Tech Stack Summary
| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6, Tailwind 4, Zustand 5, @xyflow/react 12, Framer Motion |
| Backend | Express 4, tsx, Node.js |
| AI | xAI Grok, Google Gemini (key rotation), OpenAI, THE BRIDGE |
| Pipeline | KOMPLETUS (8-stage), SPECULAR (UIX parity) |
| Validation | Zod 4 |
| Graph Engine | m1nd MCP (stdio child process) |
| Research | Perplexity, Serper, Semantic Scholar, CrossRef, GitHub, Jina |
| Testing | Mirror test (E2E SSE parser parity) |

## 10. QA & Audit Status (v0.6.0)
- **TypeScript Build:** 0 errors (`npx tsc --noEmit`).
- **KOMPLETUS Pipeline:** Fully functional, tested with real prompts.
- **SPECULAR Assertions:** Mirror test validates moments count, parity score, coverage.
- **Architecture Analyzer:** Fixed — no longer confuses research data with system modules.
- **Server:** Stable on port 3000 with 4 AI providers, m1nd MCP bridge, and full research engine.
