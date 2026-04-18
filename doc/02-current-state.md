# Current State of the System

As of main @ `70eb814` (`feat: ship real omx builder lifecycle hardening`), RETROBUILDER is a session-first blueprint system with a real OMX lifecycle runtime, a full KOMPLETUS pipeline, projected m1nd analysis, and a compact Demystifier-style graph UI.

## 1. Frontend Interface (UI/UX)
- Session-first launcher with three entry paths: new blueprint, reopen saved session, import codebase.
- Three operational modes with shared header + mode theming:
  - `ARCHITECT`
  - `M1ND`
  - `BU1LDER`
- 2D graph canvas via `@xyflow/react` with dagre auto-layout and directional edge arrows.
- Compact Demystifier-style module cards with explicit priority/status chips and summary metrics.
- NodeInspector drawer with tabs for Core, Spec, Rationale, Grounding, and Connections.
- Spotlight search overlay (`⌘K`) for selecting and centering nodes.
- Right-side M1ND cockpit with tabs for Ready, Impact, Gaps, Grounding, and Advanced.
- KOMPLETUS report modal with tabs for Modules, Artifacts, Specular, and Summary.
- OMX terminal drawer (`BuildConsole` in drawer mode) plus full BU1LDER canvas view.
- Header save-state indicator (`SAVED` / `UNSAVED` / `ERROR`) backed by backend session persistence.

## 2. State & Persistence Truth
- Blueprint sessions live on the backend (`src/server/session-store.ts`), not only in browser memory.
- The frontend still persists selected UI/runtime preferences locally through Zustand persist (for example `appMode`, provider/model preference, launcher visibility), so both statements are true:
  - session content is backend-backed
  - some UI convenience state is stored in `localStorage`
- Undo/redo history is provided through `zundo` temporal state.
- Builder lifecycle state is held in `useBuildStore` and can be rehydrated from remote OMX status.

## 3. Backend API (Express)
- `server.ts` is a thin composition root.
- Active route modules:
  - `src/server/routes/sessions.ts`
  - `src/server/routes/config.ts`
  - `src/server/routes/m1nd.ts`
  - `src/server/routes/omx.ts`
  - `src/server/routes/ai.ts`
- AI endpoints support graph generation, proposal flow, architecture analysis, deep research, and KOMPLETUS SSE streaming.
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
- Gemini key rotation support is present.
- `npm run lint` and `npm run build` pass on the current main baseline.

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

## 8. OMX Runtime & BU1LDER
- Active OMX runtime: `src/server/omx-runtime.ts`.
- Active OMX router: `src/server/routes/omx.ts`.
- Active frontend lifecycle surfaces:
  - `src/components/KompletusReport.tsx`
  - `src/components/RightPanel.tsx`
  - `src/components/BuildView.tsx`
  - `src/components/BuildConsole.tsx`
  - `src/hooks/useOMXStream.ts`
  - `src/store/useBuildStore.ts`
- The current runtime is a real lifecycle surface, not the old simulation-first flow.
- Truths currently guaranteed by code/tests:
  - explicit build start before builder-mode handoff
  - persisted `queued/running/stopping/stopped/succeeded/failed` reentry truth
  - persisted terminal summary/message on success/stop
  - remote lifecycle fallback when terminal SSE is missed
  - guard against falsely treating a recently stopped build as a fresh restart
  - failure when Codex transport is unavailable instead of fake success

## 9. Demystifier / Graph Card State
- The compact Demystifier card law is largely implemented on `main`.
- Current layout truth in `src/lib/layout.ts`:
  - node width: `220`
  - node height: `180`
  - `nodesep: 64`
  - `ranksep: 104`
- Data flow arrows and compact on-card semantics are already live in the graph.

## 10. Verified Quality Signals
Commands verified on the current baseline:
- `npm run lint`
- `npx tsx tests/omx-client-contract.test.ts`
- `npx tsx tests/omx-real-contract.test.ts`
- `npx tsx tests/session-route-wiring.test.ts`
- `npm run build`

## 11. Honest Current Gaps
These are the most important remaining truth gaps:
1. There is still no browser-level end-to-end visual test that proves the full journey from session -> m1ndmap -> grounding -> KOMPLETUS -> OMX build -> terminal state.
2. The active runtime is `omx-runtime.ts`, but legacy SPECULAR loop expectations still exist in docs/tests/store surfaces via `omx-runner.ts`; this needs one explicit convergence pass.
3. The header version badge is still hardcoded to `v2.5.0` in `src/App.tsx`, while `package.json` is `0.6.1`.
4. Frontend chunking is still heavy (`vite` warns about large chunks on production build).
