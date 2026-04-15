# m1nd Integration Guide

The `m1nd` system is a separate, highly specialized graph analysis engine. Because it operates via standard input/output (stdio) as an MCP (Model Context Protocol) server, our web application communicates with it through a local WebSocket proxy.

## How it Works
1. **The Proxy:** A local process translates WebSocket messages from our web app into stdio commands for the `m1nd` binary.
2. **The Client:** Our frontend (`src/lib/m1nd.ts`) connects to this proxy (default: `ws://localhost:8080`) and sends JSON-RPC 2.0 requests.
3. **The UI:** The Right Panel in "M1ND Mode" provides the interface to trigger these requests and view the results.

## Prerequisites for the User
To use the M1ND features in the web app, the user **must** run the WebSocket proxy locally on their machine.

**Command to run the proxy:**
\`\`\`bash
npx @modelcontextprotocol/websockets-stdio m1nd-mcp
\`\`\`
*(Note: This assumes the `m1nd-mcp` executable is in the user's system PATH and configured to run on port 8080).*

## Available m1nd Actions in the UI
Currently, the UI exposes the following actions when a node is selected in M1ND mode:

- **Blast Radius (`impact`):** Analyzes the graph to determine which other nodes will fail or be severely affected if the selected node goes offline.
- **Predict Co-change (`predict`):** Analyzes structural dependencies to predict which other nodes will likely need code modifications if the selected node's data contract or logic is altered.

## API Reference (`M1ndClient`)
The internal client supports additional methods that can be exposed in the future:
- `activate(agentId, query, maxNodes)`: Spreading activation query across the graph.
- `warmup(agentId, taskDescription)`: Task-based warmup and priming.
- `hypothesize(agentId, hypothesis)`: Graph-based hypothesis testing against structure.
