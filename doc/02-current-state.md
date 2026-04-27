# Current State of the System

As of the current verified working tree (lint, production build, generated-workspace verification, SPECULAR route contracts, Git/security guardrails, and SPECULAR showcase browser smoke passing), RETROBUILDER is a session-first blueprint system with a real OMX lifecycle runtime, a full KOMPLETUS pipeline, projected m1nd analysis, a Product DNA/knowledge-bank lane, and a compact Demystifier-style graph UI.

## 1. Frontend Interface (UI/UX)
- Session-first launcher with three entry paths: new blueprint, reopen saved session, import codebase.
- Three operational modes with shared header + mode theming:
  - `ARCHITECT`
  - `M1ND`
  - `BU1LDER`
- 2D graph canvas via `@xyflow/react` with dagre auto-layout and directional edge arrows.
- Compact Demystifier-style module cards with explicit priority/status chips and summary metrics.
- NodeInspector drawer with tabs for Core, Spec, Rationale, Grounding, UIX, and Connections.
- Spotlight search overlay (`⌘K`) for selecting and centering nodes.
- Right-side M1ND cockpit with tabs for Ready, Impact, Gaps, Grounding, UIX, and Advanced.
- KOMPLETUS report modal with tabs for Modules, Artifacts, Specular, and Summary, including SPECULAR CREATE output in the Specular surface.
- SPECULAR showcase route renders product-first browser surfaces plus a machine-readable `#rb-specular-truth` manifest so browser QA can compare DOM truth against backend design gates. Focused evidence can be regenerated locally through `npm run verify:specular`; raw screenshots/reports live under ignored local artifact directories.
- OMX terminal drawer (`BuildConsole` in drawer mode) plus full BU1LDER canvas view.
- Header save-state indicator (`SAVED` / `UNSAVED` / `ERROR`) backed by backend session persistence.

## 2. State & Persistence Truth
- Blueprint sessions live on the backend (`src/server/session-store.ts`), not only in browser memory.
- The frontend still persists selected UI/runtime preferences locally through Zustand persist (for example `appMode`, provider/model preference, launcher visibility), so both statements are true:
    - session content is backend-backed
    - some UI convenience state is stored in `localStorage`
- Sensitive local API tokens are not stored in persistent browser `localStorage`; browser calls use `VITE_RETROBUILDER_LOCAL_API_TOKEN` or an in-memory token setter.
- Undo/redo history is provided through `zundo` temporal state.
- Builder lifecycle state is held in `useBuildStore` and can be rehydrated from remote OMX status.

## 3. Backend API (Express)
- `server.ts` is a thin composition root.
- Active route modules:
  - `src/server/routes/sessions.ts`
  - `src/server/routes/config.ts`
  - `src/server/routes/m1nd.ts`
  - `src/server/routes/omx.ts`
    - `src/server/routes/specular.ts`
    - `src/server/routes/knowledge-bank.ts`
    - `src/server/routes/ai.ts`
- AI endpoints support graph generation, proposal flow, architecture analysis, deep research, and KOMPLETUS SSE streaming.
- Sensitive local routes are guarded by `requireLocalApiToken` when `RETROBUILDER_LOCAL_API_TOKEN` is configured, and non-loopback binds (`0.0.0.0` / `::`) require that token at startup:
    - `/api/ai`
    - `/api/config`
    - `/api/m1nd`
    - `/api/omx`
    - `/api/sessions/import/codebase`
- OMX endpoints expose explicit lifecycle surfaces:
  - `POST /api/omx/build`
  - `GET /api/omx/status/:sessionId`
  - `POST /api/omx/stop/:sessionId`
  - `GET /api/omx/stream/:sessionId`

## 4. AI Provider Layer
- Four providers are wired through the SSOT provider runtime:
  - xAI
  - Gemini
  - OpenAI
  - THE BRIDGE
- Runtime provider/model switching is exposed in the UI.
- Strict selected-provider mode is active by default, so the chosen provider is the runtime truth unless `AI_STRICT_PROVIDER_MODE=0` explicitly allows fallback.
- THE BRIDGE now supports:
  - bootstrap/discovery via `src/server/bridge-bootstrap.ts`
  - auth-profile discovery via `src/server/auth-profile-store.ts`
  - donor standalone bridge detection when an OpenAI-compatible bridge binary is not present
  - Current verified bridge truth:
    - THE BRIDGE auto-starts or reuses the local companion at Retrobuilder boot
    - provider health for `bridge` reports `ready` when the companion is reachable
    - model listing works through profile-aware bridge inventory
    - `/api/ai/providers` exposes runtime diagnostics including `autoStart`, `autoStarted`, protocol, source, and selected auth profile
      - Codex Bridge defaults to `gpt-5.5` and `/api/ai/models` returns `openai-codex/gpt-5.5` as the selectable default
      - local Codex completion through THE BRIDGE is live-proved by `npm run verify:providers:codex-live`
      - missing local OpenClaw auth profiles are reported as explicit live-lane skips, not hidden successes
      - server-triggered local Codex JSON fallback is disabled by default, requires `RETROBUILDER_ENABLE_LOCAL_CODEX_FALLBACK=1`, and no longer uses the dangerous sandbox-bypass flag
      - Bridge/auth-profile discovery no longer pins personal `/Users/...` fallback paths in server source
  - Strict profile-backed bridge proof requires local OpenClaw profiles:
    - `OPENCLAW_AUTH_PROFILES_PATH` points at an `auth-profiles.json` containing `openai-codex:default` and `github-copilot:github`
    - `npm run verify:providers:live` then requires real `codex-ok` and `copilot-ok` completions through THE BRIDGE
- Gemini key rotation support is present.
- `npm run lint` and `npm run build` pass on the current working tree.

## 5. m1nd Integration
- Active raw m1nd bridge: `src/server/m1nd-bridge.ts`.
- Active frontend client: `src/lib/m1nd.ts`.
- Active raw m1nd HTTP routes: `src/server/routes/m1nd.ts`.
- Active session-projected structural analysis flow:
  - `src/server/session-projection.ts`
  - `src/server/session-analysis.ts`
  - `src/server/routes/sessions.ts`
- M1ND mode is not just raw tool buttons anymore; it is a projected cockpit over the active session draft.
- The system currently supports raw document intelligence endpoints too (`document/resolve`, `document/bindings`, `document/drift`).

## 6. Deep Research & Grounding
- Deep research is exposed in three user-facing ways:
  - Node context menu
  - NodeInspector Grounding tab
  - RightPanel Grounding tab
- Backend workflow: `performDeepResearchWorkflow()` in `src/server/ai-workflows.ts`.
- Source stack includes Perplexity, Serper Web, Serper Scholar, Semantic Scholar, CrossRef, GitHub search, and Jina Reader.
- Research is structurally enriched with m1nd document bindings/drift when available.

## 7. KOMPLETUS Pipeline
- Active pipeline implementation: `src/server/kompletus-pipeline.ts`.
- Current stages:
  1. konstruktor
  2. hardener
  3. triage
  4. research
  5. specular
  6. l1ght
  7. quality
  8. complete
- Frontend transport is SSE-based via `runKompletus()` in `src/lib/api.ts`.
- `tests/kompletus-e2e.ts` mirrors the frontend SSE parser and validates the KOMPLETUS payload contract, including specular moments, coverage, node-screen map, and parity score.
- `specularCreate` is now generated inside KOMPLETUS for user-facing nodes and returned as part of the report payload.

## 8. OMX Runtime & BU1LDER
- Active OMX runtime: `src/server/omx-runtime.ts`.
- Active OMX router: `src/server/routes/omx.ts`.
- Active OMX 2 protocol docs:
  - `doc/l1ght/omx2-runtime.md`
  - `doc/l1ght/omx2-scheduler.md`
  - `doc/l1ght/omx2-ledger.md`
  - `doc/l1ght/omx2-checkpoints.md`
- Active frontend lifecycle surfaces:
  - `src/components/KompletusReport.tsx`
  - `src/components/RightPanel.tsx`
  - `src/components/BuildView.tsx`
  - `src/components/BuildConsole.tsx`
  - `src/hooks/useOMXStream.ts`
  - `src/store/useBuildStore.ts`
  - The current runtime is a real lifecycle surface, not the old simulation-first flow.
- Successful build completion now persists a generated `.omx/runnable-manifest.json` and returns it through the final handoff UI so the screen can offer stack-aware open/run/preview instructions rather than a generic checklist.
- The current active workstream is migrating the runtime toward OMX 2:
  - execution graph compilation
  - wave/task/worker projection
  - durable operational messages
  - verify-before-complete truth
  - same-wave parallel execution for disjoint module write sets
- Truths currently guaranteed by code/tests:
  - explicit build start before builder-mode handoff
  - persisted `queued/running/stopping/stopped/succeeded/failed` reentry truth
  - persisted terminal summary/message on success/stop
  - remote lifecycle fallback when terminal SSE is missed
  - guard against falsely treating a recently stopped build as a fresh restart
  - failure when Codex transport is unavailable instead of fake success
  - 21st design-gate block before OMX start
    - persisted blocked-build status for reload/reentry
    - redirect from blocked build back into the UIX correction surface
    - builder header/console surface design gate status
    - visible header version is injected from `package.json` through the Vite `__APP_VERSION__` constant

## 9. Demystifier / Graph Card State
- The compact Demystifier card law is largely implemented on `main`.
- Current layout truth in `src/lib/layout.ts`:
  - node width: `220`
  - node height: `180`
  - `nodesep: 64`
  - `ranksep: 104`
- Data flow arrows and compact on-card semantics are already live in the graph.

## 10. Verified Quality Signals
Fresh commands verified in the latest docs/readiness pass:
- `npm run lint`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm run verify:git`
- `npm run verify:security`
- `npm run verify:handoff`
- `npm run verify:generated-workspace`
- `RETROBUILDER_TEST_BASE=http://127.0.0.1:7799 RETROBUILDER_PORT=7799 npm run verify:readiness`
- `RETROBUILDER_TEST_BASE=http://127.0.0.1:7799 RETROBUILDER_PORT=7799 npm run verify:specular` (covered inside the readiness run)
- `RETROBUILDER_BROWSER_ARTIFACT_DIR=.retrobuilder/browser-artifacts RETROBUILDER_TEST_BASE=http://127.0.0.1:7802 RETROBUILDER_PORT=7802 npm run verify:specular`
- `npx tsx tests/specular-create-route.test.ts`

Additional suite commands tracked by the project and expected to remain part of local/full verification:
- `npm run verify:git`
- `npm run verify:security`
- `npm run smoke:m1nd` (now also covered inside `verify:specular` while the test server is alive)
- `npm run smoke:providers`
- `npm run smoke:ui:providers`
- `npm run verify:providers`
- `npx tsx tests/omx-client-contract.test.ts`
- `npx tsx tests/omx-real-contract.test.ts`
- `npx tsx tests/session-route-wiring.test.ts`
- `npm run smoke:ui:workbench`
- `npm run smoke:ui`
- `npm run smoke:ui:specular-showcase`
- `npm run smoke:ui:blocked`
- `npm run smoke:ui:happy`
- `npm run smoke:ui:resume`

Browser workbench smoke now verifies 6 deterministic scenarios, including a mechanic CRM full journey:
- shell render + BU1LDER activation
- design-gate block routed to UIX correction
- valid UIX handoff into BU1LDER
- deterministic session -> SPECULAR generate/save -> showcase truth manifest -> OMX handoff -> reload/reentry preservation
- builder resume hint
- builder resume-chat continuation

When `RETROBUILDER_BROWSER_ARTIFACT_DIR` is set, the Chromium CDP suite now writes PNG evidence for:
- `full-journey-specular-showcase.png`
- `full-journey-builder-handoff.png`
- `full-journey-builder-reentry.png`
- `specular-showcase-desktop.png`
- `specular-showcase-mobile.png`

The opt-in live external-provider browser harness has fresh focused evidence:
- command: `RETROBUILDER_RUN_LIVE_E2E=1 RETROBUILDER_BROWSER_ARTIFACT_DIR=.retrobuilder/browser-artifacts-live RETROBUILDER_TEST_BASE=http://127.0.0.1:7807 RETROBUILDER_PORT=7807 npm run verify:live-kompletus-browser`
- result: 12-node mechanic CRM/site graph, 12 modules grounded, SPECULAR CREATE passed at `100%` across 4 surfaces, quality passed, SPECULAR showcase screenshot captured, and BU1LDER handoff screenshot captured
- artifacts: `.retrobuilder/browser-artifacts-live/live-kompletus-specular-showcase.png` and `.retrobuilder/browser-artifacts-live/live-kompletus-builder-handoff.png`

CI automation is present in `.github/workflows/readiness.yml`:
- PR/push `core` job: typecheck, build, generated-workspace verification, readiness contract, and CI workflow contract
- manual `full-readiness` job: runs `npm run verify:readiness` on a runner with m1nd availability and uploads `.omx/logs`, browser screenshot artifacts, and `dist`

## 11. Honest Current Gaps
These are the most important remaining truth gaps:
1. Browser-level smoke tests include deterministic full-journey screenshots and a fresh opt-in live external-LLM KOMPLETUS run, but live external-LLM proof is still intentionally outside CI/local readiness by default.
2. The active runtime is `omx-runtime.ts`, but legacy SPECULAR loop expectations still exist in docs/tests/store surfaces via `omx-runner.ts`; this still deserves one explicit convergence pass.
3. The shell now lazy-loads better, but overall frontend payload is still substantial and could be optimized further.
