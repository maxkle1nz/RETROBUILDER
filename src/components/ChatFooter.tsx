import React, { useState } from 'react';
import { useGraphStore } from '../store/useGraphStore';
import { generateGraphStructure, generateProposal, applyProposal } from '../lib/api';
import { m1nd } from '../lib/m1nd';
import { Send, Loader2, Terminal, Check, X, BrainCircuit } from 'lucide-react';

export default function ChatFooter() {
  const { graphData, setGraphData, setManifesto, setArchitecture, manifesto, isGenerating, setIsGenerating, projectContext, setProjectContext, pendingProposal, setPendingProposal, appMode } = useGraphStore();
  const [prompt, setPrompt] = useState('');
  const [m1ndResult, setM1ndResult] = useState<string | null>(null);
  const [m1ndConnected, setM1ndConnected] = useState(false);

  const isM1ndMode = appMode === 'm1nd';
  const mode = isM1ndMode ? 'M1ND' : (graphData.nodes.length === 0 ? 'KONSTRUKTOR' : 'KREATOR');

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    // ─── M1ND Mode: route through m1nd.activate ───
    if (isM1ndMode) {
      setIsGenerating(true);
      setM1ndResult(null);
      try {
        if (!m1ndConnected) {
          await m1nd.connect();
          setM1ndConnected(true);
        }
        const result = await m1nd.activate('retrobuilder', prompt);
        setM1ndResult(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
        setPrompt('');
      } catch (error) {
        console.error("[m1nd] Activation error:", error);
        setM1ndResult(`Error: ${error instanceof Error ? error.message : 'Failed to connect to m1nd proxy. Is it running on ws://localhost:8080?'}`);
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    // ─── Architect Mode: KONSTRUKTOR / KREATOR ───
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

      {/* M1ND activation result overlay */}
      {m1ndResult && isM1ndMode && (
        <div className="absolute bottom-full mb-4 left-6 right-6 bg-[#1a1f2b] border border-[#b026ff] p-4 rounded-md shadow-[0_0_20px_rgba(176,38,255,0.15)] z-30 max-h-[300px] overflow-y-auto custom-scrollbar">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-[#b026ff] text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
              <BrainCircuit size={12} />
              m1nd Activation Result
            </h4>
            <button onClick={() => setM1ndResult(null)} className="text-text-dim hover:text-white transition-colors">
              <X size={14} />
            </button>
          </div>
          <pre className="text-[10px] text-text-dim whitespace-pre-wrap font-mono leading-relaxed">
            {m1ndResult}
          </pre>
        </div>
      )}

      <div className="flex-1 relative flex flex-col">
        <div className={`absolute -top-7 left-0 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest font-bold ${isM1ndMode ? 'text-[#b026ff]' : 'text-accent'}`}>
          {isM1ndMode ? <BrainCircuit size={12} /> : <Terminal size={12} />}
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
          placeholder={
            isM1ndMode 
              ? "Query m1nd graph engine... (e.g. 'where is auth handled?')" 
              : mode === 'KONSTRUKTOR' 
                ? "Describe the system you want to build..." 
                : "Ask to modify the graph topology or explain behavior..."
          }
          className={`w-full h-full bg-bg border rounded-lg p-3 text-text-main font-sans text-[12px] resize-none outline-none custom-scrollbar ${
            isM1ndMode ? 'border-[#b026ff]/30 focus:border-[#b026ff]' : 'border-border-subtle focus:border-accent'
          }`}
        />
        <button 
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className={`absolute bottom-3 right-3 p-1.5 disabled:opacity-50 rounded transition-colors cursor-pointer ${
            isM1ndMode 
              ? 'bg-[#b026ff]/20 text-[#b026ff] hover:bg-[#b026ff] hover:text-bg' 
              : 'bg-accent-dim text-accent hover:bg-accent hover:text-bg'
          }`}
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
