import React, { useState } from 'react';
import { useGraphStore } from '../store/useGraphStore';
import { generateGraphStructure, generateProposal, applyProposal } from '../lib/gemini';
import { Send, Loader2, Terminal, Check, X } from 'lucide-react';

export default function ChatFooter() {
  const { graphData, setGraphData, setManifesto, setArchitecture, manifesto, isGenerating, setIsGenerating, projectContext, setProjectContext, pendingProposal, setPendingProposal } = useGraphStore();
  const [prompt, setPrompt] = useState('');

  const mode = graphData.nodes.length === 0 ? 'KONSTRUKTOR' : 'KREATOR';

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    
    if (!projectContext) {
      setProjectContext(prompt);
    }

    try {
      if (mode === 'KONSTRUKTOR') {
        const systemState = await generateGraphStructure(prompt, undefined, manifesto);
        setGraphData(systemState.graph);
        setManifesto(systemState.manifesto);
        setArchitecture(systemState.architecture);
        setPrompt('');
      } else {
        // KREATOR mode
        const proposalText = await generateProposal(prompt, graphData, manifesto);
        setPendingProposal({ text: proposalText, prompt });
        setPrompt('');
      }
    } catch (error) {
      console.error("Error generating:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAcceptProposal = async () => {
    if (!pendingProposal) return;
    setIsGenerating(true);
    try {
      const newGraph = await applyProposal(pendingProposal.prompt, graphData, manifesto, pendingProposal.text);
      if (newGraph && newGraph.nodes && newGraph.links) {
        setGraphData(newGraph);
      }
      setPendingProposal(null);
    } catch (error) {
      console.error("Error applying proposal:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRejectProposal = () => {
    setPendingProposal(null);
  };

  const totalNodes = graphData.nodes.length;
  const completedNodes = graphData.nodes.filter(n => n.status === 'completed').length;
  const progress = totalNodes > 0 ? Math.round((completedNodes / totalNodes) * 100) : 0;

  return (
    <footer className="h-[120px] bg-surface border-t border-border-subtle p-4 px-6 flex gap-5 shrink-0 z-20 relative">
      {pendingProposal && (
        <div className="absolute bottom-full mb-4 left-6 right-6 bg-[#1a1f2b] border border-accent p-4 rounded-md shadow-[0_0_20px_rgba(0,255,204,0.15)] z-30">
          <h4 className="text-accent text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
            <Terminal size={12} />
            Pending Modification Proposal
          </h4>
          <p className="text-sm text-text-main mb-4 font-mono leading-relaxed">{pendingProposal.text}</p>
          <div className="flex gap-3">
            <button 
              onClick={handleAcceptProposal} 
              disabled={isGenerating}
              className="flex items-center gap-2 bg-accent text-bg px-4 py-1.5 rounded text-[11px] font-bold uppercase hover:bg-white transition-colors disabled:opacity-50"
            >
              {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Execute Plan
            </button>
            <button 
              onClick={handleRejectProposal} 
              disabled={isGenerating}
              className="flex items-center gap-2 border border-border-subtle text-text-dim px-4 py-1.5 rounded text-[11px] font-bold uppercase hover:text-white hover:border-text-dim transition-colors disabled:opacity-50"
            >
              <X size={14} />
              Abort
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 relative flex flex-col">
        <div className="absolute -top-7 left-0 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest font-bold text-accent">
          <Terminal size={12} />
          <span>[ {mode} MODE ]</span>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleGenerate();
            }
          }}
          placeholder={mode === 'KONSTRUKTOR' ? "Describe the system you want to build..." : "Ask to modify the graph topology or explain behavior..."}
          className="w-full h-full bg-bg border border-border-subtle rounded-lg p-3 text-text-main font-sans text-[12px] resize-none outline-none focus:border-accent custom-scrollbar"
        />
        <button 
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="absolute bottom-3 right-3 p-1.5 bg-accent-dim text-accent hover:bg-accent hover:text-bg disabled:opacity-50 rounded transition-colors cursor-pointer"
        >
          {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
      
      <div className="w-[240px] border-l border-border-subtle pl-5 flex flex-col justify-center">
        <div className="text-[11px] uppercase opacity-70">Autopilot Progress</div>
        <div className="w-full h-1 bg-border-subtle rounded-sm my-2.5 overflow-hidden">
          <div 
            className="h-full bg-accent rounded-sm shadow-[0_0_10px_var(--color-accent)] transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-[10px] flex justify-between mb-3">
          <span>Synthesizing Organs...</span>
          <span>{progress}%</span>
        </div>
        <button className="bg-accent border-none p-1.5 text-[10px] font-bold cursor-pointer text-bg rounded uppercase shadow-[0_0_10px_var(--color-accent-dim)] hover:shadow-[0_0_15px_var(--color-accent)] transition-shadow">
          Launch Full Autonomy
        </button>
      </div>
    </footer>
  );
}
