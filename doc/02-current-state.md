# Current State of the System

As of v0.5.0 (2026-04-16), the following features and components are implemented:

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
- **Priority Badges:** P1/P2/P3 build order indicators rendered on CyberNode components.
- **AC Indicators:** Acceptance criteria count displayed on each node.
- **OMX Export Button:** "Export to OMX" in the M1ND RightPanel generates a downloadable `.omx/plan.md` for autonomous materialization and activates Build Mode.
- **BU1LDER Mode (v0.5.0):** Live construction environment with:
  - **CyberNodeBuild:** Dark-to-light animated nodes (dormant → queued → building → complete → error) with shimmer, flood-fill, and propagation ring effects.
  - **BuildConsole:** Structured real-time log feed with active node progress, file tracking, and "Mission Complete" metrics screen.
  - **BuildView:** ReactFlow canvas with build-mode nodes, MiniMap illumination, and fading dormant overlay.
  - **Build Tracker Checklist:** Dual-mode sidebar that transforms from project skeleton into live node-by-node construction tracker.
  - **SSE Streaming:** Real-time Server-Sent Events from the OMX simulation engine with exponential backoff reconnect.

## 2. Backend API (Express)
- **Secure API Gateway:** Express.js server (`server.ts`) with all AI keys server-side only.
- **Rate Limiting:** `express-rate-limit` at 20 req/min per IP on all `/api/ai/*` routes.
- **Input Validation:** All POST body fields validated; returns `400` on failure.
- **Schema Validation:** Zod v4 schemas (`src/server/validation.ts`) for all AI responses with graceful defaults.
- **AI Endpoints:**
  - `/api/ai/generateGraphStructure` — DAG generation from prompts
  - `/api/ai/generateProposal` — Modification plan proposals
  - `/api/ai/applyProposal` — Execute proposals against current graph
  - `/api/ai/analyzeArchitecture` — Structural audit and optimization
  - `/api/ai/performDeepResearch` — Multi-source deep research on individual modules
  - `/api/omx/stream/:sessionId` — SSE endpoint for live build streaming (v0.5.0)

## 3. AI Integration (SSOT Provider Layer)
- **Provider Factory:** `src/server/providers/` with provider-agnostic factory pattern.
- **Three Providers:**
  - `xai` — X.AI Grok via `https://api.x.ai/v1` (OpenAI SDK)
  - `openai` — Direct OpenAI API
  - `bridge` — Local proxy via [THE BRIDGE](https://github.com/maxkle1nz/thebridge) at `http://127.0.0.1:7788/v1` (zero API keys, includes Copilot/Codex models)
- **Runtime Model Selector:** Switch providers and models without restart via floating config panel.
- **Live Model Discovery:** `/api/providers` endpoint lists available models per provider.
- Provider selection via `AI_PROVIDER` environment variable (`xai` | `openai` | `bridge`) or runtime API.
- Structured JSON output formatting for valid graph data.

## 4. m1nd Engine Integration
- **Server-Side MCP Bridge:** `M1ndBridge` class (`src/server/m1nd-bridge.ts`) spawns `m1nd-mcp` as a child process and communicates via JSON-RPC 2.0 over stdin/stdout (MCP stdio transport).
- **HTTP API (14 endpoints):** `/api/m1nd/*` for health, activate, impact, predict, validate, diagram, layers, metrics, panoramic, search, hypothesize, missing, ingest, and structural-context.
- **Frontend HTTP Client:** `M1ndClient` class (`src/lib/m1nd.ts`) communicates with the backend at `/api/m1nd/*`. No direct WebSocket — the Express server handles process management and reconnection.
- **Structural Injection:** Kreator proposals are grounded in m1nd blast radius and co-change prediction data.
- **Blast Radius Visualization:** Red pulse for blast origin, orange glow for impact zone nodes.
- **M1ND Mode UI:** RightPanel provides 6 analysis action buttons (Impact, Predict, Validate, Layers, Metrics, Diagram) with result display.
- **Graceful Degradation:** All m1nd calls return `null` on failure — the Kreator continues without structural awareness.

## 5. Deep Research Engine
- **Multi-Source Research:** `src/server/web-research.ts` integrates:
  - Perplexity AI (sonar model)
  - Serper Web + Scholar Search
  - Semantic Scholar API
  - CrossRef API
  - GitHub Code Search
  - Jina Reader (URL → structured text)
- **Document Bindings:** Research results are cross-referenced with m1nd graph nodes.
- **API Endpoint:** `/api/ai/performDeepResearch` with timeout-protected fetches.

## 6. OMX Bridge (v0.4.0)
- **Export Pipeline:** Topological sort (Kahn's algorithm) computes build priority from dependency edges.
- **Acceptance Criteria:** 2–5 testable conditions per module, enforced via Zod schema and generated by AI.
- **Error Handling Models:** Failure modes and circuit-breaker strategies per node.
- **Output Format:** `.omx/plan.md` for autonomous materialization by OMX `$ralph`.

## 7. BU1LDER — Live Construction Environment (v0.5.0)
- **State Machine:** `useBuildStore` (Zustand) tracks per-node build status through 5 states: dormant → queued → building → complete → error.
- **SSE Stream:** `useOMXStream` hook connects to `/api/omx/stream/:sessionId` with exponential backoff auto-reconnect.
- **OMX Runner:** Server-side topological sort (Kahn's algorithm) drives a simulation engine that emits typed SSE events: `build_start`, `node_start`, `node_progress`, `node_complete`, `edge_activated`, `build_complete`.
- **Visual System:** Dark-to-light paradigm — nodes start completely dark and illuminate as the build progresses, with shimmer animations during building and propagation rings on completion.
- **Build Console:** Animated log feed with phase tracking, active node progress bar, error highlighting, and a "Mission Complete" summary screen with file/line/time metrics.
- **3-Mode Architecture:** The app now supports ARCHITECT (cyan), M1ND (purple), and BU1LDER (green) — each with full CSS theming via `data-mode` attribute.

## Tech Stack Summary
| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6, Tailwind 4, Zustand 5, @xyflow/react 12, Three.js, Framer Motion |
| Backend | Express 4, tsx, Node.js |
| AI | OpenAI SDK 6 (xAI, OpenAI, Bridge) |
| Validation | Zod 4 |
| Graph Engine | m1nd MCP (stdio child process) |
| Research | Perplexity, Serper, Semantic Scholar, CrossRef, GitHub, Jina |

## 8. QA & Audit Status (v0.5.0)
As of the latest release, the system has undergone a full Autonomous E2E Validation and an explicit `m1nd.audit(profile: production)`:
- **Graph Integrity:** Connectivity (B), Duplication (A), Staleness (A).
- **Core Stability:** The JSON extraction engine handles unstructured LLM reasoning blocks flawlessly via a depth-tracking parser.
- **Identified Autonomous Limitations (Pending):**
  - **OMX Scaffolding:** `plan.md` outputs lack "Phase 0" environment boots (e.g. `npm init`, `package.json`).
  - **Cycle Handling:** The DAG can be hallucinated by the LLM into cyclic dependencies, requiring server-side guardrails.
