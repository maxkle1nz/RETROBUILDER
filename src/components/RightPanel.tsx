import React, { useState, useEffect } from 'react';
import { useGraphStore } from '../store/useGraphStore';
import { m1nd } from '../lib/m1nd';
import { exportToOmx } from '../lib/api';
import { X, Activity, Zap, Target, GitMerge, XCircle, Shield, Network, BarChart3, Layers, Download, CheckSquare } from 'lucide-react';
import { motion } from 'motion/react';

export default function RightPanel() {
  const { closeRightPanel, selectedNode, appMode, setHighlightedNodes, clearHighlightedNodes, graphData } = useGraphStore();
  const [m1ndData, setM1ndData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Check m1nd health on mount and periodically
  useEffect(() => {
    const checkHealth = async () => {
      const connected = await m1nd.isConnected();
      setIsConnected(connected);
    };
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => {
      clearInterval(interval);
      clearHighlightedNodes();
    };
  }, [clearHighlightedNodes]);

  /**
   * Parse m1nd impact result and extract affected node IDs.
   * The m1nd.impact response may contain various formats — 
   * we do a best-effort extraction of node labels/IDs.
   */
  const extractImpactedNodeIds = (result: any): string[] => {
    if (!result) return [];
    
    const ids: string[] = [];
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
    
    // Match against known node IDs in the graph
    for (const node of graphData.nodes) {
      if (resultStr.includes(node.id) || resultStr.toLowerCase().includes(node.label.toLowerCase())) {
        ids.push(node.id);
      }
    }
    
    return ids;
  };

  const runM1ndAction = async (action: string) => {
    if (!selectedNode) return;
    setLoading(true);
    setActiveAction(action);
    try {
      let result;
      switch (action) {
        case 'impact':
          result = await m1nd.impact(selectedNode.id);
          const impactedIds = extractImpactedNodeIds(result);
          setHighlightedNodes(impactedIds, selectedNode.id);
          break;
        case 'predict':
          result = await m1nd.predict(selectedNode.id);
          const predictedIds = extractImpactedNodeIds(result);
          setHighlightedNodes(predictedIds, selectedNode.id);
          break;
        case 'validate':
          result = await m1nd.validatePlan([
            { action_type: 'modify', file_path: selectedNode.label }
          ]);
          break;
        case 'diagram':
          result = await m1nd.diagram(selectedNode.id, 2, 'mermaid');
          break;
        case 'layers':
          result = await m1nd.layers();
          break;
        case 'metrics':
          result = await m1nd.metrics(undefined, 15);
          break;
        default:
          break;
      }
      setM1ndData(result);
    } catch (e) {
      console.error(e);
      setM1ndData({ error: 'Failed to execute m1nd action.' });
    } finally {
      setLoading(false);
    }
  };

  const handleClearHighlights = () => {
    clearHighlightedNodes();
    setM1ndData(null);
    setActiveAction(null);
  };

  // Check if the result contains a mermaid diagram
  const mermaidContent = activeAction === 'diagram' && m1ndData?.diagram 
    ? m1ndData.diagram 
    : null;

  return (
    <motion.div 
      initial={{ x: 400 }}
      animate={{ x: 0 }}
      exit={{ x: 400 }}
      className="w-[350px] border-l border-border-subtle bg-[rgba(16,18,24,0.95)] backdrop-blur-md flex flex-col z-30 shadow-[-10px_0_30px_rgba(0,0,0,0.5)]"
    >
      <div className="h-[60px] border-b border-border-subtle flex items-center justify-between px-4 shrink-0">
        <div className="font-bold text-accent tracking-widest text-sm flex items-center gap-2">
          <Activity size={16} />
          {appMode === 'm1nd' ? 'M1ND ANALYSIS' : 'PROPERTIES'}
        </div>
        <div className="flex items-center gap-3">
          {/* M1ND connection indicator */}
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#50fa7b] shadow-[0_0_6px_#50fa7b]' : 'bg-[#ffcb6b]'}`} title={isConnected ? 'm1nd: connected' : 'm1nd: offline'} />
          <button onClick={closeRightPanel} className="text-text-dim hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {!selectedNode ? (
          <div className="h-full flex items-center justify-center text-text-dim text-sm text-center">
            Select a node to view details
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h3 className="text-white font-bold text-lg mb-1">{selectedNode.label}</h3>
              <div className="text-xs text-accent uppercase tracking-wider mb-3">{selectedNode.type}</div>
              <p className="text-sm text-text-dim leading-relaxed">{selectedNode.description}</p>
            </div>

            {/* Priority & Acceptance Criteria */}
            {(selectedNode.priority || selectedNode.acceptance_criteria) && (
              <div className="border-t border-border-subtle pt-4 space-y-3">
                {selectedNode.priority && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase text-text-dim tracking-widest">Build Priority</span>
                    <span className="text-xs font-mono bg-[rgba(255,255,255,0.08)] px-2 py-0.5 rounded text-white">
                      Phase {selectedNode.priority}
                    </span>
                  </div>
                )}
                {selectedNode.acceptance_criteria && selectedNode.acceptance_criteria.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <CheckSquare size={12} className="text-[#50fa7b]" />
                      <span className="text-[10px] uppercase text-[#50fa7b] tracking-widest font-bold">Acceptance Criteria</span>
                    </div>
                    <ul className="space-y-1">
                      {selectedNode.acceptance_criteria.map((ac: string, i: number) => (
                        <li key={i} className="text-[10px] text-text-dim font-mono pl-3 border-l border-[#50fa7b]/30">
                          {ac}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {selectedNode.error_handling && selectedNode.error_handling.length > 0 && (
                  <div>
                    <span className="text-[10px] uppercase text-[#ff9d00] tracking-widest font-bold">Error Handling</span>
                    <ul className="space-y-1 mt-1">
                      {selectedNode.error_handling.map((eh: string, i: number) => (
                        <li key={i} className="text-[10px] text-text-dim font-mono pl-3 border-l border-[#ff9d00]/30">
                          {eh}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {appMode === 'm1nd' && (
              <div className="border-t border-border-subtle pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-text-dim uppercase tracking-widest">m1nd Actions</h4>
                  <div className="flex gap-2">
                    {activeAction && (
                      <button 
                        onClick={handleClearHighlights}
                        className="text-[10px] px-2 py-1 bg-[#ff003c]/20 text-[#ff003c] rounded hover:bg-[#ff003c] hover:text-white transition-colors flex items-center gap-1"
                      >
                        <XCircle size={10} />
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {!isConnected && (
                  <div className="text-[10px] text-[#ffcb6b] bg-[#ffcb6b]/10 border border-[#ffcb6b]/20 rounded p-2 mb-3 font-mono">
                    ○ m1nd offline — actions will return limited data
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => runM1ndAction('impact')}
                    disabled={loading}
                    className={`flex flex-col items-center justify-center gap-2 bg-[#1a1f2b] border p-3 rounded-md hover:border-accent hover:text-accent transition-colors disabled:opacity-50 ${
                      activeAction === 'impact' ? 'border-[#ff003c] text-[#ff003c]' : 'border-border-subtle'
                    }`}
                  >
                    <Target size={18} />
                    <span className="text-[10px] uppercase tracking-wider">Blast Radius</span>
                  </button>
                  <button 
                    onClick={() => runM1ndAction('predict')}
                    disabled={loading}
                    className={`flex flex-col items-center justify-center gap-2 bg-[#1a1f2b] border p-3 rounded-md hover:border-accent hover:text-accent transition-colors disabled:opacity-50 ${
                      activeAction === 'predict' ? 'border-[#ff9d00] text-[#ff9d00]' : 'border-border-subtle'
                    }`}
                  >
                    <GitMerge size={18} />
                    <span className="text-[10px] uppercase tracking-wider">Co-change</span>
                  </button>
                  <button 
                    onClick={() => runM1ndAction('validate')}
                    disabled={loading}
                    className={`flex flex-col items-center justify-center gap-2 bg-[#1a1f2b] border p-3 rounded-md hover:border-accent hover:text-accent transition-colors disabled:opacity-50 ${
                      activeAction === 'validate' ? 'border-[#50fa7b] text-[#50fa7b]' : 'border-border-subtle'
                    }`}
                  >
                    <Shield size={18} />
                    <span className="text-[10px] uppercase tracking-wider">Risk Score</span>
                  </button>
                  <button 
                    onClick={() => runM1ndAction('diagram')}
                    disabled={loading}
                    className={`flex flex-col items-center justify-center gap-2 bg-[#1a1f2b] border p-3 rounded-md hover:border-accent hover:text-accent transition-colors disabled:opacity-50 ${
                      activeAction === 'diagram' ? 'border-[#b026ff] text-[#b026ff]' : 'border-border-subtle'
                    }`}
                  >
                    <Network size={18} />
                    <span className="text-[10px] uppercase tracking-wider">Diagram</span>
                  </button>
                  <button 
                    onClick={() => runM1ndAction('layers')}
                    disabled={loading}
                    className={`flex flex-col items-center justify-center gap-2 bg-[#1a1f2b] border p-3 rounded-md hover:border-accent hover:text-accent transition-colors disabled:opacity-50 ${
                      activeAction === 'layers' ? 'border-[#8be9fd] text-[#8be9fd]' : 'border-border-subtle'
                    }`}
                  >
                    <Layers size={18} />
                    <span className="text-[10px] uppercase tracking-wider">Layers</span>
                  </button>
                  <button 
                    onClick={() => runM1ndAction('metrics')}
                    disabled={loading}
                    className={`flex flex-col items-center justify-center gap-2 bg-[#1a1f2b] border p-3 rounded-md hover:border-accent hover:text-accent transition-colors disabled:opacity-50 ${
                      activeAction === 'metrics' ? 'border-[#f1fa8c] text-[#f1fa8c]' : 'border-border-subtle'
                    }`}
                  >
                    <BarChart3 size={18} />
                    <span className="text-[10px] uppercase tracking-wider">Metrics</span>
                  </button>
                </div>

                {loading && (
                  <div className="mt-4 text-xs text-accent animate-pulse flex items-center gap-2">
                    <Zap size={14} /> Processing via m1nd MCP...
                  </div>
                )}

                {m1ndData && !loading && (
                  <div className="mt-4 bg-black/50 border border-border-subtle p-3 rounded-md">
                    <h4 className="text-[10px] text-accent uppercase tracking-widest mb-2">
                      {activeAction === 'validate' ? 'Risk Assessment' : 
                       activeAction === 'diagram' ? 'Graph Diagram' :
                       activeAction === 'layers' ? 'Architectural Layers' :
                       activeAction === 'metrics' ? 'Structural Metrics' :
                       'Analysis Result'}
                    </h4>
                    {mermaidContent ? (
                      <pre className="text-[10px] text-[#b026ff] whitespace-pre-wrap font-mono overflow-x-auto max-h-[300px] overflow-y-auto custom-scrollbar">
                        {mermaidContent}
                      </pre>
                    ) : (
                      <pre className="text-[10px] text-text-dim whitespace-pre-wrap font-mono overflow-x-auto max-h-[300px] overflow-y-auto custom-scrollbar">
                        {typeof m1ndData === 'string' ? m1ndData : JSON.stringify(m1ndData, null, 2)}
                      </pre>
                    )}
                  </div>
                )}

                {/* OMX Export Button */}
                <div className="mt-4 pt-4 border-t border-border-subtle">
                  <button
                    onClick={async () => {
                      setExporting(true);
                      try {
                        const manifesto = useGraphStore.getState().manifesto || '';
                        const result = await exportToOmx(graphData, manifesto, '');
                        // Create downloadable plan
                        const blob = new Blob(
                          [`${result.plan}\n\n---\n\n${result.agents}`],
                          { type: 'text/markdown' }
                        );
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'omx-plan.md';
                        a.click();
                        URL.revokeObjectURL(url);
                        setM1ndData({ 
                          exported: true, 
                          message: 'OMX plan exported successfully',
                          stats: (result as any).stats 
                        });
                        setActiveAction('export');
                      } catch (e) {
                        console.error(e);
                        setM1ndData({ error: 'Failed to export OMX plan' });
                      } finally {
                        setExporting(false);
                      }
                    }}
                    disabled={exporting || graphData.nodes.length === 0}
                    className="w-full flex items-center justify-center gap-2 bg-[#50fa7b]/10 border border-[#50fa7b]/30 text-[#50fa7b] p-3 rounded-md hover:bg-[#50fa7b]/20 hover:border-[#50fa7b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Download size={14} />
                    <span className="text-[10px] uppercase tracking-widest font-bold">
                      {exporting ? 'Exporting...' : 'Export to OMX'}
                    </span>
                  </button>
                  <p className="text-[9px] text-text-dim mt-2 text-center font-mono">
                    Generate .omx/plan.md for autonomous $ralph execution
                  </p>
                </div>
              </div>
            )}

            {appMode === 'architect' && (
              <div className="border-t border-border-subtle pt-4">
                <h4 className="text-xs font-bold text-text-dim uppercase tracking-widest mb-3">Data Contract</h4>
                <div className="bg-[#1a1f2b] border border-border-subtle p-3 rounded-md text-xs text-text-main font-mono">
                  {selectedNode.data_contract || 'No data contract defined.'}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
