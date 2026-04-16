# System Overview

## Project Vision
RETROBUILDER is an advanced, cyberpunk-themed visual blueprint creator and system architecture analysis tool. It allows users to design, visualize, and analyze complex system architectures using an interactive node-based graph interface, assisted by AI and grounded by the m1nd neuro-symbolic code graph engine.

## Core Objectives
1. **Visual Architecture Design:** Provide an interactive 2D/3D graph interface to map out system components (nodes) and their relationships (links) with a premium cyberpunk aesthetic.
2. **AI-Assisted Generation:** Utilize advanced LLMs via a SSOT provider architecture (xAI Grok, OpenAI, THE BRIDGE) to automatically generate system architectures, technical proposals, and acceptance criteria from natural language prompts.
3. **Deep Graph Analysis (m1nd Integration):** Integrate with the m1nd neuro-symbolic graph engine to perform structural analysis — blast radius computation, co-change prediction, architectural layer detection, and structural hypothesis testing.
4. **Deep Research Engine:** Multi-source technical research (Perplexity, Semantic Scholar, GitHub, CrossRef, Jina) cross-referenced with graph nodes for structurally-grounded knowledge.
5. **OMX Materialization Bridge:** Export blueprints as structured plans with topological ordering, acceptance criteria, and error handling for autonomous materialization.
6. **Dual Operational Modes:**
   - **ARCHITECT Mode:** Build, edit, and define data contracts of the system blueprint.
   - **M1ND Mode:** Deep analysis, impact prediction, and structural querying via the m1nd engine.

## High-Level Architecture
- **Frontend:** React 19, Vite 6, Tailwind CSS 4, Zustand 5 (state management), `@xyflow/react` 12 (2D graph + dagre layout), `react-force-graph-3d` (3D visualization), Framer Motion (animations).
- **Backend:** Express.js server acting as an API gateway for AI requests, m1nd bridge, and static frontend serving in production.
- **AI Integration:** SSOT Provider Layer — supports xAI Grok (`api.x.ai/v1`), OpenAI, and THE BRIDGE (local proxy at `127.0.0.1:7788/v1`), all using the OpenAI SDK.
- **m1nd Engine:** Server-side MCP bridge — spawns `m1nd-mcp` as a child process, communicates via JSON-RPC 2.0 over stdin/stdout. Frontend accesses via HTTP at `/api/m1nd/*`.
- **Research Engine:** Multi-source web research with Perplexity, Serper, Semantic Scholar, CrossRef, GitHub, and Jina Reader.
