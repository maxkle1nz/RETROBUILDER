/**
 * M1ND Bridge — Server-Side MCP Client
 * 
 * Spawns m1nd-mcp as a child process and communicates via JSON-RPC 2.0 
 * over stdin/stdout (MCP stdio transport). Provides a clean async API
 * for all m1nd tools needed by the Kreator subsystem.
 * 
 * Gracefully degrades when m1nd is unavailable — returns null results
 * instead of throwing, so the Kreator can still function without
 * structural awareness.
 * 
 * Tool selection follows the m1nd.world Tool Matrix SSOT:
 * - Foundation: activate, impact, predict, warmup, health, ingest
 * - Superpowers: hypothesize, validate_plan, missing, trace
 * - Surgical: surgical_context_v2, apply_batch, view
 * - Search: search, diagram, panoramic, metrics
 * - Document Intelligence: document_resolve, document_bindings, document_drift
 */

import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// ─── Types ───────────────────────────────────────────────────────────

interface MCPRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: Record<string, any>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface M1ndHealthStatus {
  connected: boolean;
  nodeCount: number;
  edgeCount: number;
  graphState: string;
  uptime?: number;
}

export interface M1ndStructuralContext {
  activatedNodes: any[];
  blastRadius: any | null;
  coChangePredictions: any | null;
  riskScore: any | null;
  layerViolations: any[];
}

// ─── M1ND Bridge Class ──────────────────────────────────────────────

export class M1ndBridge extends EventEmitter {
  private process: ChildProcess | null = null;
  private messageId = 1;
  private pending = new Map<number, PendingRequest>();
  private buffer = '';
  private connected = false;
  private reconnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private agentId: string;
  private m1ndCommand: string;

  constructor(agentId: string = 'retrobuilder', m1ndCommand: string = 'm1nd-mcp') {
    super();
    this.agentId = agentId;
    this.m1ndCommand = m1ndCommand;
  }

  // ─── Lifecycle ───────────────────────────────────────────────────

  /**
   * Spawn the m1nd-mcp process and establish stdio communication.
   * Returns true if connection succeeded, false if m1nd is unavailable.
   */
  async connect(): Promise<boolean> {
    if (this.connected) return true;

    try {
      this.process = spawn(this.m1ndCommand, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      if (!this.process.stdout || !this.process.stdin) {
        throw new Error('Failed to establish stdio with m1nd-mcp');
      }

      // Parse stdout for JSON-RPC responses
      this.process.stdout.on('data', (chunk: Buffer) => {
        this.buffer += chunk.toString();
        this.processBuffer();
      });

      this.process.stderr?.on('data', (chunk: Buffer) => {
        const msg = chunk.toString().trim();
        if (msg) console.error(`[m1nd-bridge] stderr: ${msg}`);
      });

      this.process.on('exit', (code) => {
        console.log(`[m1nd-bridge] Process exited with code ${code}`);
        this.connected = false;
        this.rejectAllPending('m1nd process exited');
        this.attemptReconnect();
      });

      this.process.on('error', (err) => {
        console.error(`[m1nd-bridge] Process error: ${err.message}`);
        this.connected = false;
      });

      // Wait briefly for process to stabilize
      await this.sleep(300);

      // Send MCP initialize handshake
      const initResult = await this.sendRaw({
        jsonrpc: '2.0',
        id: this.messageId++,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'retrobuilder', version: '2.5.0' },
        },
      });

      if (initResult) {
        this.connected = true;
        this.reconnectAttempts = 0;
        console.log('[m1nd-bridge] ● Connected to m1nd MCP');
        this.emit('connected');
        return true;
      }

      return false;
    } catch (err: any) {
      console.warn(`[m1nd-bridge] ○ m1nd unavailable: ${err.message}`);
      this.connected = false;
      return false;
    }
  }

  /**
   * Gracefully shutdown the m1nd process.
   */
  disconnect(): void {
    this.rejectAllPending('m1nd bridge disconnecting');
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
    this.connected = false;
    this.buffer = '';
    console.log('[m1nd-bridge] Disconnected');
  }

  get isConnected(): boolean {
    return this.connected;
  }

  // ─── Foundation Tools ────────────────────────────────────────────

  /** Spreading activation query across the connectome */
  async activate(query: string, topK: number = 20): Promise<any> {
    return this.callTool('m1nd_activate', { agent_id: this.agentId, query, top_k: topK });
  }

  /** Impact radius / blast analysis for a node */
  async impact(nodeId: string, direction: 'forward' | 'reverse' | 'both' = 'forward'): Promise<any> {
    return this.callTool('m1nd_impact', { agent_id: this.agentId, node_id: nodeId, direction });
  }

  /** Co-change prediction for a modified node */
  async predict(changedNode: string, topK: number = 10): Promise<any> {
    return this.callTool('m1nd_predict', { agent_id: this.agentId, changed_node: changedNode, top_k: topK });
  }

  /** Task-based warmup and priming */
  async warmup(taskDescription: string): Promise<any> {
    return this.callTool('m1nd_warmup', { agent_id: this.agentId, task_description: taskDescription });
  }

  /** Server health and statistics */
  async health(): Promise<M1ndHealthStatus | null> {
    const result = await this.callTool('m1nd_health', { agent_id: this.agentId });
    if (!result) return null;
    return {
      connected: true,
      nodeCount: result.node_count || 0,
      edgeCount: result.edge_count || 0,
      graphState: result.graph_state || 'unknown',
      uptime: result.uptime_ms,
    };
  }

  /** Ingest or re-ingest a codebase */
  async ingest(codePath: string, adapter: string = 'code', mode: string = 'replace'): Promise<any> {
    return this.callTool('m1nd_ingest', { agent_id: this.agentId, path: codePath, adapter, mode });
  }

  /** Weight and structural drift analysis */
  async drift(): Promise<any> {
    return this.callTool('m1nd_drift', { agent_id: this.agentId });
  }

  // ─── Superpowers ─────────────────────────────────────────────────

  /** Test a structural claim about the codebase */
  async hypothesize(claim: string): Promise<any> {
    return this.callTool('m1nd_hypothesize', { agent_id: this.agentId, claim });
  }

  /** Validate a modification plan against the code graph */
  async validatePlan(actions: Array<{ action_type: string; file_path: string; description?: string }>): Promise<any> {
    return this.callTool('m1nd_validate_plan', { agent_id: this.agentId, actions });
  }

  /** Detect structural holes and missing connections */
  async missing(query: string): Promise<any> {
    return this.callTool('m1nd_missing', { agent_id: this.agentId, query });
  }

  /** Map runtime errors to structural root causes */
  async trace(errorText: string): Promise<any> {
    return this.callTool('m1nd_trace', { agent_id: this.agentId, error_text: errorText });
  }

  // ─── Search & Efficiency ─────────────────────────────────────────

  /** Unified code search */
  async search(query: string, mode: 'literal' | 'regex' | 'semantic' = 'semantic', topK: number = 20): Promise<any> {
    return this.callTool('m1nd_search', { agent_id: this.agentId, query, mode, top_k: topK });
  }

  /** Intent-aware semantic code search */
  async seek(query: string, topK: number = 20): Promise<any> {
    return this.callTool('m1nd_seek', { agent_id: this.agentId, query, top_k: topK });
  }

  /** Generate visual graph diagram */
  async diagram(center?: string, depth: number = 2, format: string = 'mermaid'): Promise<any> {
    return this.callTool('m1nd_diagram', { agent_id: this.agentId, center, depth, format });
  }

  /** Panoramic graph health overview */
  async panoramic(topN: number = 30): Promise<any> {
    return this.callTool('m1nd_panoramic', { agent_id: this.agentId, top_n: topN });
  }

  /** Structural codebase metrics */
  async metrics(scope?: string, topK: number = 30): Promise<any> {
    return this.callTool('m1nd_metrics', { agent_id: this.agentId, scope, top_k: topK });
  }

  /** Auto-detect architectural layers */
  async layers(): Promise<any> {
    return this.callTool('m1nd_layers', { agent_id: this.agentId });
  }

  // ─── Surgical ────────────────────────────────────────────────────

  /** Full surgical context for a file + neighbourhood */
  async surgicalContext(filePath: string, symbol?: string): Promise<any> {
    return this.callTool('m1nd_surgical_context_v2', { agent_id: this.agentId, file_path: filePath, symbol });
  }

  /** Fast file reader with line numbers */
  async view(filePath: string, limit?: number): Promise<any> {
    return this.callTool('m1nd_view', { agent_id: this.agentId, file_path: filePath, limit });
  }

  // ─── Document Intelligence ───────────────────────────────────────

  /** Resolve a canonical document artifact */
  async documentResolve(docPath?: string, nodeId?: string): Promise<any> {
    return this.callTool('m1nd_document_resolve', { agent_id: this.agentId, path: docPath, node_id: nodeId });
  }

  /** Resolve document-to-code bindings */
  async documentBindings(docPath?: string, nodeId?: string, topK: number = 10): Promise<any> {
    return this.callTool('m1nd_document_bindings', { agent_id: this.agentId, path: docPath, node_id: nodeId, top_k: topK });
  }

  /** Analyze stale/missing document-code bindings */
  async documentDrift(docPath?: string, nodeId?: string): Promise<any> {
    return this.callTool('m1nd_document_drift', { agent_id: this.agentId, path: docPath, node_id: nodeId });
  }

  // ─── Composite: Structural Context for Kreator ───────────────────

  /**
   * Gather full structural context for a Kreator prompt.
   * This is the main entry point the Kreator calls before generating proposals.
   * 
   * Returns activated nodes, blast radius, co-change predictions,
   * and risk assessment — all in one call.
   */
  async gatherStructuralContext(query: string, affectedFiles?: string[]): Promise<M1ndStructuralContext | null> {
    if (!this.connected) return null;

    try {
      // Parallel: activate + panoramic risk scan
      const [activationResult, panoramicResult] = await Promise.allSettled([
        this.activate(query, 15),
        this.panoramic(10),
      ]);

      const activated = activationResult.status === 'fulfilled' ? activationResult.value : null;
      const panoramic = panoramicResult.status === 'fulfilled' ? panoramicResult.value : null;

      // If we got activated nodes, run impact on the top result
      let blastRadius = null;
      let coChangePredictions = null;

      if (activated?.seeds?.length > 0) {
        const topNode = activated.seeds[0];
        const topNodeId = topNode.id || topNode.external_id || topNode.node_id;

        if (topNodeId) {
          const [impactResult, predictResult] = await Promise.allSettled([
            this.impact(topNodeId),
            this.predict(topNodeId),
          ]);

          blastRadius = impactResult.status === 'fulfilled' ? impactResult.value : null;
          coChangePredictions = predictResult.status === 'fulfilled' ? predictResult.value : null;
        }
      }

      // If we have specific files, validate them as a plan
      let riskScore = null;
      if (affectedFiles && affectedFiles.length > 0) {
        const actions = affectedFiles.map(f => ({ action_type: 'modify', file_path: f }));
        const validateResult = await this.validatePlan(actions).catch(() => null);
        riskScore = validateResult;
      }

      return {
        activatedNodes: activated?.seeds || activated?.activated || [],
        blastRadius,
        coChangePredictions,
        riskScore,
        layerViolations: panoramic?.critical_alerts || [],
      };
    } catch (err: any) {
      console.warn(`[m1nd-bridge] Structural context gather failed: ${err.message}`);
      return null;
    }
  }

  // ─── Internal: MCP Communication ─────────────────────────────────

  private async callTool(name: string, args: Record<string, any>): Promise<any> {
    if (!this.connected || !this.process) {
      return null; // Graceful degradation
    }

    const id = this.messageId++;
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: args },
    };

    return this.sendRaw(request);
  }

  private sendRaw(request: MCPRequest): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin?.writable) {
        resolve(null);
        return;
      }

      const timeout = setTimeout(() => {
        this.pending.delete(request.id);
        console.warn(`[m1nd-bridge] Timeout on request ${request.id} (${request.method})`);
        resolve(null); // Timeout = graceful null
      }, 30000);

      this.pending.set(request.id, { resolve, reject, timer: timeout });

      try {
        const payload = JSON.stringify(request) + '\n';
        this.process!.stdin!.write(payload);
      } catch (err: any) {
        this.pending.delete(request.id);
        clearTimeout(timeout);
        console.warn(`[m1nd-bridge] Write error: ${err.message}`);
        resolve(null);
      }
    });
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep incomplete last line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const response = JSON.parse(trimmed) as MCPResponse;
        if (response.id && this.pending.has(response.id)) {
          const { resolve, reject, timer } = this.pending.get(response.id)!;
          this.pending.delete(response.id);
          clearTimeout(timer);

          if (response.error) {
            console.warn(`[m1nd-bridge] Tool error: ${response.error.message}`);
            resolve(null); // Errors degrade gracefully
          } else {
            // MCP tools/call returns { content: [{ type: "text", text: "..." }] }
            const content = response.result?.content;
            if (Array.isArray(content) && content.length > 0 && content[0].text) {
              try {
                resolve(JSON.parse(content[0].text));
              } catch {
                resolve(content[0].text);
              }
            } else {
              resolve(response.result);
            }
          }
        }
      } catch {
        // Not JSON or incomplete — will be caught in next buffer cycle
      }
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [id, { resolve, timer }] of this.pending) {
      clearTimeout(timer);
      resolve(null); // Graceful null instead of rejection
    }
    this.pending.clear();
  }

  private async attemptReconnect(): Promise<void> {
    if (this.reconnecting || this.reconnectAttempts >= this.maxReconnectAttempts) return;
    this.reconnecting = true;
    this.reconnectAttempts++;

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
    console.log(`[m1nd-bridge] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    await this.sleep(delay);
    this.reconnecting = false;

    const ok = await this.connect();
    if (!ok && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.attemptReconnect();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ─── Singleton ─────────────────────────────────────────────────────

let bridge: M1ndBridge | null = null;

/**
 * Get or create the global M1ND bridge instance.
 * Call this from server.ts to get a shared connection.
 */
export function getM1ndBridge(): M1ndBridge {
  if (!bridge) {
    bridge = new M1ndBridge('retrobuilder', 'm1nd-mcp');
  }
  return bridge;
}

/**
 * Initialize the M1ND bridge — attempt connection but don't block boot.
 * Returns the bridge instance regardless of connection status.
 */
export async function initM1ndBridge(): Promise<M1ndBridge> {
  const b = getM1ndBridge();
  
  // Non-blocking connect — don't hold up server boot
  b.connect().then((ok) => {
    if (ok) {
      console.log('[m1nd-bridge] Ready for structural queries');
    } else {
      console.log('[m1nd-bridge] Running in degraded mode (m1nd offline)');
    }
  }).catch(() => {
    console.log('[m1nd-bridge] Running in degraded mode (m1nd offline)');
  });

  return b;
}
