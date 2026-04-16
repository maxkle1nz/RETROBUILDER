# m1nd Integration Guide

The `m1nd` system is a neuro-symbolic code graph engine. It ingests codebases into a weighted graph and provides spreading-activation queries, impact analysis, prediction, and stateful perspective navigation.

## Architecture

```
┌──────────────────────┐
│  Frontend (React)    │
│  M1ndClient class    │──── HTTP ────┐
│  src/lib/m1nd.ts     │              │
└──────────────────────┘              ▼
                            ┌──────────────────────┐
                            │  Express Backend     │
                            │  /api/m1nd/* routes  │
                            │  server.ts           │
                            └──────────┬───────────┘
                                       │
                              JSON-RPC 2.0 (stdio)
                                       │
                            ┌──────────▼───────────┐
                            │  m1nd-mcp process    │
                            │  M1ndBridge class    │
                            │  m1nd-bridge.ts      │
                            └──────────────────────┘
```

### How It Works

1. **The Bridge:** The Express server spawns `m1nd-mcp` as a child process. Communication is via JSON-RPC 2.0 over stdin/stdout (MCP stdio transport). The `M1ndBridge` class (`src/server/m1nd-bridge.ts`) manages the process lifecycle, auto-reconnection, and request queueing.
2. **The Client:** The frontend (`src/lib/m1nd.ts`) talks to the server at `/api/m1nd/*` endpoints via standard HTTP fetch. No WebSocket required.
3. **The UI:** The Right Panel in "M1ND Mode" provides action buttons and displays results. RightPanel also handles blast radius highlighting on the graph canvas.

## Prerequisites

The m1nd MCP binary must be available in the system PATH:

```bash
# Verify m1nd is installed
which m1nd-mcp

# The server auto-spawns m1nd-mcp — no manual proxy needed
npm run dev
```

> **Note:** Unlike earlier versions, there is no WebSocket proxy to run manually. The Express backend manages the m1nd process directly via stdio.

## Available API Endpoints

| Endpoint | m1nd Tool | Description |
|---|---|---|
| `GET /api/m1nd/health` | `health` | Connection status, node/edge counts |
| `POST /api/m1nd/activate` | `activate` | Spreading activation query |
| `POST /api/m1nd/impact` | `impact` | Blast radius / impact analysis |
| `POST /api/m1nd/predict` | `predict` | Co-change prediction |
| `POST /api/m1nd/validate` | `validate_plan` | Validate a modification plan |
| `POST /api/m1nd/diagram` | `diagram` | Generate Mermaid/DOT diagrams |
| `POST /api/m1nd/layers` | `layers` | Auto-detect architectural layers |
| `POST /api/m1nd/metrics` | `metrics` | Structural codebase metrics |
| `POST /api/m1nd/panoramic` | `panoramic` | Panoramic risk overview |
| `POST /api/m1nd/search` | `search` | Unified code search |
| `POST /api/m1nd/hypothesize` | `hypothesize` | Structural hypothesis testing |
| `POST /api/m1nd/missing` | `missing` | Structural hole detection |
| `POST /api/m1nd/ingest` | `ingest` | Ingest/re-ingest a codebase |
| `POST /api/m1nd/structural-context` | `surgical_context_v2` | Full surgical context for editing |

## Structural Injection (Kreator Integration)

When generating proposals, the Kreator subsystem pre-fetches structural context from m1nd:

1. `activate(query)` — Find relevant nodes for the user's request
2. `impact(node)` — Blast radius of affected components
3. `predict(node)` — Co-change likelihood for each module
4. Results are injected into the LLM prompt as structural grounding

This ensures AI proposals are **structurally aware** — they don't suggest changes that would break hidden dependencies.

## Graceful Degradation

All m1nd methods return `null` on failure. If m1nd is unavailable:
- The Kreator generates proposals without structural grounding (still functional)
- The RightPanel shows "Disconnected" status
- Health checks run every 15 seconds and auto-reconnect when available

## UI Actions (RightPanel in M1ND Mode)

| Button | Action | Visual Feedback |
|---|---|---|
| 💥 Impact | `m1nd.impact(nodeId)` | Red pulse on origin, orange glow on impact zone |
| 🔮 Predict | `m1nd.predict(nodeId)` | Results displayed in panel |
| ✅ Validate | `m1nd.validate(plan)` | Risk score and gap analysis |
| 📊 Layers | `m1nd.layers()` | Architectural layer breakdown |
| 📈 Metrics | `m1nd.metrics()` | LOC, complexity, PageRank per file |
| 🗺️ Diagram | `m1nd.diagram(nodeId)` | Mermaid diagram output |

## Frontend Client API (`M1ndClient`)

```typescript
import { m1nd } from '../lib/m1nd';

// Health check
const status = await m1nd.health();     // { connected, nodeCount, edgeCount, graphState }
const ok = await m1nd.isConnected();    // boolean

// Foundation
await m1nd.activate(query, topK);       // Spreading activation
await m1nd.impact(nodeId, direction);   // Blast radius
await m1nd.predict(changedNode, topK);  // Co-change prediction

// Superpowers
await m1nd.hypothesize(claim);          // Structural hypothesis testing
await m1nd.validate(actions);           // Plan validation
await m1nd.missing(query);             // Structural hole detection

// Visualization
await m1nd.diagram(center, depth);      // Mermaid diagram
await m1nd.layers();                    // Architectural layers
await m1nd.metrics(scope);             // Codebase metrics
await m1nd.panoramic();                // Risk overview
```
