import React, { useState } from 'react';
import { useGraphStore } from '../store/useGraphStore';
import { analyzeArchitecture } from '../lib/api';
import { Loader2, Search, CheckCircle2, Activity, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';

/**
 * Sidebar — decomposed.
 * Shows Builder/Manifesto/Architecture context.
 * Node editing lives in the global NodeInspector drawer.
 */
export default function Sidebar() {
  const { graphData, setGraphData, manifesto, architecture, isGenerating } = useGraphStore();
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'manifesto' | 'architecture'>('chat');

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalysisResult(null);
    try {
      const result = await analyzeArchitecture(graphData, manifesto);
      setAnalysisResult(result);
    } catch (error) {
      console.error(error);
      toast.error('Architecture analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const applyOptimizedGraph = () => {
    if (analysisResult?.optimizedGraph) {
      setGraphData(analysisResult.optimizedGraph);
      setAnalysisResult(null);
    }
  };

  return (
    <div className="w-full h-full bg-surface border-l border-border-subtle flex flex-col text-text-main font-sans z-10 relative">
      <AnimatePresence mode="wait">
          <motion.div 
            key="chat"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="flex border-b border-border-subtle">
              <button 
                onClick={() => setActiveTab('chat')}
                className={`flex-1 py-3 text-[10px] uppercase tracking-widest font-bold transition-colors border-b-2 ${activeTab === 'chat' ? 'border-accent text-accent' : 'border-transparent text-text-dim hover:text-text-main'}`}
              >
                Builder
              </button>
              <button 
                onClick={() => setActiveTab('manifesto')}
                className={`flex-1 py-3 text-[10px] uppercase tracking-widest font-bold transition-colors border-b-2 ${activeTab === 'manifesto' ? 'border-accent text-accent' : 'border-transparent text-text-dim hover:text-text-main'}`}
              >
                Manifesto
              </button>
              <button 
                onClick={() => setActiveTab('architecture')}
                className={`flex-1 py-3 text-[10px] uppercase tracking-widest font-bold transition-colors border-b-2 ${activeTab === 'architecture' ? 'border-accent text-accent' : 'border-transparent text-text-dim hover:text-text-main'}`}
              >
                Architecture
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar">
              {activeTab === 'chat' && (
                <>
                  {graphData.nodes.length > 0 && (
                    <div className="mb-4">
                      <button 
                        onClick={handleAnalyze}
                        disabled={analyzing}
                        className="w-full py-2.5 px-4 bg-[rgba(255,0,60,0.08)] border border-[#ff003c]/30 hover:bg-[#ff003c]/15 disabled:opacity-50 disabled:cursor-not-allowed text-[#ff003c] rounded flex items-center justify-center gap-2 transition-colors text-[11px] font-bold uppercase tracking-wider cursor-pointer"
                      >
                        {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
                        {analyzing ? 'Auditing...' : 'Analyze Architecture'}
                      </button>
                    </div>
                  )}

                  {analysisResult && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-4 rounded border ${analysisResult.isGood ? 'bg-[rgba(0,255,102,0.05)] border-[#00ff66]/30' : 'bg-[rgba(255,0,60,0.05)] border-[#ff003c]/30'}`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        {analysisResult.isGood ? <CheckCircle2 size={16} color="#00ff66" /> : <AlertTriangle size={16} color="#ff003c" />}
                        <span className={`text-[11px] font-bold uppercase ${analysisResult.isGood ? 'text-[#00ff66]' : 'text-[#ff003c]'}`}>
                          {analysisResult.isGood ? 'Architecture Solid' : 'Flaws Detected'}
                        </span>
                      </div>
                      <p className="text-[11px] text-text-dim leading-relaxed mb-4">
                        {analysisResult.critique}
                      </p>
                      {!analysisResult.isGood && analysisResult.optimizedGraph && (
                          <button 
                            onClick={applyOptimizedGraph}
                            className="w-full py-2 bg-[#ff003c]/10 border border-[#ff003c]/40 text-[#ff003c] rounded text-[10px] font-bold uppercase tracking-wider hover:bg-[#ff003c]/20 transition-colors cursor-pointer"
                          >
                            Apply Auto-Fix
                          </button>
                        )}
                    </motion.div>
                  )}

                  {graphData.nodes.length === 0 && !isGenerating && (
                    <div className="text-center text-text-dim mt-10 text-[11px]">
                      <div className="w-12 h-12 rounded-full bg-bg flex items-center justify-center mx-auto mb-4 border border-border-subtle">
                        <Search size={18} className="text-text-dim" />
                      </div>
                      No graph generated yet.<br/>Start by typing a prompt below.
                    </div>
                  )}
                  {isGenerating && (
                    <div className="flex items-center justify-center gap-2 text-accent text-[11px] uppercase tracking-wider mt-10">
                      <Loader2 className="animate-spin" size={14} />
                      Synthesizing m1ndmap...
                    </div>
                  )}
                </>
              )}

              {activeTab === 'manifesto' && (
                <div className="text-[11px] text-text-dim leading-[1.5] prose prose-invert prose-sm max-w-none prose-headings:text-accent prose-a:text-accent">
                  {manifesto ? <ReactMarkdown>{manifesto}</ReactMarkdown> : <div className="text-center mt-10 opacity-50">No manifesto generated yet.</div>}
                </div>
              )}

              {activeTab === 'architecture' && (
                <div className="text-[11px] text-text-dim leading-[1.5] prose prose-invert prose-sm max-w-none prose-headings:text-accent prose-a:text-accent">
                  {architecture ? <ReactMarkdown>{architecture}</ReactMarkdown> : <div className="text-center mt-10 opacity-50">No architecture document generated yet.</div>}
                </div>
              )}
            </div>
          </motion.div>
      </AnimatePresence>
    </div>
  );
}
