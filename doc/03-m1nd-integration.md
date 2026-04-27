# m1nd Integration Guide

RETROBUILDER uses m1nd in two layers:
1. a direct HTTP bridge for graph operations
2. a session-projected analysis layer that aligns the active blueprint draft with m1nd before computing readiness, impact, gaps, and advanced analysis

## 1. Direct m1nd Architecture

```text
Frontend (src/lib/m1nd.ts)
    -> /api/m1nd/*
Express router (src/server/routes/m1nd.ts)
    -> M1ndBridge (src/server/m1nd-bridge.ts)
    -> m1nd-mcp stdio child process
```

### How it works
- The backend auto-spawns `m1nd-mcp` when available in PATH.
- The frontend never talks to m1nd directly; it uses normal HTTP fetches.
- All direct m1nd client methods degrade gracefully to `null` or offline status.
- The canonical local runtime surface is the RETROBUILDER server itself on port `7777`.
  The correct live health probe is:
  - `http://127.0.0.1:7777/api/m1nd/health`

## 2. Session-Projected Architecture

This is the primary integration for current RETROBUILDER behavior.

```text
Active session/draft
    -> session projection
    -> projected analysis in m1nd
    -> session routes
    -> M1ND cockpit / ARCHITECT handoff / KOMPLETUS grounding
```

Active files:
- `src/server/session-projection.ts`
- `src/server/session-analysis.ts`
- `src/server/routes/sessions.ts`
- `src/components/RightPanel.tsx`
- `src/components/ChatFooter.tsx`

### What the projection layer does
- normalizes the active session or draft into a compact m1nd-friendly workspace projection
- keeps research blobs stripped when structural topology is the target
- allows the M1ND cockpit to talk about the blueprint the user is editing now, not an unrelated reference graph

## 3. Direct HTTP Endpoints

Current direct endpoints in `src/server/routes/m1nd.ts`:

| Endpoint | Purpose |
|---|---|
| `GET /api/m1nd/health` | health / node-edge counts |
| `POST /api/m1nd/activate` | spreading activation |
| `POST /api/m1nd/impact` | blast radius |
| `POST /api/m1nd/predict` | co-change prediction |
| `POST /api/m1nd/hypothesize` | structural claim testing |
| `POST /api/m1nd/validate-plan` | plan validation |
| `POST /api/m1nd/panoramic` | panoramic risk view |
| `POST /api/m1nd/diagram` | Mermaid diagram generation |
| `POST /api/m1nd/layers` | architectural layers |
| `POST /api/m1nd/metrics` | structural metrics |
| `POST /api/m1nd/search` | unified search |
| `POST /api/m1nd/missing` | structural-hole hints |
| `POST /api/m1nd/ingest` | codebase ingest |
| `POST /api/m1nd/structural-context` | surgical context |
| `POST /api/m1nd/document/resolve` | document artifact resolution |
| `POST /api/m1nd/document/bindings` | document-to-code bindings |
| `POST /api/m1nd/document/drift` | document/code drift |

## 4. Session Route Surfaces

Current session-backed analysis surfaces:
- `POST /api/sessions/:id/activate`
- `POST /api/sessions/:id/readiness`
- `POST /api/sessions/:id/impact`
- `POST /api/sessions/:id/gaps`
- `POST /api/sessions/:id/advanced`

These routes are what power the M1ND cockpit in the UI.

## 5. Current UI Surfaces

### ChatFooter in M1ND mode
- switches the footer prompt into m1nd query mode
- sends the active session draft to `activateSessionDraft(...)`
- uses projected activation, not only direct graph access

### RightPanel / M1ND cockpit
Current tabs:
- Ready
- Impact
- Gaps
- Grounding
- Advanced

What they mean:
- Ready -> export/readiness status for the current blueprint
- Impact -> projected upstream/downstream/changed-together analysis
- Gaps -> missing AC / contracts / error handling / semantic hints
- Grounding -> research report for a selected node
- Advanced -> direct health, layers, metrics, diagram, impact, and predict output

## 6. Structural Injection in KREATOR

`generateProposalWorkflow()` in `src/server/ai-workflows.ts` gathers structural context from m1nd before synthesizing a proposal.

Current injected context may include:
- activated nodes
- blast radius
- co-change predictions
- risk assessment
- layer violations

This means proposal generation is structurally aware when m1nd is online, but still degrades gracefully when it is offline.

## 7. Deep Research Enrichment

`performDeepResearchWorkflow()` also uses m1nd when available.

Current enrichment path:
- `documentBindings(...)`
- `documentDrift(...)`

That creates a bridge between:
- web/document research
- blueprint node intent
- probable code/document bindings

## 8. Operational Summary

Current operating model:
- m1nd is backend-managed and auto-spawned when available.
- The primary operator surface is session-projected analysis rather than the direct endpoint set.
- Direct endpoints still exist for graph work and diagnostics.
- The M1ND cockpit surfaces concrete blocker states, for example `EMPTY_BLUEPRINT` on a blank session.
- The verified local smoke command is:
  - `npm run smoke:m1nd`

## 9. Current Follow-up Areas

- SPECULAR/OMX/reload behavior has deterministic browser coverage, and the live KOMPLETUS browser harness exists as an opt-in credentialed path. The remaining gap is broader visual parity across graph cards, reports, the inspector, knowledge-bank surfaces, and the final handoff UI.
- Some legacy documentation and builder-store surfaces still mention SPECULAR loop behavior that belongs to `omx-runner.ts`, while the active routed OMX runtime is `omx-runtime.ts`.
