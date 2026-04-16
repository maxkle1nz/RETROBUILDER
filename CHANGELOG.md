# Changelog

All notable changes to RETROBUILDER are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
