<div align="center">

**From prompt to connected blueprint to runnable build.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[Why Retrobuilder](#why-retrobuilder) · [What You Can Build](#what-you-can-build) · [Getting Started](#getting-started) · [Architecture](#architecture) · [Docs](#documentation) · [Join](#join-the-team)

</div>

---

# RETROBUILDER

> Retrobuilder turns a product idea into a connected system blueprint, then carries that blueprint into a verified build.

Describe what you want to build. Retrobuilder plans the architecture, stack, data model, user flows, design surfaces, and runtime path as editable cards before code is generated.

You can inspect the system, adjust the structure, validate the risky parts, and keep frontend, backend, database, services, and design decisions connected from the start.

When the plan is ready, Retrobuilder turns it into execution: contracts, generated workspace, verification, run scripts, preview links, and a path to the final run.

```text
Prompt -> blueprint -> validated system -> generated workspace -> final run
```

Retrobuilder combines visual architecture, stack planning, research, design preparation, m1nd analysis, KOMPLETUS reporting, and OMX build orchestration in one flow.

## Why Retrobuilder?

Retrobuilder gives builders a shared map before implementation starts.

That map makes the important decisions visible:
- the implementation path and stack
- the database, frontend, backend, services, SSOT, design, and runtime boundaries
- the contracts, acceptance criteria, and error handling attached to each module
- the dependencies and blast radius behind every change
- the handoff from planned system to real build runtime

```text
Design the system. Validate the plan. Build with context.
```

## What You Can Build

Retrobuilder is domain-agnostic. Each project gets its own structure, stack, and build path.

Good fits include:
- AI-native SaaS products with frontend, backend, database, billing, admin, and observability surfaces
- internal tools, dashboards, CRMs, booking systems, and WhatsApp/customer-operation workflows
- mobile-first customer apps with authenticated flows, subscriptions, invoices, and service history
- creative software, interactive prototypes, and game-like experiences that need asset, scene, state, and runtime planning
- operational systems where SSOT, permissions, audit trails, integrations, and reliability matter from day one

## Getting Started

Prerequisites:
- Node.js 22+ required
- `m1nd-mcp` available in PATH if you want live m1nd features
- one configured AI provider (`xAI`, `Gemini`, `OpenAI`, or `THE BRIDGE`)

```bash
# Clone
git clone https://github.com/maxkle1nz/RETROBUILDER.git
cd RETROBUILDER

# Install
npm install

# Configure
cp .env.example .env.local
# edit .env.local with your provider keys / bridge settings

# Run
npm run dev
```

The app launches at:
- `http://localhost:7777`

### Verification

```bash
npm run verify:readiness
```

This is the main local release gate. It covers generated-workspace verification, SPECULAR/OMX contracts, m1nd health, and browser smoke coverage.

Focused checks:

```bash
npm run verify:security
npm run verify:handoff
npm run verify:providers
npm run verify:specular
```

Live provider verification is optional, keeping local checks budget-safe:

```bash
RETROBUILDER_RUN_LIVE_E2E=1 RETROBUILDER_BROWSER_ARTIFACT_DIR=.retrobuilder/browser-artifacts npm run verify:live-kompletus-browser
```

### Provider Setup

Retrobuilder uses one provider contract across the UI and server.

| Provider | Config | Key Required |
|---|---|---|
| THE BRIDGE | `AI_PROVIDER="bridge"` | none by default |
| xAI Grok | `AI_PROVIDER="xai"` | `XAI_API_KEY` |
| Google Gemini | `AI_PROVIDER="gemini"` | `GEMINI_API_KEY` or `GEMINI_API_KEYS` |
| OpenAI | `AI_PROVIDER="openai"` | `OPENAI_API_KEY` |

Common local setups:

```bash
# Local bridge default
AI_PROVIDER="bridge"
THEBRIDGE_URL="http://127.0.0.1:7788/v1"
THEBRIDGE_MODEL="gpt-5.5"

# xAI
AI_PROVIDER="xai"
XAI_API_KEY="xai-..."

# Gemini
AI_PROVIDER="gemini"
GEMINI_API_KEYS="key1,key2,key3"
```

THE BRIDGE can be auto-started with Retrobuilder. Advanced bridge paths, auth profiles, local Codex fallback, and model overrides are documented in `.env.example`.

Sensitive local routes (`/api/ai`, `/api/config`, `/api/m1nd`, `/api/omx`, and codebase import) use the local API token guard. Binding to `0.0.0.0` or `::` requires `RETROBUILDER_LOCAL_API_TOKEN`.

## Current State

Current implementation:
- package version: `0.6.1`
- runtime floor: Node.js `>=22.0.0`
- working shape: session-backed blueprints, m1nd analysis, KOMPLETUS, SPECULAR CREATE, and OMX build runtime
- verification: lint, production build, generated-workspace contracts, security checks, provider checks, and browser smoke tests

Available today:
- session launcher with backend persistence
- ARCHITECT / M1ND / BU1LDER modes
- Spotlight node search (`⌘K`)
- NodeInspector + grounding actions + UIX editor
- KOMPLETUS report with Specular + Specular Create surfaces
- SPECULAR showcase route with browser-readable manifest
- OMX `build/status/stop/stream` lifecycle
- 21st-backed design gate at OMX start/build status
- builder reentry with persisted terminal output
- browser smoke tests for shell, SPECULAR showcase, blocked build, happy-path build, and resume flows

## Architecture

```text
Frontend
  React 19 · Zustand · @xyflow/react · motion
  App · GraphView · NodeInspector · RightPanel · ChatFooter · KompletusReport · BuildView

        |
        | HTTP / SSE
        v

Express API Gateway
  routes/ai.ts
  routes/config.ts
  routes/m1nd.ts
  routes/omx.ts
  routes/sessions.ts

        |
        +--> SSOT provider runtime
        +--> m1nd MCP bridge
        +--> session projection / readiness / impact / gaps
        +--> KOMPLETUS pipeline
        +--> OMX runtime lifecycle
```

Backend layout:
- `server.ts` is now a thin composition root.
- m1nd API access lives in `src/server/routes/m1nd.ts`.
- projected session analysis lives through `src/server/session-analysis.ts` + `src/server/routes/sessions.ts`.
- active OMX runtime is `src/server/omx-runtime.ts`.

## Product Flow

### 1. Session-first entry
Users begin in the session launcher:
- new blueprint
- reopen saved session
- import codebase into a blueprint session

Session content is persisted on the backend.
Some UI preferences are still persisted locally for convenience.

### 2. ARCHITECT mode
The graph canvas is the primary blueprint surface.

Users can:
- generate a fresh m1ndmap skeleton
- edit nodes directly through NodeInspector
- add grounding to nodes
- run proposal-based graph mutations
- search nodes with Spotlight

### 3. M1ND mode
M1ND mode brings session-aware analysis into the blueprint.

Current tabs:
- Ready
- Impact
- Gaps
- Grounding
- Advanced

Those tabs let the user inspect:
- export readiness / blockers
- upstream/downstream impact
- missing AC / contracts / EH
- grounded research
- advanced m1nd output

### 4. KOMPLETUS
KOMPLETUS is the full-pipeline path.

Current stages:
1. konstruktor
2. hardener
3. triage
4. research
5. specular
6. l1ght
7. quality
8. complete

The result opens `KompletusReport` with four views:
- Modules
- Artifacts
- Specular
- Summary

### 5. BU1LDER / OMX handoff
From `KompletusReport`, `Accept & Continue to OMX`:
- persists/hydrates the active session
- starts an OMX build
- hydrates `useBuildStore`
- enters `BU1LDER` mode after the runtime confirms the build has started

## M1ND Mode

RETROBUILDER integrates with m1nd in two layers:

1. API bridge
- `/api/m1nd/*`
- `src/server/m1nd-bridge.ts`
- `src/lib/m1nd.ts`

2. Session-projected analysis layer
- `src/server/session-projection.ts`
- `src/server/session-analysis.ts`
- `src/server/routes/sessions.ts`

That gives the product two kinds of structural context:
- direct graph operations
- active-blueprint-aware analysis

m1nd setup note:
- the backend auto-spawns `m1nd-mcp` when it is available in PATH
- m1nd runs through the backend stdio bridge

## KOMPLETUS & Specular

Specular checks how the planned system becomes user-facing product:
- user moments
- coverage matrix
- node-screen map
- parity score
- UIX preview variants
- 21st design verdicts

`tests/kompletus-e2e.ts` covers the same SSE parser used by the browser transport.

### SPECULAR CREATE

`SPECULAR CREATE` is the UIX generation layer for user-facing nodes.

It provides:
- 21st-inspired local reference candidates
- 3+ UI variants per user-facing node
- TSX-backed preview artifacts
- persisted preview/design metadata on the session node
- design verdict scoring and findings
- browser-smoke-verified blocked-build return flow back into UIX correction

## OMX Runtime

The active OMX runtime is lifecycle-first and route-backed.

Current routes:
- `POST /api/omx/build`
- `GET /api/omx/status/:sessionId`
- `POST /api/omx/stop/:sessionId`
- `GET /api/omx/stream/:sessionId`

Runtime behavior:
- OMX start is blocked when the 21st design gate fails
- blocked build status is persisted for reload/reentry
- successful build completion reports SPECULAR gate approval
- BuildView / BuildConsole surface the design gate state

Browser-smoke commands:

```bash
npm run smoke:ui
npm run smoke:ui:blocked
npm run smoke:ui:happy
npm run smoke:ui:resume
```

Runtime behavior covered by tests:
- explicit start before entering builder mode
- persisted `queued/running/stopping/stopped/succeeded/failed` status
- terminal summary/message persistence
- builder reentry hydration from remote status
- fallback when terminal SSE is missed
- rejection when Codex transport is unavailable
- stopped-build reuse guard

## Testing & Verification

Useful local checks:

```bash
npm run lint
npm run build
npm run verify:security
npm run verify:readiness
npm run verify:specular
```

CI automation lives in `.github/workflows/readiness.yml`:
- the always-on `core` job runs typecheck, production build, generated-workspace contracts, Git/security guardrails, and readiness drift checks
- the manual `full-readiness` job runs `npm run verify:readiness` and uploads runtime artifacts

Set `RETROBUILDER_BROWSER_ARTIFACT_DIR=.retrobuilder/browser-artifacts` to retain PNG artifacts from browser smoke runs.

Repo hygiene guardrails keep local artifacts out of Git and are covered by `npm run verify:git`.

## Documentation

| Document | Description |
|---|---|
| [Overview](doc/01-overview.md) | product vision and architecture summary |
| [Current State](doc/02-current-state.md) | implementation snapshot |
| [M1ND Integration](doc/03-m1nd-integration.md) | API bridge + session-projected analysis flow |
| [Roadmap](doc/04-roadmap.md) | active roadmap |
| [Demystifier Card Spec](doc/05-demystifier-card-spec.md) | current card/UIX design law |
| [L1GHT: Kreator](doc/l1ght/kreator.md) | authoring subsystem protocol |
| [L1GHT: Research](doc/l1ght/research-engine.md) | grounding subsystem protocol |
| [L1GHT: OMX 2 Runtime](doc/l1ght/omx2-runtime.md) | runtime model and active implementation slice |
| [L1GHT: OMX 2 Scheduler](doc/l1ght/omx2-scheduler.md) | execution graph, waves, ownership, and task policy |
| [L1GHT: OMX 2 Ledger](doc/l1ght/omx2-ledger.md) | durable event model, receipts, and resume model |
| [L1GHT: OMX 2 Checkpoints](doc/l1ght/omx2-checkpoints.md) | phased checkpoints for the active OMX 2 program |
| [Changelog](CHANGELOG.md) | release history + current docs-alignment note |

## Release Notes

Current focus areas:

1. Expand live-provider end-to-end verification across the full path:
   prompt -> m1ndmap -> grounding -> live KOMPLETUS -> OMX -> generated workspace -> reload/reentry.
2. Remove remaining `specular_iteration` / `omx-runner.ts` compatibility references from older surfaces.
3. Keep browser smoke coverage stable across local Chromium and test-port differences.
4. Continue frontend payload reduction work.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6, Tailwind 4, Zustand 5, `@xyflow/react`, motion |
| Backend | Express 4, TypeScript, route-modular API |
| AI Providers | xAI, Gemini, OpenAI, THE BRIDGE |
| Graph Engine | m1nd MCP bridge (stdio child process) |
| Pipeline | KOMPLETUS + L1GHT pre-flight + Specular audit |
| Build Runtime | OMX lifecycle runtime with Codex transport checks |
| Research | Perplexity, Serper, Semantic Scholar, CrossRef, GitHub, Jina |

## Join the Team

Retrobuilder is a deep system: part visual architecture workbench, part orchestration runtime, part design review system, part research system, and part build pipeline.

We are looking for programmers, systems thinkers, interface designers, product engineers, researchers, and technical builders who can turn ambiguity into working structure.

This project needs people who can move between concept and execution, prototype quickly without dropping rigor, and ship software that is durable under real use.

We value demonstrated work over pedigree. Send a repo, demo, prototype, interface, game, automation, agent workflow, essay, or one hard problem you have stayed with long enough to understand.

### Competencies We Need

- Product systems and architecture: turning ambiguous ideas into modular blueprints, SSOTs, contracts, acceptance criteria, and runnable plans.
- AI and agent runtime engineering: Codex/OpenAI/local-model workflows, tool orchestration, streaming, provider abstractions, retries, logs, and long-running build state.
- Frontend and interaction design: React, graph canvases, motion, responsive workbench UX, product-grade flows, and distinctive design systems.
- Generated software and build pipelines: stack selection, templates, generated workspaces, verification scripts, preview links, run commands, and final handoff hardening.
- Data, backend, and security: APIs, auth, RBAC, databases, audit trails, local-first security boundaries, dependency hygiene, and operational reliability.
- Creative direction and product writing: narrative, naming, onboarding, prompt systems, demo concepts, visual taste, and unconventional but useful ideas.

### Apply

Email [kleinz@cosmophonix.com](mailto:kleinz@cosmophonix.com?subject=Retrobuilder%20Team%20Application) with:
- who you are and what kind of builder you are
- 1-3 links to work you are proud of
- the Retrobuilder lane you want to attack
- one sentence about what you think software creation should feel like in 2026

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">
Built by [maxkle1nz](https://github.com/maxkle1nz)
</div>
