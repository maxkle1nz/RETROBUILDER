<div align="center">

**Design systems before you build them.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[Getting Started](#getting-started) · [Architecture](#architecture) · [Features](#features) · [BU1LDER Mode](#builder-mode) · [OMX Integration](#omx-integration) · [M1ND Mode](#m1nd-mode) · [Documentation](#documentation)

</div>

---

# M1ND // RETROBUILDER

> AI-powered system architecture engine that transforms natural language into blueprint-grade DAGs — ready for autonomous materialization.

RETROBUILDER is a visual blueprint creator that bridges the gap between **ideation** and **execution**. You describe a system in plain language; RETROBUILDER generates a fully connected Directed Acyclic Graph (DAG) with typed modules, data contracts, dependency edges, and acceptance criteria — ready for an autonomous coding agent to build.

## Why RETROBUILDER?

Most AI coding tools start from code. **RETROBUILDER starts from architecture.**

The problem with jumping straight to code is that LLMs produce working files but lose the structural intent — which module depends on which, where data flows, what must be tested first. By the time you realize the architecture is wrong, you've already generated thousands of lines.

RETROBUILDER keeps you at the **blueprint level** until the architecture is right, then exports a machine-consumable execution plan that autonomous agents (like [OMX](https://ohmycodex.com)) can follow phase-by-phase — while you watch the construction happen in real-time.

```
You describe → RETROBUILDER architects → You validate → BU1LDER visualizes → OMX builds
```

## Getting Started

**Prerequisites:** Node.js 18+

```bash
# Clone
git clone https://github.com/maxkle1nz/RETROBUILDER.git
cd RETROBUILDER

# Install
npm install

# Configure AI provider
cp .env.example .env.local
# Edit .env.local with your API key (see Provider Setup below)

# Run
npm run dev
```

The app launches at `http://localhost:3000`.

### Provider Setup

RETROBUILDER supports multiple AI providers through a SSOT (Single Source of Truth) abstraction layer. All providers implement the same `chatCompletion(messages, config)` contract.

| Provider | Config | Key Required |
|---|---|---|
| **xAI Grok** | `AI_PROVIDER="xai"` | `XAI_API_KEY` |
| **Google Gemini** | `AI_PROVIDER="gemini"` | `GEMINI_API_KEY` or `GEMINI_API_KEYS` |
| **OpenAI** | `AI_PROVIDER="openai"` | `OPENAI_API_KEY` |
| **THE BRIDGE** | `AI_PROVIDER="bridge"` | None (local proxy) |

```bash
# .env.local — xAI example
AI_PROVIDER="xai"
XAI_API_KEY="xai-..."

# .env.local — Bridge example (zero-config local)
AI_PROVIDER="bridge"
BRIDGE_URL="http://127.0.0.1:7788/v1"
```

You can switch providers at runtime via the Model Selector panel in the UI — no restart needed.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                            │
│  React 19 · React Flow · Zustand · Framer Motion           │
│                                                             │
│  ┌───────────┐  ┌──────────┐  ┌─────────┐  ┌────────────┐ │
│  │ GraphView │  │ChatFooter│  │RightPanel│  │  Sidebar   │ │
│  │ (DAG)     │  │(Kreator) │  │(Analysis)│  │(Inspector) │ │
│  └─────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬──────┘ │
│        └──────────────┴─────────────┴──────────────┘        │
│                         │  HTTP                             │
├─────────────────────────┼───────────────────────────────────┤
│                    API Gateway                              │
│  Express.js · 14 /api/m1nd/* · /api/ai/* · /api/omx/* · /api/export/*  │
│                                                             │
│  ┌──────────────┐  ┌────────────┐  ┌──────────────────┐    │
│  │SSOT Provider  │  │ M1ND Bridge│  │  Web Research    │    │
│  │Layer (xAI,   │  │ (MCP stdio)│  │  (Perplexity,    │    │
│  │OpenAI,Bridge)│  │            │  │  Semantic Scholar,│    │
│  └──────────────┘  └────────────┘  │  GitHub, CrossRef)│    │
│                                     └──────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Structural Profile (via [m1nd](https://github.com/maxkle1nz/m1nd))

| Metric | Value |
|---|---|
| Total files | 50+ |
| Total LOC | 7,200+ |
| Functions | 80+ |
| Classes | 2 |
| Graph nodes | 791 |
| Graph edges | 1,136 |
| AI Providers | 4 (xAI, Gemini, OpenAI, Bridge) |
| Pipeline Stages | 8 (KOMPLETUS) |

## Features

### 🏗️ Blueprint Generation
Describe your system in natural language. The Kreator generates a typed DAG with:
- **Typed modules** — `frontend`, `backend`, `database`, `security`, `external`
- **Data contracts** — what each module receives and returns
- **Decision rationale** — why each architectural choice was made
- **Dependency edges** — explicit data flow between modules

### 🔬 M1ND Structural Analysis
Switch to M1ND mode for deep graph analysis powered by the [m1nd](https://github.com/maxkle1nz/m1nd) neuro-symbolic engine:
- **Blast Radius** — which modules break if this one fails
- **Co-change Prediction** — which modules likely need updating together
- **Risk Scoring** — validate modification plans before executing
- **Architectural Layers** — auto-detect layer violations
- **Structural Metrics** — LOC, complexity, PageRank per module
- **Graph Diagrams** — Mermaid/DOT visualization

### 📡 Deep Research Engine
Before generating blueprints, RETROBUILDER can ground its architectural decisions in real-world data:
- **Perplexity** — web search for best practices
- **Semantic Scholar** — academic paper search for algorithms
- **GitHub** — donor repository discovery for reference implementations
- **CrossRef** — technical standard discovery
- **Jina Reader** — deep page content extraction

### 📦 OMX Export (Blueprint → Autonomous Build)
Export your curated blueprint for autonomous materialization by [OMX](https://ohmycodex.com):
- **Topological sort** — Kahn's algorithm computes build order from dependencies
- **Acceptance criteria** — 2-5 testable conditions per module for `$ralph` verification
- **Phased execution** — Foundation → Core → Integration → Interface
- **Error handling** — failure modes and circuit-breaker strategies per module

### 🎨 Cyberpunk Design System
- Dark void aesthetic with glassmorphism panels
- Animated 2D DAG with React Flow
- Priority badges (P1, P2...) and acceptance criteria indicators on nodes
- Blast radius highlighting (red origin, orange impact zone)
- Mode-specific UI (Architect cyan → M1ND purple → BU1LDER green)

### 🔨 BU1LDER — Live Construction Visualization (v0.5.0)
Watch your blueprint come to life in real-time:
- **Dark-to-light nodes** — start completely dark, illuminate as OMX builds each module
- **Shimmer animation** — active build nodes pulse with a scanning light effect
- **Propagation rings** — completion sends a ring burst along edges to dependent nodes
- **Build Console** — structured log feed with phase tracking and file-level progress
- **MiniMap illumination** — the minimap lights up as the build wave propagates
- **Mission Complete** — final summary with files written, lines generated, and elapsed time
- **SSE streaming** — real-time Server-Sent Events with exponential backoff reconnect

### ⚡ KOMPLETUS — Full Pipeline Engine (v0.6.0)
End-to-end blueprint generation with 8 autonomous stages:
- **KONSTRUKTOR** — skeleton generation from natural language prompt
- **HARDENER** — critic + dreamer pass (wiring, hardening, missing modules)
- **SMART TRIAGE** — classifies modules by research depth needed
- **DEEP RESEARCH** — parallel grounded research (Perplexity, Scholar, GitHub, CrossRef)
- **SPECULAR AUDIT** — UIX parity mapping (user moments + coverage matrix)
- **L1GHT PRE-FLIGHT** — contract expansion + cross-node validation
- **QUALITY GATE** — final structural validation with 60 acceptance criteria
- **KOMPLETUS** — delivery with full report modal

### 🪞 SPECULAR — Full-Stack SSOT Protocol (v0.6.0)
The SPECULAR protocol guarantees that every backend node has a validated UIX representation:
- **Parsimônia** — max 4-5 user moments per pipeline, domain language only
- **SSOT Architecture** — backend = truth, UIX + mirror test = pure consumers
- **Mirror Test** — `tests/kompletus-e2e.ts` validates UIX parity end-to-end
- **Autonomous Evolution (SPECULAR MODE)** — agent self-evolves, mirror test guards UIX

### 🔑 Key Rotation (v0.6.0)
Gemini provider supports comma-separated API keys for round-robin rotation:
- Auto-rotate on 429/quota errors
- `GEMINI_API_KEYS="key1,key2,key3"` in `.env.local`
- Fully transparent to the rest of the system

## OMX Integration

RETROBUILDER is the **architect**. [OMX](https://ohmycodex.com) is the **builder**. The handoff is intentional — the user decides when the blueprint is ready.

```
RETROBUILDER (design + validate)
    │
    ▼  User clicks "Export to OMX"
    │
    ▼  Downloads omx-plan.md + enters BU1LDER Mode
    │
    ▼  BU1LDER shows real-time construction
    │  ● Nodes illuminate dark → light
    │  ● Build Console streams logs
    │  ● MiniMap shows propagation wave
    │
OMX (autonomous materialization)
    │  $ralph "execute the plan"
    │  → Phase 1: Foundation (databases, config)
    │  → Phase 2: Core Services (auth, APIs)
    │  → Phase 3: Integration (event buses, queues)
    │  → Phase 4: Interface (UI, CLI)
    │  → Each module verified against acceptance criteria
    │
    ▼  Working system
```

Every node in the blueprint includes:
- `acceptance_criteria` — testable conditions Ralph can verify
- `priority` — build order from topological sort
- `error_handling` — failure modes for resilient code generation

## M1ND Mode

RETROBUILDER integrates with the [m1nd](https://github.com/maxkle1nz/m1nd) neuro-symbolic code graph engine via a server-side MCP (Model Context Protocol) bridge.

### Setup

The m1nd bridge connects automatically when the MCP server is available:

```bash
# In a separate terminal
npx @anthropic-ai/mcp-server m1nd
```

The connection indicator in the top-right of the analysis panel shows green when connected.

### Available Actions

| Action | What it does | Use case |
|---|---|---|
| **Blast Radius** | Forward/reverse impact propagation | "If auth breaks, what else fails?" |
| **Co-change** | Temporal co-mutation prediction | "If I change the DB schema, what else needs updating?" |
| **Risk Score** | Validates a modification plan | "Is this change safe?" |
| **Diagram** | Mermaid graph centered on a node | Visual dependency exploration |
| **Layers** | Auto-detected architectural layers | Identify layer violations |
| **Metrics** | LOC, complexity, PageRank | Find the riskiest modules |

## Documentation

| Document | Description |
|---|---|
| [Overview](doc/01-overview.md) | Project vision and objectives |
| [Current State](doc/02-current-state.md) | Implementation status |
| [M1ND Integration](doc/03-m1nd-integration.md) | Graph engine architecture |
| [Roadmap](doc/04-roadmap.md) | Pending features and ideas |
| [L1GHT: Kreator](doc/l1ght/kreator.md) | Kreator agent protocol |
| [L1GHT: Research](doc/l1ght/research-engine.md) | Research engine protocol |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, React Flow, Zustand, Framer Motion |
| Backend | Express.js, TypeScript, Zod validation |
| AI Providers | xAI Grok, Google Gemini (key rotation), OpenAI, THE BRIDGE |
| Graph Engine | m1nd (MCP stdio) |
| Pipeline | KOMPLETUS (8-stage autonomous) |
| Research | Perplexity, Semantic Scholar, GitHub, CrossRef |
| Build | Vite 6 |
| Styling | Tailwind CSS 4 |

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">

Built by [maxkle1nz](https://github.com/maxkle1nz)


</div>
