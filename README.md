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
- current verified head during this docs sync: `70eb814`
- working shape: session-backed blueprints + m1nd cockpit + KOMPLETUS + real OMX runtime

Current structural snapshot from the active m1nd graph on this repo:
- source files in `src/`: 66
- source LOC: 16,617
- functions tracked: 321
- active graph nodes: 569
- active graph edges: 766
- AI providers: 4
- KOMPLETUS stages: 8

What is already real:
- session launcher with backend persistence
- ARCHITECT / M1ND / BU1LDER modes
- Spotlight node search (`⌘K`)
- NodeInspector + grounding actions
- KOMPLETUS report with Specular tab
- OMX `build/status/stop/stream` lifecycle
- builder reentry with persisted terminal truth

## Getting Started

Prerequisites:
- Node.js 22+ recommended
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
- `http://localhost:3000`

### Provider Setup

RETROBUILDER uses a SSOT provider layer.
All providers share the same frontend contract and are switched at runtime via the UI.

| Provider | Config | Key Required |
|---|---|---|
| xAI Grok | `AI_PROVIDER="xai"` | `XAI_API_KEY` |
| Google Gemini | `AI_PROVIDER="gemini"` | `GEMINI_API_KEY` or `GEMINI_API_KEYS` |
| OpenAI | `AI_PROVIDER="openai"` | `OPENAI_API_KEY` |
| THE BRIDGE | `AI_PROVIDER="bridge"` | none, if local bridge is already running |

Example:

```bash
# .env.local — xAI
AI_PROVIDER="xai"
XAI_API_KEY="xai-..."

# .env.local — Gemini
AI_PROVIDER="gemini"
GEMINI_API_KEYS="key1,key2,key3"

# .env.local — Bridge
AI_PROVIDER="bridge"
THEBRIDGE_URL="http://127.0.0.1:7788/v1"
```

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
- the report renders:
  - user moments
  - coverage matrix
  - node-screen map
  - parity score
- `tests/kompletus-e2e.ts` uses the same SSE parser as the browser transport

That means the blueprint/report-level specular audit is real and test-backed.

## OMX Runtime

The active OMX runtime is lifecycle-first and route-backed.

Current routes:
- `POST /api/omx/build`
- `GET /api/omx/status/:sessionId`
- `POST /api/omx/stop/:sessionId`
- `GET /api/omx/stream/:sessionId`

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
npx tsx tests/kompletus-e2e.ts
npx tsx tests/omx-client-contract.test.ts
npx tsx tests/omx-real-contract.test.ts
npx tsx tests/session-route-wiring.test.ts
npm run build
```

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
| [Changelog](CHANGELOG.md) | release history + current docs-alignment note |

## Known Current Gaps

These gaps are important and intentional to state explicitly:

1. No full browser-level end-to-end proof yet for:
   session -> m1ndmap -> grounding -> KOMPLETUS -> OMX -> terminal/reentry.
2. The active OMX runtime is `omx-runtime.ts`, while some legacy SPECULAR loop expectations still live in docs/test/store surfaces around `omx-runner.ts`.
3. The header version badge in `src/App.tsx` is still hardcoded to `v2.5.0`, which does not match `package.json`.
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
