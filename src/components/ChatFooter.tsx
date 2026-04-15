import React, { useState } from 'react';
import { useGraphStore } from '../store/useGraphStore';
import { generateGraphStructure, generateProposal } from '../lib/gemini';
import { Send, Loader2, Terminal } from 'lucide-react';

export default function ChatFooter() {
  const { graphData, setGraphData, setManifesto, setArchitecture, manifesto, isGenerating, setIsGenerating, projectContext, setProjectContext, setPendingProposal } = useGraphStore();
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

  const totalNodes = graphData.nodes.length;
  const completedNodes = graphData.nodes.filter(n => n.status === 'completed').length;
  const progress = totalNodes > 0 ? Math.round((completedNodes / totalNodes) * 100) : 0;

  return (
    <footer className="h-[120px] bg-surface border-t border-border-subtle p-4 px-6 flex gap-5 shrink-0 z-20">
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
