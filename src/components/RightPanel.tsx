import React, { useState } from 'react';
import { useGraphStore } from '../store/useGraphStore';
import { m1nd } from '../lib/m1nd';
import { X, Activity, Zap, Target, GitCommit, GitMerge } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function RightPanel() {
  const { closeRightPanel, selectedNode, appMode } = useGraphStore();
  const [m1ndData, setM1ndData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const connectM1nd = async () => {
    setLoading(true);
    try {
      await m1nd.connect();
      setIsConnected(true);
      setM1ndData({ message: 'Connected to m1nd MCP proxy.' });
    } catch (e) {
      console.error(e);
      setM1ndData({ error: 'Failed to connect to m1nd MCP proxy. Is it running on ws://localhost:8080?' });
    } finally {
      setLoading(false);
    }
  };

  const runM1ndAction = async (action: string) => {
    if (!selectedNode) return;
    if (!isConnected) {
      setM1ndData({ error: 'Please connect to m1nd first.' });
      return;
    }
    setLoading(true);
    try {
      let result;
      switch (action) {
        case 'impact':
          result = await m1nd.impact('agent-1', selectedNode.id);
          break;
        case 'predict':
          result = await m1nd.predict('agent-1', selectedNode.id);
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
        <button onClick={closeRightPanel} className="text-text-dim hover:text-white transition-colors">
          <X size={18} />
        </button>
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

            {appMode === 'm1nd' && (
              <div className="border-t border-border-subtle pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-text-dim uppercase tracking-widest">m1nd Actions</h4>
                  {!isConnected && (
                    <button 
                      onClick={connectM1nd}
                      disabled={loading}
                      className="text-[10px] px-2 py-1 bg-accent/20 text-accent rounded hover:bg-accent hover:text-bg transition-colors"
                    >
                      Connect
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => runM1ndAction('impact')}
                    disabled={loading || !isConnected}
                    className="flex flex-col items-center justify-center gap-2 bg-[#1a1f2b] border border-border-subtle p-3 rounded-md hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
                  >
                    <Target size={18} />
                    <span className="text-[10px] uppercase tracking-wider">Blast Radius</span>
                  </button>
                  <button 
                    onClick={() => runM1ndAction('predict')}
                    disabled={loading || !isConnected}
                    className="flex flex-col items-center justify-center gap-2 bg-[#1a1f2b] border border-border-subtle p-3 rounded-md hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
                  >
                    <GitMerge size={18} />
                    <span className="text-[10px] uppercase tracking-wider">Predict Co-change</span>
                  </button>
                </div>

                {loading && (
                  <div className="mt-4 text-xs text-accent animate-pulse flex items-center gap-2">
                    <Zap size={14} /> Processing via m1nd MCP...
                  </div>
                )}

                {m1ndData && !loading && (
                  <div className="mt-4 bg-black/50 border border-border-subtle p-3 rounded-md">
                    <h4 className="text-[10px] text-accent uppercase tracking-widest mb-2">Analysis Result</h4>
                    <pre className="text-[10px] text-text-dim whitespace-pre-wrap font-mono overflow-x-auto">
                      {JSON.stringify(m1ndData, null, 2)}
                    </pre>
                  </div>
                )}
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
