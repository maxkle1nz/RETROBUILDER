# Roadmap & Pending Work

Current baseline: main @ `70eb814` with clean working tree, passing lint/build/contracts, active OMX runtime in `src/server/omx-runtime.ts`, and full KOMPLETUS report flow already wired into BU1LDER handoff.

This roadmap only lists the work that is still genuinely open from the current codebase.

---

## 1. Full Visual Specular Truth Test
Objective: prove, in a real browser, that backend truth is translated correctly from session creation through KOMPLETUS and OMX completion.

Status: pending

Needed:
- browser-level E2E for:
  - create/load/import session
  - generate m1ndmap
  - ground selected modules
  - run KOMPLETUS
  - inspect Specular tab
  - accept handoff into OMX build
  - observe terminal build state
  - reload/reenter builder and preserve terminal truth
- screenshot/evidence checkpoints for each stage
- backend-vs-UI truth matrix for all critical events

Why this matters:
- current tests validate transport/contracts well
- but we still lack a visual end-to-end proof that the user sees the same truth the backend emits

---

## 2. Active OMX Runtime / SPECULAR Convergence
Objective: remove ambiguity between the active routed runtime and legacy SPECULAR loop expectations.

Status: pending

Current truth:
- active routed runtime = `src/server/omx-runtime.ts`
- active router = `src/server/routes/omx.ts`
- legacy/alternate reference logic still exists in `src/server/omx-runner.ts`
- frontend store/tests still know about `specular_iteration` and `build_complete.specular`

Needed:
- decide whether SPECULAR live iteration belongs in the active runtime
- either:
  - implement that stream truth in `omx-runtime.ts`, or
  - retire/segregate the legacy expectations and document the builder as lifecycle-first, not live-specular-first
- update docs/tests/store surfaces so one truth exists

---

## 3. Version / Release Truth
Objective: align visible product versioning and release-facing docs with actual package/runtime truth.

Status: pending

Current drift:
- `package.json` = `0.6.1`
- header badge in `src/App.tsx` still renders `v2.5.0`

Needed:
- unify version source
- make header badge truthful
- keep changelog/release notes aligned with active runtime path and shipped behavior

---

## 4. Performance & Bundle Shaping
Objective: reduce frontend chunk size and keep the UI responsive as the system grows.

Status: pending

Current signal:
- production build warns about large chunks

Needed:
- code-split heavy surfaces where practical
- review static + dynamic imports around `src/lib/api.ts` and large modal/runtime surfaces
- preserve current UX while reducing bundle concentration

---

## 5. Delivery Automation / CI
Objective: make the current contract suite and future visual truth suite run automatically.

Status: pending

Needed:
- CI entrypoint for:
  - `npm run lint`
  - `npm run build`
  - `npx tsx tests/kompletus-e2e.ts`
  - `npx tsx tests/omx-client-contract.test.ts`
  - `npx tsx tests/omx-real-contract.test.ts`
  - `npx tsx tests/session-route-wiring.test.ts`
- future browser E2E job for visual specular truth
- optional artifact retention for screenshots/logs when failures occur

---

## 6. Graph UX Scale-Up
Objective: keep the graph readable as blueprints grow.

Status: partial

Already done:
- directional arrows
- Demystifier compaction
- spotlight search
- node inspector + connection suggester

Still worth improving:
- larger-graph grouping/clustering
- more explicit canvas-level visual summaries for activate/predict results beyond panel output
- further density tuning once bigger real-world blueprints are exercised under dogfood

---

## Completed Baseline (do not treat as pending)

These are already materially present in the codebase:
- session-first launcher and backend-backed sessions
- m1nd cockpit with readiness / impact / gaps / grounding / advanced tabs
- deep research from multiple sources with m1nd document enrichment
- KOMPLETUS 8-stage pipeline with SSE and Specular report modal
- real OMX build lifecycle routes (`build/status/stop/stream`)
- builder reentry hydration and terminal recovery
- stopped-build reuse guard
- spotlight search and NodeInspector workflow
- compact Demystifier card system on main
