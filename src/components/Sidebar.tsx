import React, { useState, useEffect } from 'react';
import { useGraphStore } from '../store/useGraphStore';
import { performDeepResearch, analyzeArchitecture } from '../lib/gemini';
import { Loader2, Search, X, CheckCircle2, Circle, PlayCircle, FileText, Activity, Save, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';

export default function Sidebar() {
  const { graphData, setGraphData, manifesto, architecture, isGenerating, projectContext, selectedNode, setSelectedNode, updateNode } = useGraphStore();
  const [researching, setResearching] = useState(false);
  const [researchResult, setResearchResult] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'manifesto' | 'architecture'>('chat');

  // Node editing state
  const [editLabel, setEditLabel] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editContract, setEditContract] = useState('');
  const [editStatus, setEditStatus] = useState<'pending' | 'in-progress' | 'completed'>('pending');

  useEffect(() => {
    if (selectedNode) {
      setEditLabel(selectedNode.label);
      setEditDesc(selectedNode.description);
      setEditContract(selectedNode.data_contract || '');
      setEditStatus(selectedNode.status);
    }
  }, [selectedNode]);

  const handleSaveNode = () => {
    if (selectedNode) {
      updateNode(selectedNode.id, {
        label: editLabel,
        description: editDesc,
        data_contract: editContract,
        status: editStatus
      });
    }
  };

  const handleResearch = async () => {
    if (!selectedNode) return;
    setResearching(true);
    setResearchResult(null);
    try {
      const result = await performDeepResearch(selectedNode, projectContext);
      setResearchResult(result);
    } catch (error) {
      console.error("Research error:", error);
      setResearchResult("Failed to perform research. Please try again.");
    } finally {
      setResearching(false);
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalysisResult(null);
    try {
      const result = await analyzeArchitecture(graphData, manifesto);
      setAnalysisResult(result);
    } catch (error) {
      console.error(error);
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
    <div className="w-[320px] h-full bg-surface border-l border-border-subtle flex flex-col text-text-main font-sans z-10 relative">
      <AnimatePresence mode="wait">
        {selectedNode ? (
          <motion.div 
            key="node-details"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="text-[10px] uppercase tracking-[1.5px] p-4 text-text-dim border-b border-border-subtle flex justify-between items-center bg-[rgba(255,255,255,0.02)]">
              <span>Node Inspector</span>
              <button onClick={() => setSelectedNode(null)} className="text-text-dim hover:text-accent transition-colors cursor-pointer">
                <X size={14} />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
              <div className="mb-4 flex flex-col gap-3">
                <div>
                  <label className="text-[9px] uppercase tracking-widest text-text-dim mb-1 block">Label</label>
                  <input 
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="w-full bg-bg border border-border-subtle rounded p-2 text-[12px] text-accent font-bold outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-widest text-text-dim mb-1 block">Description</label>
                  <textarea 
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="w-full bg-bg border border-border-subtle rounded p-2 text-[11px] text-text-main outline-none focus:border-accent resize-none h-20 custom-scrollbar"
                  />
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-widest text-text-dim mb-1 block">Data Contract</label>
                  <textarea 
                    value={editContract}
                    onChange={(e) => setEditContract(e.target.value)}
                    placeholder="e.g. In: JSON, Out: JWT"
                    className="w-full bg-bg border border-border-subtle rounded p-2 text-[10px] text-accent-dim font-mono outline-none focus:border-accent resize-none h-16 custom-scrollbar"
                  />
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-widest text-text-dim mb-1 block">Status</label>
                  <select 
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="w-full bg-bg border border-border-subtle rounded p-2 text-[11px] text-text-main outline-none focus:border-accent"
                  >
                    <option value="pending">Pending</option>
                    <option value="in-progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <button 
                  onClick={handleSaveNode}
                  className="w-full py-2 bg-border-subtle hover:bg-accent hover:text-bg text-text-main rounded text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Save size={12} /> Save Changes
                </button>
              </div>

              <div className="my-6 border-t border-border-subtle pt-6">
                <button 
                  onClick={handleResearch}
                  disabled={researching}
                  className="w-full py-2 px-4 bg-accent-dim border border-accent/30 hover:bg-accent/20 disabled:opacity-50 text-accent rounded-[4px] flex items-center justify-center gap-2 transition-colors text-[11px] font-bold uppercase tracking-wider cursor-pointer"
                >
                  {researching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  {researching ? 'Grounding...' : 'Deep Research'}
                </button>
              </div>

              {researchResult && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 bg-[rgba(255,255,255,0.03)] border border-border-subtle rounded-[6px] p-3"
                >
                  <span className="text-[9px] bg-accent-dim text-accent px-1.5 py-0.5 rounded-[10px] uppercase mb-2 inline-block">
                    Research Synthesis
                  </span>
                  <div className="text-[11px] text-text-dim leading-[1.4] prose prose-invert prose-sm max-w-none prose-a:text-accent prose-headings:text-text-main prose-headings:text-[13px] prose-headings:mb-1.5 prose-p:mb-2">
                    <ReactMarkdown>{researchResult}</ReactMarkdown>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        ) : (
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
                Arch
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
                        className="w-full py-2.5 px-4 bg-[rgba(255,0,60,0.1)] border border-[#ff003c]/30 hover:bg-[#ff003c]/20 disabled:opacity-50 text-[#ff003c] rounded-[4px] flex items-center justify-center gap-2 transition-colors text-[11px] font-bold uppercase tracking-wider cursor-pointer"
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
                          className="w-full py-2 bg-[#ff003c] text-white rounded text-[10px] font-bold uppercase tracking-wider hover:bg-red-600 transition-colors cursor-pointer"
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
        )}
      </AnimatePresence>
    </div>
  );
}
