# Changelog

All notable changes to RETROBUILDER are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Changed
- **Docs Truth Alignment** — README and docs now reflect the active runtime architecture on `main` instead of older mixed assumptions.
- **OMX Runtime Truth** — the docs now treat `src/server/omx-runtime.ts` + `src/server/routes/omx.ts` as the active build lifecycle path.
- **Specular Honesty** — docs now distinguish between the real KOMPLETUS Specular audit/report contract and the still-open convergence work around legacy builder-side SPECULAR loop expectations.
- **m1nd Truth** — docs now describe the session-projected M1ND cockpit flow alongside the raw `/api/m1nd/*` bridge.

## [0.6.1] — 2026-04-17

### Added
- **SPECULAR MODE** — Autonomous test→diagnose→fix→retest loop:
  - Runs recursively per node in `omx-runner.ts` (up to 3 iterations)
  - Evaluates implementation against Acceptance Criteria + Data Contracts via mirror test (`specular-mirror-test`)
  - Deterministic fallback for disconnected LLM scenarios
  - Emits `specular_iteration` SSE events (testing/failing/fixing/passed) with 🔍❌🔧✅ status icons in Build Console
  - `build_complete` event payload augmented with specular certification summary

### Changed
- **OMX Wiring**: KompletusReport "Accept & Continue" now triggers full zero-click materialize flow: apply graph → `resetBuild()` → `initNodeStates()` → `startBuild()` → activate `builder` view.
- **M1ND Graph Projection Fidelity**: Replaced `auto` full-directory ingestion (791 document nodes) with targeted `topology.md` ingestion (~15 architectural modules), ensuring accurate structural impact metrics.
- Export to OMX functionality significantly refined, cleanly separating architectural signals from `researchContext` noise (blueprint exported payload reduced from ~148KB to ~15KB).

### Fixed
- Fixed critical `M1ndBridge.gatherStructuralContext()` mapping error where nodes were queried by human label (`seeds[0]`) instead of canonical `node_id`, resolving false-positive "Node not found" impact/predict errors.

## [0.6.0] — 2026-04-17

### Added
- **KOMPLETUS Pipeline** — 8-stage autonomous blueprint engine (`kompletus-pipeline.ts`):
  - KONSTRUKTOR → HARDENER → SMART TRIAGE → DEEP RESEARCH → SPECULAR AUDIT → L1GHT PRE-FLIGHT → QUALITY GATE → KOMPLETUS
  - SSE streaming with per-stage progress events
  - Full report modal (`KompletusReport.tsx`) with tabs: Modules, Artifacts, Specular, Summary
- **SPECULAR AUDIT (Stage 5)** — UIX parity mapping:
  - Generates ≤5 "User Moments" per pipeline in domain language
  - Node-to-screen surface coverage matrix
  - Parity score (0-100) measuring backend↔UIX alignment
  - `SpecularView` component with parity gauge, moment cards, coverage matrix
- **Google Gemini Provider** (`providers/gemini.ts`) — Full provider with:
  - **Key Rotation** — `KeyRotator` class with round-robin on 429/quota errors
  - Support for `GEMINI_API_KEYS` (comma-separated) and `GEMINI_API_KEY` (single)
  - Default model: `gemini-3-pro-image-preview` (Nano Banana Pro)
  - Fallback: `gemini-3.1-flash-image-preview` (Nano Banana 2)
  - Health probe in `provider-runtime.ts`
  - Fallback chain: active → gemini → bridge → openai → xai
- **L1GHT Pre-Flight** (`l1ght-preflight.ts`) — Contract expansion + cross-node validation
- **Mirror Test** (`tests/kompletus-e2e.ts`) — E2E test with SPECULAR assertions:
  - Validates moments count (1-5), parity score (0-100), coverage
  - Uses same SSE parser as UIX (Layer 3 technical parity)
- **SPECULAR Protocol v7** — Knowledge item with complete protocol documentation

### Changed
- **Architecture Analyzer** — Strip research metadata before sending to LLM critic:
  - Removes `researchContext`, `researchMeta`, `constructionNotes` from graph payload
  - Adds `researchStatus: "grounded"` flag for research-validated nodes
  - Updated prompt with `IMPORTANT DISTINCTIONS` to prevent code/knowledge confusion
- **Provider Fallback Chain** — Updated to include Gemini: active → gemini → bridge → openai → xai
- **API Types** — `KompletusResult` interface synchronized across pipeline, client, and test (SSOT)

### Fixed
- **Analyze Architecture** — LLM no longer confuses deep research blobs with system modules

---

## [0.4.0] — 2026-04-16

### Added
- **OMX Export Bridge** — Export blueprints as `.omx/plan.md` for autonomous materialization by OMX `$ralph`
- **Topological Sort** — Kahn's algorithm computes build priority from dependency edges
- **Acceptance Criteria** — 2-5 testable conditions per module, enforced via Zod schema
- **Error Handling** — Failure modes and circuit-breaker strategies per node
- **Priority Badges** — P1, P2, P3... build order indicators on graph nodes
- **AC Indicators** — Acceptance criteria count shown on each CyberNode
- **Export Button** — "Export to OMX" in M1ND panel generates downloadable plan

### Changed
- LLM prompts now generate `acceptance_criteria`, `priority`, and `error_handling` for every node
- `applyProposal` preserves existing acceptance criteria for unchanged nodes
- RightPanel shows acceptance criteria, error handling, and build priority for selected nodes

### Fixed
- CyberNode TypeScript generic mismatch with @xyflow/react (12 errors → 0)
- GraphView Node[] type cast (1 error → 0)
- ChatFooter `.nodes.links` incorrect property access (1 error → 0)
- **Total: 19 TypeScript errors → 0**

---

## [0.3.0] — 2026-04-15

### Added
- **M1ND Server Bridge** — MCP stdio client (`m1nd-bridge.ts`) connects to m1nd graph engine
- **14 M1ND API Endpoints** — `/api/m1nd/*` for impact, predict, validate, diagram, layers, metrics, etc.
- **Structural Injection** — Kreator proposals grounded in m1nd blast radius and co-change data
- **Deep Research Engine** — Multi-source research (Perplexity, Semantic Scholar, GitHub, CrossRef, Jina)
- **Web Research Integration** — `/api/ai/performDeepResearch` with document bindings from m1nd
- **L1GHT Protocol Documents** — `doc/l1ght/kreator.md` and `doc/l1ght/research-engine.md`

### Changed
- M1ND frontend client rewritten from WebSocket to HTTP (`src/lib/m1nd.ts`)
- RightPanel: removed WebSocket Connect button, added 6 analysis action buttons
- ChatFooter: HTTP-based m1nd integration, structural summary badges

---

## [0.2.0] — 2026-04-14

### Added
- **Bridge Provider** — Local proxy via [THE BRIDGE](https://github.com/maxkle1nz/thebridge) (zero API keys)
- **OpenAI Provider** — Direct OpenAI API support
- **Runtime Model Selector** — Switch AI providers and models without restart
- **Live Model Discovery** — `/api/providers` endpoint lists available models per provider
- **Model Config Panel** — Floating UI panel for provider switching and model selection
- **Copilot/Codex Models** — Bridge catalog includes Copilot (gpt-5.4), Codex (gpt-5.4-mini)

---

## [0.1.0] — 2026-04-13

### Added
- Initial release
- AI-powered blueprint generation from natural language
- DAG visualization with React Flow (typed nodes, labeled edges)
- Cyberpunk design system (dark void, glassmorphism, animated nodes)
- xAI Grok provider integration
- SSOT provider architecture (`chatCompletion` contract)
- Dual modes: Architect (build) and M1ND (analyze)
- Node context menu (rename, delete, duplicate, set status)
- Graph import/export (JSON)
- Proposal workflow (generate → review → apply)
- Zod-based AI response validation
