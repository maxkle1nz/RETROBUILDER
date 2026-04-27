# System Overview

## Project Vision
RETROBUILDER is a session-first visual architecture workbench for designing systems before coding them. It turns natural-language prompts into blueprint-grade module graphs, grounds those blueprints with deep research and m1nd structural analysis, and hands validated plans into the OMX builder runtime.

## Core Objectives
1. Visual architecture design: build and edit typed system graphs in a compact m1ndmap canvas.
2. AI-assisted generation: use the SSOT provider layer to generate skeletons, proposals, contracts, and rationale from prompts.
3. Structural analysis: project the active blueprint into m1nd so users can inspect readiness, impact, gaps, diagrams, layers, metrics, and activation results.
4. Grounded research: attach real-world research and document/code bindings to nodes before committing to implementation.
5. Autonomous handoff: move a validated blueprint into the OMX build lifecycle and finish with a stack-aware runnable manifest.
6. Product DNA: apply curated domain/design/stack guidance through knowledge-bank contracts instead of relying on generic prompts.
7. Specular alignment: keep user-facing surfaces aligned with backend pipeline and runtime behavior instead of decorative status reporting.
8. Local safety: keep sensitive AI/config/build routes behind the local API guard and keep generated/runtime artifacts out of Git history.

## Current Product Shape
- Session-first workflow: new blueprint, reopen session, or import codebase into a backend-backed session.
- Three main modes:
  - ARCHITECT — create and refine the m1ndmap.
  - M1ND — inspect readiness, impact, gaps, grounding, and advanced graph actions.
  - BU1LDER — follow the live OMX build lifecycle and terminal recovery state.
- KOMPLETUS pipeline: 8 stages from skeleton generation to quality-gated report delivery.
- OMX runtime: explicit `build`, `status`, `stop`, and `stream` routes backed by `src/server/omx-runtime.ts`, with final `.omx/runnable-manifest.json` handoff metadata.
- Knowledge bank/Product DNA: versioned packs, validators, receipts, and review routes that guide generation by product type.

## High-Level Architecture
- Frontend: React 19, Vite 6, Tailwind 4, Zustand 5, `@xyflow/react`, motion, lucide-react.
- Backend: Express route modules for `sessions`, `config`, `m1nd`, `omx`, and `ai`.
- AI integration: SSOT provider layer for xAI, Gemini, OpenAI, and THE BRIDGE.
- Local security: token guard for AI/config/m1nd/OMX/import routes plus explicit Git hygiene contracts for generated artifacts.
- m1nd integration: server-side MCP stdio bridge plus session projection/readiness/impact/gap analysis.
- Research: multi-source web research plus m1nd document binding/drift enrichment.
- Build runtime: Codex-backed OMX lifecycle with persisted terminal state and builder reentry hydration.

## Documentation Map
- `README.md` — operator-facing product and setup guide.
- `doc/02-current-state.md` — implementation snapshot aligned to the current mainline runtime.
- `doc/03-m1nd-integration.md` — direct m1nd endpoints and session-projected analysis flow.
- `doc/04-roadmap.md` — what is actually next from the current baseline.
- `doc/05-demystifier-card-spec.md` — current card/UIX design law and remaining card polish.
