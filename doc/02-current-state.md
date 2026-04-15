# Current State of the System

As of v2.5.0, the following features and components have been implemented:

## 1. Frontend Interface (UI/UX)
- **Premium Typography:** Orbitron (display/header), Inter (UI), JetBrains Mono (code/terminal) — loaded from Google Fonts.
- **Cyberpunk Aesthetic:** Dark theme with neon accents, animated grid pulse background, CRT scanlines overlay, smooth transitions.
- **2D Graph Visualization:** Uses `@xyflow/react` (React Flow) for interactive node graphs with auto-layout (dagre).
- **Dual Modes (Header Switcher):** Toggle between **ARCHITECT** and **M1ND** modes. M1ND mode shifts the entire UI to purple tones via CSS variable override (`data-mode="m1nd"`).
- **Live Header Stats:** Real-time uptime counter, live SYNC% (completed/total nodes), node count, version badge. No hardcoded data.
- **Dynamic Right Panel:** Sliding panel for node analysis, m1nd integration, blast radius highlighting.
- **Chat Footer (KREATOR/KONSTRUKTOR):** Adaptive prompt with full chat message history (timestamped, role-tagged, scrollable).
- **Node Context Menu:** Right-click any node for: Rename, Duplicate, Set Status (pending/in-progress/completed), Delete.
- **Panel Collapse/Expand:** Toggle left (checklist) and right (sidebar) panels with animated transitions.
- **Graph Export/Import:** Download graph as JSON, import from file. Buttons in the footer controls.
- **MiniMap Color Legend:** Visual legend showing Frontend (cyan), Backend (purple), Database (orange), Security (red), External (green).
- **Toast Notifications:** All operations (save, delete, error, export, import) surface feedback via Sonner toasts.
- **Keyboard Shortcuts:** ⌘Z (undo), ⌘⇧Z (redo), Esc (close panels), ⌘1/⌘2 (mode switch).
- **Error Boundaries:** App-level and GraphView-level boundaries prevent white-screen crashes.
- **Persistent State:** `zustand/persist` saves graph, manifesto, architecture, and mode to `localStorage`.

## 2. Backend API (Express)
- **Secure API Gateway:** Express.js server (`server.ts`) with all AI keys server-side only.
- **Rate Limiting:** `express-rate-limit` at 20 req/min per IP on all `/api/ai/*` routes.
- **Input Validation:** All POST body fields validated; returns `400` on failure.
- **Schema Validation:** Zod schemas (`src/server/validation.ts`) for all AI responses with graceful defaults.
- **AI Endpoints:**
  - `/api/ai/generateGraphStructure` — DAG generation from prompts
  - `/api/ai/generateProposal` — Modification plan proposals
  - `/api/ai/applyProposal` — Execute proposals against current graph
  - `/api/ai/analyzeArchitecture` — Structural audit and optimization
  - `/api/ai/performDeepResearch` — Deep research on individual modules

## 3. AI Integration (SSOT Provider Layer)
- **Provider Factory:** `src/server/providers/` with provider-agnostic factory pattern.
- **Active Provider:** xAI Grok (`grok-3-mini`) via `https://api.x.ai/v1`.
- **Secondary Provider:** THE BRIDGE (local proxy) via `http://127.0.0.1:7788/v1`.
- Provider selection via `AI_PROVIDER` environment variable (`xai` | `bridge`).
- Structured JSON output formatting for valid graph data.

## 4. m1nd Engine Integration
- **WebSocket Client:** `M1ndClient` (`src/lib/m1nd.ts`) connects to local MCP WebSocket proxy.
- **Core Actions:** `activate`, `warmup`, `impact`, `predict`, `hypothesize`.
- **Blast Radius Visualization:** Red pulse for blast origin, orange glow for impact zone nodes.
- **UI Integration:** M1ND mode routes chat through `m1nd.activate()` with results in chat history.
