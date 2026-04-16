# Roadmap & Pending Tasks

Progress at v0.4.0: **~75% of original roadmap complete**. All 5 foundational objectives are met. Items 3 and 4 are fully closed. Items 1, 2, and 5 have remaining work.

---

## 1. Global Search & Deep Querying (m1nd.activate)
**Objective:** Allow users to ask complex questions about the graph structure using the m1nd engine.

| Sub-item | Status | Notes |
|---|---|---|
| Chat integration in M1ND mode | ✅ Done | ChatFooter routes to m1nd.activate in M1ND mode (v0.3.0) |
| Dedicated Spotlight search bar | ❌ Pending | Global search bar for m1nd queries without entering chat |
| Visual feedback for generic results | 🟡 Partial | Blast radius has highlighting; activate/predict results don't highlight nodes on canvas |

**Remaining work:** Spotlight-style search bar + generic node highlighting for all m1nd results.

---

## 2. Graph Interaction Refinements
**Objective:** Improve the usability and readability of the graph canvas.

| Sub-item | Status | Notes |
|---|---|---|
| Blast radius node highlighting | ✅ Done | Red pulse + orange glow (v0.3.0) |
| Priority badges on nodes | ✅ Done | P1/P2/P3 build order indicators (v0.4.0) |
| AC indicators on nodes | ✅ Done | Acceptance criteria count on CyberNode (v0.4.0) |
| Data flow arrows on links | ❌ Pending | Edges lack directional indicators |
| Node clustering / grouping | ❌ Pending | Large graphs benefit from visual grouping |
| Physics stabilization | 🟡 Partial | dagre auto-layout works; no interactive physics tuning |

**Remaining work:** Directional arrows on edges + node clustering for large graphs.

---

## 3. AI Action Execution (KREATOR Mode) ✅ CLOSED
**Objective:** Apply AI-generated proposals to the graph.

| Sub-item | Status | Notes |
|---|---|---|
| applyProposal endpoint | ✅ Done | `/api/ai/applyProposal` (v0.1.0) |
| Accept/Reject UI | ✅ Done | ProposalModal with Accept/Reject buttons (v0.1.0) |
| Preserve existing node data | ✅ Done | applyProposal preserves AC for unchanged nodes (v0.4.0) |

**No remaining work.**

---

## 4. Error Handling & Edge Cases ✅ CLOSED
**Objective:** Make the application robust against failures.

| Sub-item | Status | Notes |
|---|---|---|
| Error boundaries | ✅ Done | App-level + GraphView-level (v0.1.0) |
| Toast notifications | ✅ Done | Sonner toasts on all operations |
| Zod schema validation | ✅ Done | `validation.ts` with graceful defaults |
| m1nd disconnection handling | ✅ Done | M1ndBridge auto-reconnect + health checks |
| Error handling per node | ✅ Done | Circuit-breaker strategies in OMX export (v0.4.0) |

**No remaining work.**

---

## 5. Deployment Preparation
**Objective:** Prepare the app for production hosting.

| Sub-item | Status | Notes |
|---|---|---|
| `.env.example` documented | ✅ Done | Exists in repo root |
| Vite build + Express static | ✅ Done | `npm run build` + `npm start` works |
| Dockerfile | ❌ Pending | No container config exists |
| CI/CD pipeline | ❌ Pending | No GitHub Actions or similar |
| Automated tests | ❌ Pending | Zero test files currently |

**Remaining work:** Dockerfile + CI/CD + test suite.

---

## 6. Beyond Original Roadmap (Delivered)

Features shipped that exceeded the original scope:

| Feature | Version | Impact |
|---|---|---|
| Multi-provider AI (xAI + OpenAI + Bridge) | v0.2.0 | 3 providers with runtime switching |
| Live model discovery API | v0.2.0 | Auto-list models per provider |
| Deep Research Engine (6 sources) | v0.3.0 | Perplexity, Scholar, GitHub, CrossRef, Jina |
| OMX Export Bridge | v0.4.0 | Autonomous materialization pipeline |
| Topological Sort (Kahn's) | v0.4.0 | Build priority from dependency edges |
| Acceptance Criteria (Zod-enforced) | v0.4.0 | 2–5 testable conditions per module |
