# Roadmap & Pending Tasks

Progress at v0.6.0: **~92% of original roadmap complete**. Items 3, 4, 6, and 8 are fully closed. Items 1, 2, and 5 have remaining work.

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
**No remaining work.**

---

## 4. Error Handling & Edge Cases ✅ CLOSED
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
| Automated tests | ✅ Done | `tests/kompletus-e2e.ts` — mirror test with SPECULAR assertions (v0.6.0) |

**Remaining work:** Dockerfile + CI/CD pipeline.

---

## 6. Critical Backlog & Fixes ✅ CLOSED (v0.6.0)
**Objective:** Address operational limitations discovered during full-pipeline autonomous tests.

| Sub-item | Severity | Status | Notes |
|---|---|---|---|
| Server-Side Cycle Detection | P1 | ✅ Done | `validateGraphIntegrity()` with DAG enforcement (v0.5.0) |
| OMX Bootstrapping (Phase 0) | P1 | 🟡 Partial | BU1LDER simulation handles it; real OMX needs scaffolding commands |
| Batch Research Queue | P2 | ✅ Done | KOMPLETUS `parallelResearch()` runs all nodes in parallel (v0.6.0) |
| Donor Logic Checking | P2 | ❌ Pending | Validating incompatible cross-stack logic |

**No remaining critical items.**

---

## 7. Beyond Original Roadmap (Delivered)

Features shipped that exceeded the original scope:

| Feature | Version | Impact |
|---|---|---|
| Multi-provider AI (xAI + OpenAI + Bridge) | v0.2.0 | 3 providers with runtime switching |
| Live model discovery API | v0.2.0 | Auto-list models per provider |
| Deep Research Engine (6 sources) | v0.3.0 | Perplexity, Scholar, GitHub, CrossRef, Jina |
| OMX Export Bridge | v0.4.0 | Autonomous materialization pipeline |
| Topological Sort (Kahn's) | v0.4.0 | Build priority from dependency edges |
| Acceptance Criteria (Zod-enforced) | v0.4.0 | 2–5 testable conditions per module |
| Design System Unification | v0.4.1 | Semantic color tokens, unified rounding, mode-adaptive glows |
| **BU1LDER Live Construction** | **v0.5.0** | **Real-time SSE build visualization with dark-to-light node states** |
| **Build Console** | **v0.5.0** | **Structured log feed + Mission Complete metrics screen** |
| **3-Mode System** | **v0.5.0** | **ARCHITECT → M1ND → BU1LDER with full UIX color theming** |
| **KOMPLETUS Pipeline** | **v0.6.0** | **8-stage autonomous blueprint engine with SSE streaming** |
| **SPECULAR AUDIT** | **v0.6.0** | **UIX parity mapping — user moments + coverage matrix** |
| **SPECULAR Protocol v7** | **v0.6.0** | **Full-stack SSOT law with autonomous evolution mode** |
| **Google Gemini Provider** | **v0.6.0** | **4th provider with key rotation (round-robin on 429/quota)** |
| **Mirror Test** | **v0.6.0** | **E2E test with SPECULAR assertions (same parser as UIX)** |
| **Architecture Analyzer Fix** | **v0.6.0** | **Strips research metadata — no more code/knowledge confusion** |

---

## 8. BU1LDER — Live Construction Environment ✅ CLOSED (v0.5.0)
**No remaining work — BU1LDER is feature-complete.**

---

## 9. KOMPLETUS — Full Pipeline Engine ✅ CLOSED (v0.6.0)
**Objective:** End-to-end blueprint generation with research, validation, and UIX parity audit.

| Sub-item | Status | Notes |
|---|---|---|
| KONSTRUKTOR (Stage 1) | ✅ Done | Skeleton generation from prompt |
| HARDENER (Stage 2) | ✅ Done | Critic + dreamer pass |
| SMART TRIAGE (Stage 3) | ✅ Done | Module classification by research depth |
| DEEP RESEARCH (Stage 4) | ✅ Done | Parallel grounded research (6 sources) |
| SPECULAR AUDIT (Stage 5) | ✅ Done | User moments + coverage matrix + parity score |
| L1GHT PRE-FLIGHT (Stage 6) | ✅ Done | Contract expansion + cross-node validation |
| QUALITY GATE (Stage 7) | ✅ Done | Final validation with 60 acceptance criteria |
| KOMPLETUS Report Modal | ✅ Done | 4 tabs: Modules, Artifacts, Specular, Summary |
| SSE Streaming | ✅ Done | Real-time progress events per stage |
| Mirror Test | ✅ Done | `tests/kompletus-e2e.ts` with SPECULAR assertions |

**No remaining work — KOMPLETUS is feature-complete.**

