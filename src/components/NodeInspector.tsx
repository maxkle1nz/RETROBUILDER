import React, { useState, useEffect } from 'react';
import { useGraphStore } from '../store/useGraphStore';
import { performDeepResearch } from '../lib/api';
import { Loader2, Search, X, Save, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';

/**
 * NodeInspector — extracted from Sidebar.
 * Displays when a node is selected: editable fields + deep research.
 */
export default function NodeInspector() {
  const { selectedNode, setSelectedNode, updateNode, projectContext } = useGraphStore();
  const [researching, setResearching] = useState(false);
  const [researchResult, setResearchResult] = useState<string | null>(null);
  const [showSavedResearch, setShowSavedResearch] = useState(false);

  // Node editing state
  const [editLabel, setEditLabel] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editContract, setEditContract] = useState('');
  const [editStatus, setEditStatus] = useState<'pending' | 'in-progress' | 'completed'>('pending');
  const [editNotes, setEditNotes] = useState('');

  useEffect(() => {
    if (selectedNode) {
      setEditLabel(selectedNode.label);
      setEditDesc(selectedNode.description);
      setEditContract(selectedNode.data_contract || '');
      setEditStatus(selectedNode.status);
      setEditNotes(selectedNode.constructionNotes || '');
      setResearchResult(null);
      setShowSavedResearch(false);
    }
  }, [selectedNode]);

  const handleSaveNode = () => {
    if (selectedNode) {
      updateNode(selectedNode.id, {
        label: editLabel,
        description: editDesc,
        data_contract: editContract,
        status: editStatus,
        constructionNotes: editNotes || undefined,
      });
      toast.success(`Saved: ${editLabel}`);
    }
  };

  const handleResearch = async () => {
    if (!selectedNode) return;
    setResearching(true);
    setResearchResult(null);
    try {
      const result = await performDeepResearch(selectedNode, projectContext);
      setResearchResult(result);
      // Auto-persist research to the node
      updateNode(selectedNode.id, { researchContext: result });
      toast.success(`Research grounded to ${selectedNode.label}`);
    } catch (error) {
      console.error("Research error:", error);
      setResearchResult("Failed to perform research. Please try again.");
      toast.error('Deep research failed');
    } finally {
      setResearching(false);
    }
  };

  if (!selectedNode) return null;

  return (
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

        {/* Construction Notes */}
        <div className="my-6 border-t border-border-subtle pt-4">
          <label className="text-[9px] uppercase tracking-widest text-text-dim mb-1 block">Construction Notes</label>
          <textarea 
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            placeholder="Add implementation notes, library choices, patterns..."
            className="w-full bg-bg border border-border-subtle rounded p-2 text-[10px] text-text-main font-mono outline-none focus:border-accent resize-none h-20 custom-scrollbar"
          />
          {editNotes !== (selectedNode?.constructionNotes || '') && (
            <button 
              onClick={() => {
                if (selectedNode) {
                  updateNode(selectedNode.id, { constructionNotes: editNotes || undefined });
                  toast.success('Notes saved');
                }
              }}
              className="mt-1 text-[9px] text-accent hover:text-white transition-colors uppercase tracking-wider cursor-pointer"
            >
              💾 Save Notes
            </button>
          )}
        </div>

        {/* Saved Research Context (collapsible) */}
        {selectedNode?.researchContext && !researchResult && (
          <div className="mb-4">
            <button 
              onClick={() => setShowSavedResearch(!showSavedResearch)}
              className="flex items-center gap-2 text-[9px] uppercase tracking-widest text-[#50fa7b]/70 hover:text-[#50fa7b] transition-colors w-full cursor-pointer"
            >
              {showSavedResearch ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              🔬 Saved Research Context
            </button>
            {showSavedResearch && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-2 bg-[rgba(80,250,123,0.04)] border border-[#50fa7b]/20 rounded p-3"
              >
                <div className="text-[11px] text-text-dim leading-[1.4] prose prose-invert prose-sm max-w-none prose-a:text-accent prose-headings:text-text-main prose-headings:text-[13px] max-h-[300px] overflow-y-auto custom-scrollbar">
                  <ReactMarkdown>{selectedNode.researchContext}</ReactMarkdown>
                </div>
              </motion.div>
            )}
          </div>
        )}

        {/* Deep Research Button */}
        <div className="border-t border-border-subtle pt-4">
          <button 
            onClick={handleResearch}
            disabled={researching}
            className="w-full py-2 px-4 bg-accent-dim border border-accent/30 hover:bg-accent/20 disabled:opacity-50 text-accent rounded-[4px] flex items-center justify-center gap-2 transition-colors text-[11px] font-bold uppercase tracking-wider cursor-pointer"
          >
            {researching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {researching ? 'Grounding...' : selectedNode?.researchContext ? 'Re-Run Research' : 'Deep Research'}
          </button>
        </div>

        {researchResult && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 bg-[rgba(255,255,255,0.03)] border border-border-subtle rounded-[6px] p-3"
          >
            <span className="text-[9px] bg-accent-dim text-accent px-1.5 py-0.5 rounded-[10px] uppercase mb-2 inline-block">
              Research Synthesis ✓ Saved
            </span>
            <div className="text-[11px] text-text-dim leading-[1.4] prose prose-invert prose-sm max-w-none prose-a:text-accent prose-headings:text-text-main prose-headings:text-[13px] prose-headings:mb-1.5 prose-p:mb-2">
              <ReactMarkdown>{researchResult}</ReactMarkdown>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
