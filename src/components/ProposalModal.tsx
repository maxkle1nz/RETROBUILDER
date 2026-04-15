import React from 'react';
import { useGraphStore } from '../store/useGraphStore';
import { generateGraphStructure } from '../lib/api';
import { motion } from 'motion/react';
import { Terminal, Check, X, Loader2 } from 'lucide-react';

export default function ProposalModal() {
  const { pendingProposal, setPendingProposal, graphData, manifesto, setGraphData, setManifesto, setArchitecture, setIsGenerating, isGenerating } = useGraphStore();

  if (!pendingProposal) return null;

  const handleExecute = async () => {
    const prompt = pendingProposal.prompt;
    setPendingProposal(null);
    setIsGenerating(true);
    try {
      const systemState = await generateGraphStructure(prompt, graphData, manifesto);
      setGraphData(systemState.graph);
      setManifesto(systemState.manifesto);
      setArchitecture(systemState.architecture);
    } catch (error) {
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAbort = () => {
    setPendingProposal(null);
  };

  return (
    <div className="absolute inset-0 z-[100] bg-bg/80 backdrop-blur-sm flex items-center justify-center p-6">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-surface border border-accent shadow-[0_0_30px_rgba(0,242,255,0.15)] max-w-lg w-full p-6 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-accent" />
        <div className="flex items-center gap-3 mb-4 text-accent">
          <Terminal size={20} />
          <h2 className="font-mono text-[14px] uppercase tracking-widest font-bold">Kreator // Action Required</h2>
        </div>
        <div className="text-[12px] text-text-main font-mono leading-relaxed mb-6 bg-bg p-4 border border-border-subtle">
          <div className="text-text-dim mb-2 uppercase text-[10px]">Proposed Modification:</div>
          {pendingProposal.text}
        </div>
        <div className="flex gap-4">
          <button 
            onClick={handleExecute} 
            disabled={isGenerating}
            className="flex-1 bg-accent text-bg py-2.5 font-bold uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 hover:bg-white transition-colors cursor-pointer disabled:opacity-50"
          >
            {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} 
            Proceed
          </button>
          <button 
            onClick={handleAbort} 
            disabled={isGenerating}
            className="flex-1 bg-transparent border border-border-subtle text-text-dim py-2.5 font-bold uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 hover:text-[#ff003c] hover:border-[#ff003c] transition-colors cursor-pointer disabled:opacity-50"
          >
            <X size={14} /> Modify
          </button>
        </div>
      </motion.div>
    </div>
  );
}
