<div align="center">

**Design systems before you build them.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[Getting Started](#getting-started) · [Architecture](#architecture) · [Current State](#current-state) · [M1ND Mode](#m1nd-mode) · [OMX Runtime](#omx-runtime) · [Documentation](#documentation)

</div>

---

# M1ND // RETROBUILDER

> A session-first blueprint workbench that turns prompts into grounded system graphs, audits those graphs with m1nd, and hands validated plans into a live OMX build runtime.

RETROBUILDER sits between idea and implementation:

```text
Describe -> generate blueprint -> ground -> audit -> validate -> hand off -> watch build truth
```

It is not just a graph toy and not just a code generator.
The product today combines:
- blueprint generation
- deep research
- projected m1nd analysis
- KOMPLETUS full-pipeline reporting
- real OMX lifecycle handoff into BU1LDER mode

## Why RETROBUILDER?

Most AI coding tools start from files.
RETROBUILDER starts from architecture.

That means you can:
- design module boundaries before writing code
- attach contracts, acceptance criteria, and error handling to nodes
- inspect structural blast radius and readiness before materialization
- hand a curated blueprint into a real build runtime instead of guessing from prose

## Current State

Current main-branch baseline:
- branch: `main`
- package version: `0.6.1`
- runtime floor: Node.js `>=22.0.0`
- current focused verification: lint, production build, generated-workspace verification, SPECULAR route contracts, and SPECULAR showcase browser truth smoke pass on the working tree
- working shape: session-backed blueprints + m1nd cockpit + KOMPLETUS + SPECULAR CREATE + real OMX runtime

Current codebase size snapshot:
- TypeScript/TSX files in `src/`: 84
- source LOC in `src/`: 29,925
- rough function/export/arrow-function pattern matches in `src/`: 1,069
- AI providers: 4
- KOMPLETUS stages: 8

What is already real:
- session launcher with backend persistence
- ARCHITECT / M1ND / BU1LDER modes
- Spotlight node search (`⌘K`)
- NodeInspector + grounding actions + UIX editor
- KOMPLETUS report with Specular + Specular Create surfaces
- SPECULAR showcase route with browser-readable truth manifest (`#rb-specular-truth`)
- OMX `build/status/stop/stream` lifecycle
- 21st-backed design gate at OMX start/build status
- builder reentry with persisted terminal truth
- browser smoke tests for shell, SPECULAR showcase truth, blocked build, happy-path build, and resume flows

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

Preferred local readiness verification:

```bash
npm run verify:readiness
```

This is the canonical local release gate. It runs generated-workspace verification first, then the full SPECULAR/OMX/m1nd/browser truth lane.

Focused guardrail checks:

```bash
npm run verify:security
npm run verify:handoff
npm run verify:providers
```

`verify:security` runs `npm audit --audit-level=moderate`, the Git hygiene contract, the local API auth contract, and the runtime security guardrails. Use it before staging large worktrees so generated screenshots, local vendor trees, personal paths, and unsafe Codex fallback behavior do not leak into review.

Quick verification for the focused SPECULAR/OMX lane:

```bash
npm run verify:specular
```

This runs:
- typecheck
- production build
- m1nd runtime health smoke
- SPECULAR CREATE contract/runtime tests
- OMX contract/runtime tests
- Chromium CDP browser smoke tests: 6-scenario workbench matrix plus SPECULAR showcase truth manifest

`npm run verify:specular` uses `RETROBUILDER_TEST_BASE` or `http://127.0.0.1:7777` by default. If that base URL is not already healthy, the script starts a temporary Retrobuilder server, waits for `/api/health`, runs the suite, and tears down only the server it started. Local Chromium is still required for browser smoke tests. For the focused SPECULAR browser proof against another running server, use:

```bash
RETROBUILDER_TEST_BASE=http://127.0.0.1:7777 npm run smoke:ui:specular-showcase
```

Opt-in live external-provider browser proof:

```bash
RETROBUILDER_RUN_LIVE_E2E=1 RETROBUILDER_BROWSER_ARTIFACT_DIR=.retrobuilder/browser-artifacts npm run verify:live-kompletus-browser
```

This is intentionally not part of `verify:readiness`. It runs the live KOMPLETUS SSE pipeline, persists the generated session, opens the SPECULAR showcase in Chromium, captures PNG evidence, and hands the session into BU1LDER. Without `RETROBUILDER_RUN_LIVE_E2E=1`, it exits with a `SKIP` so CI/local gates never spend external-provider budget by surprise.

### Provider Setup

RETROBUILDER uses a SSOT provider layer.
All providers share the same frontend contract and are switched at runtime via the UI.

| Provider | Config | Key Required |
|---|---|---|
| THE BRIDGE | `AI_PROVIDER="bridge"` | none; RETROBUILDER auto-starts the local bridge companion by default |
| xAI Grok | `AI_PROVIDER="xai"` | `XAI_API_KEY` |
| Google Gemini | `AI_PROVIDER="gemini"` | `GEMINI_API_KEY` or `GEMINI_API_KEYS` |
| OpenAI | `AI_PROVIDER="openai"` | `OPENAI_API_KEY` |

Example:

```bash
# .env.local — local bridge default
AI_PROVIDER="bridge"
THEBRIDGE_URL="http://127.0.0.1:7788/v1"
THEBRIDGE_MODEL="gpt-5.5"
# optional: THEBRIDGE_AUTH_PROFILE="openai-codex:default"
# optional: OPENCLAW_AUTH_PROFILES_PATH="/absolute/path/to/auth-profiles.json"
# optional: THEBRIDGE_COMMAND="/absolute/path/to/thebridge"
# optional: THEBRIDGE_DONOR_ROOT="/absolute/path/to/the-bridge"
# optional: CODEX_BINARY="/absolute/path/to/newer/codex"
# optional: RETROBUILDER_CODEX_EXEC_TIMEOUT_MS=180000
# optional trusted-only fallback: RETROBUILDER_ENABLE_LOCAL_CODEX_FALLBACK=1
# optional opt-out: THEBRIDGE_AUTO_START="0"

# .env.local — xAI, explicit key-backed mode
AI_PROVIDER="xai"
XAI_API_KEY="xai-..."

# .env.local — Gemini
AI_PROVIDER="gemini"
GEMINI_API_KEYS="key1,key2,key3"
```

THE BRIDGE is treated as a companion runtime: when RETROBUILDER boots, it tries to launch or reuse THE BRIDGE and then keeps a lightweight keepalive running while the server process is alive. The local Codex lane defaults to `gpt-5.5`; if the system Codex binary lags new model support, set `CODEX_BINARY` to a newer local Codex CLI. Set `THEBRIDGE_AUTO_START="0"` only when you want to manage the bridge manually. The server-triggered local Codex JSON fallback is disabled by default and only activates with `RETROBUILDER_ENABLE_LOCAL_CODEX_FALLBACK=1`; when enabled, it uses a read-only sandbox and no dangerous sandbox-bypass flag.

Sensitive local routes (`/api/ai`, `/api/config`, `/api/m1nd`, `/api/omx`, and codebase import) share the local API token guard. Retrobuilder refuses to bind to `0.0.0.0` or `::` unless `RETROBUILDER_LOCAL_API_TOKEN` is set; pair it with `VITE_RETROBUILDER_LOCAL_API_TOKEN` for the local dev UI. The browser helper keeps manually supplied tokens in memory only; it no longer reads persistent `localStorage` token state.

Local Codex live completion through THE BRIDGE can be verified without OpenClaw auth profiles:

```bash
npm run verify:providers:codex-live
```

Profile-backed Codex/Copilot live completions require local OpenClaw auth profiles. The normal provider smoke keeps CI/developer onboarding unblocked and reports missing profiles as an explicit skip. To require the full live proof, set `OPENCLAW_AUTH_PROFILES_PATH` to an `auth-profiles.json` containing `openai-codex:default` and `github-copilot:github`, then run:

```bash
npm run verify:providers:live
```

That strict command first proves the local Codex bridge path, then sets `BRIDGE_REQUIRE_LIVE_PROFILES=1` and fails if the profile-backed Codex/Copilot lanes cannot complete real requests through THE BRIDGE.

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

Important current backend truths:
- `server.ts` is now a thin composition root.
- raw m1nd access lives in `src/server/routes/m1nd.ts`.
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
M1ND mode is now a cockpit over the active session, not just a bag of raw actions.

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
- raw/near-raw advanced m1nd output

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
- starts a real OMX build
- hydrates `useBuildStore`
- enters `BU1LDER` mode only after build start truth is returned

## M1ND Mode

RETROBUILDER integrates with m1nd in two layers:

1. Raw HTTP bridge
- `/api/m1nd/*`
- `src/server/m1nd-bridge.ts`
- `src/lib/m1nd.ts`

2. Session-projected analysis layer
- `src/server/session-projection.ts`
- `src/server/session-analysis.ts`
- `src/server/routes/sessions.ts`

That gives the product two kinds of structural truth:
- direct graph operations
- active-blueprint-aware cockpit analysis

m1nd setup note:
- the backend auto-spawns `m1nd-mcp` when it is available in PATH
- there is no separate WebSocket bridge to launch manually

## KOMPLETUS & Specular

What Specular means today:
- KOMPLETUS produces a `specular` payload
- KOMPLETUS also produces a `specularCreate` payload for user-facing nodes
- the report renders:
  - user moments
  - coverage matrix
  - node-screen map
  - parity score
  - live UIX preview variants
  - 21st design verdicts
- `tests/kompletus-e2e.ts` uses the same SSE parser as the browser transport

That means the blueprint/report-level specular audit is real and test-backed.

### SPECULAR CREATE

`SPECULAR CREATE` is the UIX generation layer for user-facing nodes.

It currently provides:
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

Current runtime truths:
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

Current runtime guarantees already validated by tests:
- explicit start before entering builder mode
- persisted `queued/running/stopping/stopped/succeeded/failed` truth
- terminal summary/message persistence
- builder reentry hydration from remote status
- fallback when terminal SSE is missed
- rejection when Codex transport is unavailable instead of fake success
- stopped-build reuse guard

## Testing & Verification

Verified commands on the current baseline:

```bash
npm run lint
npm run build
npm run verify:security
npm run verify:handoff
npm run verify:providers
npm run verify:generated-workspace
npm run verify:readiness
npm run verify:specular
npx tsx tests/specular-create-route.test.ts
npx tsx tests/kompletus-e2e.ts
npx tsx tests/omx-client-contract.test.ts
npx tsx tests/omx-real-contract.test.ts
npx tsx tests/session-route-wiring.test.ts
```

CI automation lives in `.github/workflows/readiness.yml`:
- the always-on `core` job runs typecheck, production build, generated-workspace contracts, Git/security guardrails, and readiness/CI drift contracts
- the manual `full-readiness` job runs `npm run verify:readiness` and uploads `.omx/logs`, `.retrobuilder/browser-artifacts`, and `dist` artifacts
- full readiness intentionally requires a runner where m1nd is available; if m1nd is not reachable, the m1nd health smoke fails instead of silently downgrading the proof

The browser workbench matrix includes a deterministic mechanic CRM full journey: session creation, SPECULAR generate/save, showcase truth manifest, OMX handoff, reload, and BU1LDER reentry preservation.
Set `RETROBUILDER_BROWSER_ARTIFACT_DIR=.retrobuilder/browser-artifacts` during `npm run verify:specular` or `npm run verify:readiness` to retain PNG proof for the full-journey showcase, builder handoff, reload reentry, and SPECULAR showcase desktop/mobile views.

Repo hygiene guardrails keep local evidence out of Git: `.omx-codex-app-bridge/`, `artifacts/`, `doc/reports/`, `__pycache__`, `.pyc`, prompt `ingest_roots.json`, and root `retrobuilder-*.png` snapshots are ignored and covered by `npm run verify:git`. Treat `doc/reports/` as local evidence output, not as a public source-doc directory.

## Documentation

| Document | Description |
|---|---|
| [Overview](doc/01-overview.md) | product vision and architecture summary |
| [Current State](doc/02-current-state.md) | honest implementation snapshot |
| [M1ND Integration](doc/03-m1nd-integration.md) | raw bridge + session-projected analysis flow |
| [Roadmap](doc/04-roadmap.md) | only the work that is truly still open |
| [Demystifier Card Spec](doc/05-demystifier-card-spec.md) | current card/UIX design law |
| [L1GHT: Kreator](doc/l1ght/kreator.md) | authoring subsystem protocol |
| [L1GHT: Research](doc/l1ght/research-engine.md) | grounding subsystem protocol |
| [L1GHT: OMX 2 Runtime](doc/l1ght/omx2-runtime.md) | runtime truth, laws, and active implementation slice |
| [L1GHT: OMX 2 Scheduler](doc/l1ght/omx2-scheduler.md) | execution graph, waves, ownership, and task policy |
| [L1GHT: OMX 2 Ledger](doc/l1ght/omx2-ledger.md) | durable event model, receipts, and resume truth |
| [L1GHT: OMX 2 Checkpoints](doc/l1ght/omx2-checkpoints.md) | phased checkpoints for the active OMX 2 program |
| [Changelog](CHANGELOG.md) | release history + current docs-alignment note |

## Known Current Gaps

These gaps are important and intentional to state explicitly:

1. The deterministic SPECULAR/OMX/reload journey is browser-proved with optional screenshot artifacts, and an opt-in live KOMPLETUS browser harness now exists. What is still missing for a 100% release claim is fresh successful evidence from running that live harness with real provider credentials:
   prompt -> m1ndmap -> grounding -> live KOMPLETUS -> OMX -> generated workspace -> reload/reentry.
2. The active OMX runtime is `omx-runtime.ts`, while compatibility surfaces still know about the older `specular_iteration` loop around `omx-runner.ts`.
3. `npm run verify:specular` now self-starts Retrobuilder when needed, but it is still local-environment dependent because it needs local Chromium and an available test port.
4. Frontend chunking still needs a performance pass.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6, Tailwind 4, Zustand 5, `@xyflow/react`, motion |
| Backend | Express 4, TypeScript, route-modular API |
| AI Providers | xAI, Gemini, OpenAI, THE BRIDGE |
| Graph Engine | m1nd MCP bridge (stdio child process) |
| Pipeline | KOMPLETUS + L1GHT pre-flight + Specular audit |
| Build Runtime | real OMX lifecycle runtime with Codex transport checks |
| Research | Perplexity, Serper, Semantic Scholar, CrossRef, GitHub, Jina |

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">
Built by [maxkle1nz](https://github.com/maxkle1nz)
</div>
