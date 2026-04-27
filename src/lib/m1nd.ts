/**
 * m1nd API Client — HTTP Bridge
 * 
 * Communicates with the m1nd MCP server through the Express backend
 * at /api/m1nd/* endpoints. No more direct WebSocket — the server
 * handles process management and reconnection.
 * 
 * All methods return null on failure for graceful degradation.
 */

import { localApiAuthHeaders } from './local-api-auth';

export interface M1ndHealthStatus {
  connected: boolean;
  nodeCount: number;
  edgeCount: number;
  graphState: string;
}

export class M1ndClient {
  private baseUrl: string;

  constructor(baseUrl: string = '/api/m1nd') {
    this.baseUrl = baseUrl;
  }

  // ─── Health ────────────────────────────────────────────────────────

  async health(): Promise<M1ndHealthStatus> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { headers: localApiAuthHeaders() });
      if (!res.ok) return { connected: false, nodeCount: 0, edgeCount: 0, graphState: 'error' };
      return res.json();
    } catch {
      return { connected: false, nodeCount: 0, edgeCount: 0, graphState: 'unreachable' };
    }
  }

  async isConnected(): Promise<boolean> {
    const h = await this.health();
    return h.connected;
  }

  // ─── Foundation ────────────────────────────────────────────────────

  /** Spreading activation query across the graph */
  async activate(query: string, topK: number = 20): Promise<any> {
    return this.post('/activate', { query, top_k: topK });
  }

  /** Impact radius / blast analysis for a node */
  async impact(nodeId: string, direction: string = 'forward'): Promise<any> {
    return this.post('/impact', { node_id: nodeId, direction });
  }

  /** Co-change prediction for a modified node */
  async predict(changedNode: string, topK: number = 10): Promise<any> {
    return this.post('/predict', { changed_node: changedNode, top_k: topK });
  }

  // ─── Superpowers ───────────────────────────────────────────────────

  /** Test structural claim against the graph */
  async hypothesize(claim: string): Promise<any> {
    return this.post('/hypothesize', { claim });
  }

  /** Validate a modification plan against the code graph */
  async validatePlan(actions: Array<{ action_type: string; file_path: string }>): Promise<any> {
    return this.post('/validate-plan', { actions });
  }

  // ─── Visualization ─────────────────────────────────────────────────

  /** Generate Mermaid diagram centered on a query/node */
  async diagram(center?: string, depth: number = 2, format: string = 'mermaid'): Promise<any> {
    return this.post('/diagram', { center, depth, format });
  }

  /** Panoramic risk overview */
  async panoramic(topN: number = 30): Promise<any> {
    return this.post('/panoramic', { top_n: topN });
  }

  /** Structural metrics */
  async metrics(scope?: string, topK: number = 30): Promise<any> {
    return this.post('/metrics', { scope, top_k: topK });
  }

  /** Architectural layers */
  async layers(): Promise<any> {
    return this.post('/layers', {});
  }

  // ─── Ingest ────────────────────────────────────────────────────────

  /** Ingest a codebase into m1nd */
  async ingest(codePath: string, adapter: string = 'code', mode: string = 'replace'): Promise<any> {
    return this.post('/ingest', { path: codePath, adapter, mode });
  }

  // ─── Document Intelligence ─────────────────────────────────────────

  /** Resolve document artifacts */
  async documentResolve(docPath?: string, nodeId?: string): Promise<any> {
    return this.post('/document/resolve', { path: docPath, node_id: nodeId });
  }

  /** Get document-to-code bindings */
  async documentBindings(docPath?: string, nodeId?: string): Promise<any> {
    return this.post('/document/bindings', { path: docPath, node_id: nodeId });
  }

  /** Check document-code drift */
  async documentDrift(docPath?: string, nodeId?: string): Promise<any> {
    return this.post('/document/drift', { path: docPath, node_id: nodeId });
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private async post(endpoint: string, body: Record<string, any>): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: localApiAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }
}

// Export a singleton instance
export const m1nd = new M1ndClient();
