/**
 * m1nd API Client
 * Connects to a local m1nd MCP server via a WebSocket proxy.
 * 
 * Since m1nd uses stdio transport, you need to run a WebSocket proxy locally:
 * npx @modelcontextprotocol/websockets-stdio m1nd-mcp
 */

type MCPRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: any;
};

type MCPResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: any;
  error?: any;
};

export class M1ndClient {
  private ws: WebSocket | null = null;
  private messageId = 1;
  private pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();
  private url: string;

  constructor(url: string = "ws://localhost:8080") {
    this.url = url;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        console.log("[m1nd] Connected to MCP proxy");
        resolve();
      };

      this.ws.onerror = (err) => {
        console.error("[m1nd] WebSocket error:", err);
        reject(err);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as MCPResponse;
          if (data.id && this.pendingRequests.has(data.id)) {
            const { resolve, reject } = this.pendingRequests.get(data.id)!;
            this.pendingRequests.delete(data.id);
            
            if (data.error) reject(data.error);
            else resolve(data.result);
          }
        } catch (e) {
          console.error("[m1nd] Failed to parse message:", e);
        }
      };
    });
  }

  /**
   * Disconnect from the MCP proxy and clean up pending requests
   */
  disconnect(): void {
    if (this.ws) {
      // Reject all pending requests
      for (const [id, { reject }] of this.pendingRequests) {
        reject(new Error('m1nd client disconnected'));
      }
      this.pendingRequests.clear();

      this.ws.close();
      this.ws = null;
      console.log("[m1nd] Disconnected from MCP proxy");
    }
  }

  private async callTool(name: string, args: any): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("m1nd client not connected");
    }

    const id = this.messageId++;
    const request: MCPRequest = {
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: {
        name,
        arguments: args
      }
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify(request));
      
      // Timeout after 30s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`m1nd tool call '${name}' timed out`));
        }
      }, 30000);
    });
  }

  // --- m1nd Core Endpoints ---

  /**
   * Spreading activation query across the graph
   */
  async activate(agentId: string, query: string, maxNodes: number = 50) {
    return this.callTool("activate", { agent_id: agentId, query, max_nodes: maxNodes });
  }

  /**
   * Task-based warmup and priming
   */
  async warmup(agentId: string, taskDescription: string) {
    return this.callTool("warmup", { agent_id: agentId, task: taskDescription });
  }

  /**
   * Impact radius / blast analysis for a node
   */
  async impact(agentId: string, nodeId: string) {
    return this.callTool("impact", { agent_id: agentId, node_id: nodeId });
  }

  /**
   * Co-change prediction for a modified node
   */
  async predict(agentId: string, nodeId: string) {
    return this.callTool("predict", { agent_id: agentId, node_id: nodeId });
  }

  /**
   * Graph-based hypothesis testing against structure
   */
  async hypothesize(agentId: string, hypothesis: string) {
    return this.callTool("hypothesize", { agent_id: agentId, hypothesis });
  }
}

// Export a singleton instance
export const m1nd = new M1ndClient();
