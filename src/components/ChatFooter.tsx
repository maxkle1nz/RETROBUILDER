import React, { useState, useRef, useEffect } from 'react';
import { useGraphStore } from '../store/useGraphStore';
import { generateGraphStructure, generateProposal, applyProposal } from '../lib/api';
import { m1nd } from '../lib/m1nd';
import { Send, Loader2, Terminal, Check, X, BrainCircuit, Download, Upload, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import ModelSelector from './ModelSelector';

interface ChatMessage {
  id: string;
  role: 'user' | 'system' | 'm1nd';
  content: string;
  timestamp: number;
}

export default function ChatFooter() {
  const { graphData, setGraphData, setManifesto, setArchitecture, manifesto, isGenerating, setIsGenerating, projectContext, setProjectContext, pendingProposal, setPendingProposal, appMode } = useGraphStore();
  const [prompt, setPrompt] = useState('');
  const [m1ndOnline, setM1ndOnline] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  const isM1ndMode = appMode === 'm1nd';
  const mode = isM1ndMode ? 'M1ND' : (graphData.nodes.length === 0 ? 'KONSTRUKTOR' : 'KREATOR');

  // Check m1nd health
  useEffect(() => {
    const check = async () => {
      const online = await m1nd.isConnected();
      setM1ndOnline(online);
    };
    check();
    const interval = setInterval(check, 20000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll history
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [messages]);

  const addMessage = (role: ChatMessage['role'], content: string) => {
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role, content, timestamp: Date.now() }]);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    const currentPrompt = prompt;
    setPrompt('');
    addMessage('user', currentPrompt);
    setShowHistory(true);

    // ─── M1ND Mode: route through server-side m1nd bridge ───
    if (isM1ndMode) {
      setIsGenerating(true);
      try {
        const result = await m1nd.activate(currentPrompt);
        if (result?.error) {
          addMessage('system', `m1nd: ${result.error}`);
          toast.warning('m1nd offline — structural queries unavailable');
        } else {
          const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          addMessage('m1nd', text);
        }
      } catch (error) {
        console.error("[m1nd] Activation error:", error);
        const msg = error instanceof Error ? error.message : 'Failed to query m1nd';
        addMessage('system', `Error: ${msg}`);
        toast.error('m1nd query failed', { description: msg });
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    // ─── Architect Mode: KONSTRUKTOR / KREATOR ───
    setIsGenerating(true);
    if (!projectContext) setProjectContext(currentPrompt);

    try {
      if (mode === 'KONSTRUKTOR') {
        const systemState = await generateGraphStructure(currentPrompt, undefined, manifesto);
        setGraphData(systemState.graph);
        setManifesto(systemState.manifesto);
        setArchitecture(systemState.architecture);
        addMessage('system', `✓ Generated ${systemState.graph.nodes.length} nodes, ${systemState.graph.links.length} edges`);
        toast.success(`Skeleton generated: ${systemState.graph.nodes.length} modules`);
      } else {
        const proposalText = await generateProposal(currentPrompt, graphData, manifesto);
        setPendingProposal({ text: proposalText, prompt: currentPrompt });
        addMessage('system', `Proposal ready: ${proposalText.substring(0, 120)}...`);
        toast.info('Kreator proposal ready for review');
      }
    } catch (error) {
      console.error("Error generating:", error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      addMessage('system', `Error: ${msg}`);
      toast.error('Generation failed', { description: msg });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAcceptProposal = async () => {
    if (!pendingProposal) return;
    setIsGenerating(true);
    try {
      const newGraph = await applyProposal(pendingProposal.prompt, graphData, manifesto, pendingProposal.text);
      if (newGraph?.nodes && newGraph?.links) {
        setGraphData(newGraph);
        addMessage('system', `✓ Applied modification: ${newGraph.nodes.length} nodes`);
        toast.success('Proposal applied successfully');
      }
      setPendingProposal(null);
    } catch (error) {
      console.error("Error applying proposal:", error);
      toast.error('Failed to apply proposal');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRejectProposal = () => {
    setPendingProposal(null);
    addMessage('system', '✗ Proposal rejected');
    toast.info('Proposal discarded');
  };

  const handleExport = () => {
    const data = JSON.stringify(graphData, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `retrobuilder-graph-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Graph exported');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.nodes && data.links) {
          setGraphData(data);
          toast.success(`Imported: ${data.nodes.length} nodes`);
        } else {
          toast.error('Invalid graph file format');
        }
      } catch {
        toast.error('Failed to parse JSON file');
      }
    };
    input.click();
  };

  const totalNodes = graphData.nodes.length;
  const completedNodes = graphData.nodes.filter(n => n.status === 'completed').length;
  const progress = totalNodes > 0 ? Math.round((completedNodes / totalNodes) * 100) : 0;

  return (
    <footer className="bg-surface border-t border-border-subtle shrink-0 z-20 relative">
      {/* Pending proposal bar */}
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

      {/* Chat history panel */}
      {showHistory && messages.length > 0 && (
        <div className="border-b border-border-subtle">
          <div className="flex items-center justify-between px-6 py-2 bg-bg/50">
            <span className="text-[9px] uppercase tracking-widest text-text-dim font-mono">Chat History ({messages.length})</span>
            <div className="flex gap-2">
              <button onClick={() => { setMessages([]); toast.info('History cleared'); }} className="text-text-dim hover:text-[#ff003c] transition-colors" title="Clear history">
                <Trash2 size={12} />
              </button>
              <button onClick={() => setShowHistory(false)} className="text-text-dim hover:text-white transition-colors">
                <X size={12} />
              </button>
            </div>
          </div>
          <div ref={historyRef} className="max-h-[200px] overflow-y-auto custom-scrollbar px-6 py-3 space-y-2">
            {messages.map(msg => (
              <div key={msg.id} className={`text-[11px] font-mono leading-relaxed flex gap-2 ${
                msg.role === 'user' ? 'text-accent' : msg.role === 'm1nd' ? 'text-[#b026ff]' : 'text-text-dim'
              }`}>
                <span className="opacity-40 shrink-0 text-[9px] mt-0.5">
                  {new Date(msg.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className={`shrink-0 uppercase text-[9px] tracking-wider mt-0.5 ${
                  msg.role === 'user' ? 'text-accent' : msg.role === 'm1nd' ? 'text-[#b026ff]' : 'text-text-dim'
                }`}>
                  [{msg.role}]
                </span>
                <span className="text-text-main whitespace-pre-wrap break-words">{msg.content}</span>
              </div>
            ))}
            {isGenerating && (
              <div className="text-[11px] font-mono text-accent animate-pulse flex items-center gap-2">
                <Loader2 size={10} className="animate-spin" /> Processing...
              </div>
            )}
          </div>
        </div>
      )}

      <div className="h-[100px] p-4 px-6 flex gap-5">
        <div className="flex-1 relative flex flex-col">
          <div className={`absolute -top-7 left-0 right-0 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest font-bold`}>
            <div className={`flex items-center gap-2 ${isM1ndMode ? 'text-[#b026ff]' : 'text-accent'}`}>
              {isM1ndMode ? <BrainCircuit size={12} /> : <Terminal size={12} />}
              <span>[ {mode} MODE ]</span>
              {m1ndOnline && isM1ndMode && (
                <span className="flex items-center gap-1 text-[#50fa7b] text-[8px]">
                  <Zap size={8} /> GROUNDED
                </span>
              )}
              {messages.length > 0 && (
                <button 
                  onClick={() => setShowHistory(!showHistory)} 
                  className="text-text-dim hover:text-accent transition-colors ml-2 text-[9px]"
                >
                  {showHistory ? '▼ HIDE' : '▲ HISTORY'} ({messages.length})
                </button>
              )}
            </div>
            <ModelSelector />
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
            className={`w-full h-full bg-bg border rounded-lg p-3 text-text-main font-mono text-[12px] resize-none outline-none custom-scrollbar transition-colors duration-300 ${
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
          <div className="text-[11px] uppercase opacity-70 font-mono">Autopilot Progress</div>
          <div className="w-full h-1 bg-border-subtle rounded-sm my-2 overflow-hidden">
            <div 
              className="h-full bg-accent rounded-sm shadow-[0_0_10px_var(--color-accent)] transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-[10px] flex justify-between mb-2 font-mono">
            <span>{completedNodes}/{totalNodes} modules</span>
            <span>{progress}%</span>
          </div>
          <div className="flex gap-1.5">
            <button 
              onClick={handleExport}
              disabled={totalNodes === 0}
              className="flex-1 flex items-center justify-center gap-1.5 bg-border-subtle/50 text-text-dim p-1.5 text-[9px] font-bold cursor-pointer rounded uppercase hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-30"
              title="Export graph as JSON"
            >
              <Download size={10} /> Export
            </button>
            <button 
              onClick={handleImport}
              className="flex-1 flex items-center justify-center gap-1.5 bg-border-subtle/50 text-text-dim p-1.5 text-[9px] font-bold cursor-pointer rounded uppercase hover:text-accent hover:bg-accent/10 transition-colors"
              title="Import graph from JSON"
            >
              <Upload size={10} /> Import
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
