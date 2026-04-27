import React, { useState, useRef, useEffect } from 'react';
import { useGraphStore } from '../store/useGraphStore';
import { useBuildStore } from '../store/useBuildStore';
import { activateSessionDraft, fetchOmxStatus, generateGraphStructure, generateProposal, applyProposal, recordOmxOperationalMessage, runKompletus, resumeOmxBuild } from '../lib/api';
import { m1nd } from '../lib/m1nd';
import { Send, Loader2, Terminal, Check, X, BrainCircuit, Download, Upload, Trash2, Zap, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import ModelSelector from './ModelSelector';

interface ChatMessage {
  id: string;
  role: 'user' | 'system' | 'm1nd';
  content: string;
  timestamp: number;
}

export default function ChatFooter() {
  const {
    activeSessionId,
    activeSessionName,
    activeSessionSource,
    graphData,
    setGraphData,
    setManifesto,
    setArchitecture,
    manifesto,
    architecture,
    isGenerating,
    setIsGenerating,
    projectContext,
    setProjectContext,
    pendingProposal,
    setPendingProposal,
    appMode,
    importMeta,
    openSessionLauncher,
    isKompletusRunning,
    setKompletusRunning,
    addKompletusProgress,
    clearKompletusProgress,
    openKompletusReport,
  } = useGraphStore();
  const [prompt, setPrompt] = useState('');
  const [m1ndOnline, setM1ndOnline] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const seenResumeHintRef = useRef<string | null>(null);
  const buildProgress = useBuildStore((s) => s.buildProgress);
  const buildTotalNodes = useBuildStore((s) => s.totalNodes);
  const buildCompletedNodes = useBuildStore((s) => s.completedNodes);

  const isM1ndMode = appMode === 'm1nd';
  const isBuilderMode = appMode === 'builder';
  const mode = isBuilderMode ? 'BU1LDER' : isM1ndMode ? 'M1ND' : (graphData.nodes.length === 0 ? 'KONSTRUKTOR' : 'KREATOR');

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

  const isBuilderResumePrompt = (text: string) => /(^|\b)(continue|continuar|continua|retoma|retomar|resume|riprendi|where you stopped|de onde você parou|de onde voce parou)(\b|$)/i.test(text.trim());

  useEffect(() => {
    if (!isBuilderMode || !activeSessionId) return;

    let cancelled = false;
    void (async () => {
      try {
        const remote = await fetchOmxStatus(activeSessionId);
        if (cancelled) return;
        if (!remote.resumeAvailable || !remote.buildId) return;
        if (seenResumeHintRef.current === remote.buildId) return;

        seenResumeHintRef.current = remote.buildId;
        setShowHistory(true);
        addMessage(
          'system',
          `Resume available: build ${remote.buildId.slice(0, 8)} is ${remote.resumeReason || remote.status} at ${remote.completedNodes ?? 0}/${remote.totalNodes ?? 0} nodes. Type \"continue\" to resume from persisted workspace truth.`,
        );
      } catch {
        // best-effort hint only
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isBuilderMode, activeSessionId]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    if (!activeSessionId) {
      openSessionLauncher();
      toast.info('Create or load a session first');
      return;
    }
    const currentPrompt = prompt;
    setPrompt('');
    addMessage('user', currentPrompt);
    setShowHistory(true);

    if (isBuilderMode && isBuilderResumePrompt(currentPrompt)) {
      setIsGenerating(true);
      try {
        await recordOmxOperationalMessage(activeSessionId, {
          role: 'user',
          action: 'resume',
          message: currentPrompt,
        });
        const build = await resumeOmxBuild(activeSessionId, {
          name: activeSessionName,
          source: activeSessionSource,
          graph: graphData,
          manifesto,
          architecture,
          projectContext,
          importMeta,
        });
        const { resetBuild, initNodeStates, startBuild, hydrateBuildLifecycle } = useBuildStore.getState();
        resetBuild();
        initNodeStates(graphData.nodes.map((node) => node.id));
        startBuild(build.status);
        hydrateBuildLifecycle(build);
        addMessage('system', `Resuming OMX build ${build.buildId.slice(0, 8)} from persisted workspace truth.`);
        await recordOmxOperationalMessage(activeSessionId, {
          role: 'system',
          action: 'resume',
          message: `Resume accepted for build ${build.buildId.slice(0, 8)}.`,
        });
        toast.success(`Resumed OMX build ${build.buildId.slice(0, 8)}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to resume OMX build';
        addMessage('system', `Resume failed: ${msg}`);
        await recordOmxOperationalMessage(activeSessionId, {
          role: 'system',
          action: 'resume_failed',
          message: msg,
        }).catch(() => {});
        toast.error('Failed to resume OMX build', { description: msg });
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    // ─── M1ND Mode: route through server-side m1nd bridge ───
    if (isM1ndMode) {
      setIsGenerating(true);
      try {
        const result = await activateSessionDraft(activeSessionId, currentPrompt, {
          name: activeSessionName,
          source: activeSessionSource,
          graph: graphData,
          manifesto,
          architecture,
          projectContext,
          importMeta,
        });
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
        const explanation = systemState.explanation?.trim();
        const selfCorrected = systemState.meta?.selfCorrected;
        const pass1Issues = systemState.meta?.pass1Issues || 0;
        if (explanation) {
          addMessage('system', explanation);
        } else {
          addMessage('system', `✓ Generated ${systemState.graph.nodes.length} nodes, ${systemState.graph.links.length} edges. Select modules and run Deep Research to ground them.`);
        }
        if (selfCorrected) {
          const enhanced = systemState.meta?.enhancedNodes || 0;
          addMessage('system', `🔁 Hardened by Critic+Dreamer — ${pass1Issues} issue(s) resolved, architecture enhanced to ${enhanced} modules with full error handling, contracts, and compliance.`);
        }
        toast.success(`Skeleton generated: ${systemState.graph.nodes.length} modules${selfCorrected ? ' (self-corrected)' : ''}`);
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

  const handleKompletus = async () => {
    if (!prompt.trim()) {
      toast.warning('Describe the system you want to build');
      return;
    }
    if (!activeSessionId) {
      openSessionLauncher();
      toast.info('Create or load a session first');
      return;
    }
    const currentPrompt = prompt;
    setPrompt('');
    addMessage('user', `⚡ KOMPLETUS: ${currentPrompt}`);
    setShowHistory(true);
    setKompletusRunning(true);
    clearKompletusProgress();

    try {
      addMessage('system', '⚡ KOMPLETUS pipeline started — generating, researching, validating...');
      const result = await runKompletus(currentPrompt, (event) => {
        addKompletusProgress(event);
        if (event.message) {
          addMessage('system', `  ${event.message}`);
        }
      });
      openKompletusReport(result);
      addMessage('system', `✓ KOMPLETUS complete: ${result.graph.nodes.length} modules, ${Object.keys(result.research).length} researched. Report ready.`);
      toast.success('KOMPLETUS report ready for review');
    } catch (error) {
      console.error('[KOMPLETUS] Error:', error);
      const msg = error instanceof Error ? error.message : 'Pipeline failed';
      addMessage('system', `✗ KOMPLETUS error: ${msg}`);
      toast.error('KOMPLETUS failed', { description: msg });
    } finally {
      setKompletusRunning(false);
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

  const graphTotalNodes = graphData.nodes.length;
  const graphCompletedNodes = graphData.nodes.filter(n => n.status === 'completed').length;
  const graphProgress = graphTotalNodes > 0 ? Math.round((graphCompletedNodes / graphTotalNodes) * 100) : 0;
  const railUsesBuildLifecycle = isBuilderMode && buildTotalNodes > 0;
  const railTotalNodes = railUsesBuildLifecycle ? buildTotalNodes : graphTotalNodes;
  const railCompletedNodes = railUsesBuildLifecycle ? buildCompletedNodes : graphCompletedNodes;
  const railProgress = railUsesBuildLifecycle ? buildProgress : graphProgress;
  const showUtilityRail = graphTotalNodes > 0 || isBuilderMode || isGenerating || isKompletusRunning;

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

      <div className="px-3 py-2 sm:px-6">
        <div className={`grid gap-3 ${showUtilityRail ? 'xl:grid-cols-[minmax(0,1fr)_220px]' : ''}`}>
          <div className={`min-w-0 overflow-hidden rounded-[18px] border bg-[#050608]/92 shadow-[0_16px_48px_rgba(0,0,0,0.28)] ${
            isBuilderMode
              ? 'border-[#50fa7b]/24'
              : isM1ndMode
                ? 'border-[#b026ff]/24'
                : 'border-border-subtle'
          }`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/[0.025] px-3 py-1.5">
              <div className={`flex min-w-0 flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-widest ${
                isBuilderMode ? 'text-[#50fa7b]' : isM1ndMode ? 'text-[#b026ff]' : 'text-accent'
              }`}>
                <span className="inline-flex items-center gap-2 rounded-full border border-current/25 bg-current/10 px-2.5 py-1">
                  {isM1ndMode ? <BrainCircuit size={12} /> : <Terminal size={12} />}
                  {mode} mode
                </span>
                <span className="hidden min-w-0 truncate text-[9px] text-text-dim lg:inline">
                  {isBuilderMode
                    ? 'Resume or inspect generated workspace operations'
                    : isM1ndMode
                      ? 'Ask grounded questions over the project graph'
                      : mode === 'KONSTRUKTOR'
                        ? 'Describe a system and let RETROBUILDER shape the blueprint'
                        : 'Ask for precise graph edits, refinements or architecture changes'}
                </span>
                {m1ndOnline && isM1ndMode && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#50fa7b]/25 bg-[#50fa7b]/10 px-2 py-1 text-[8px] text-[#50fa7b]">
                    <Zap size={8} /> GROUNDED
                  </span>
                )}
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowHistory(!showHistory)}
                    className="rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[9px] text-text-dim transition-colors hover:border-accent/40 hover:text-accent"
                  >
                    {showHistory ? 'Hide history' : 'History'} · {messages.length}
                  </button>
                )}
              </div>
              <ModelSelector className="shrink-0" />
            </div>

            <div className="relative p-1.5">
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
                className={`h-[48px] w-full resize-none rounded-xl border bg-bg px-3 py-2.5 pr-20 font-mono text-[12px] text-text-main outline-none transition-all duration-300 custom-scrollbar sm:h-[50px] ${
                  isBuilderMode
                    ? 'border-[#50fa7b]/30 focus:border-[#50fa7b] focus:shadow-[0_0_12px_rgba(80,250,123,0.2)]'
                    : isM1ndMode
                      ? 'border-[#b026ff]/30 focus:border-[#b026ff] focus:shadow-[0_0_12px_rgba(176,38,255,0.2)]'
                      : 'border-border-subtle focus:border-accent focus:shadow-[0_0_12px_rgba(0,242,255,0.15)]'
                }`}
              />
              <div className="absolute bottom-3.5 right-3.5 flex items-center gap-2">
                {mode === 'KONSTRUKTOR' && !isKompletusRunning && (
                  <button
                    type="button"
                    onClick={handleKompletus}
                    disabled={isGenerating || !prompt.trim()}
                    className="rounded-lg bg-[#ff79c6]/15 p-2 text-[#ff79c6] transition-colors hover:bg-[#ff79c6] hover:text-bg disabled:opacity-30"
                    title="KOMPLETUS: Full pipeline with deep research + validation"
                  >
                    <Sparkles size={14} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating || !prompt.trim()}
                  className={`rounded-lg p-2 transition-colors disabled:opacity-50 ${
                    isBuilderMode
                      ? 'bg-[#50fa7b]/20 text-[#50fa7b] hover:bg-[#50fa7b] hover:text-bg'
                      : isM1ndMode
                        ? 'bg-[#b026ff]/20 text-[#b026ff] hover:bg-[#b026ff] hover:text-bg'
                        : 'bg-accent-dim text-accent hover:bg-accent hover:text-bg'
                  }`}
                >
                  {isGenerating || isKompletusRunning ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
            </div>
          </div>

          {showUtilityRail && (
            <div className="hidden rounded-[18px] border border-border-subtle bg-[#050608]/70 p-3 xl:flex flex-col justify-center">
              <div className="flex items-center justify-between text-[10px] uppercase opacity-70 font-mono">
                <span>Flow</span>
                <span>{railProgress}%</span>
              </div>
              <div className="w-full h-1 bg-border-subtle rounded-sm my-2 overflow-hidden">
                <div
                  className={`h-full rounded-sm transition-all duration-500 ${
                    isBuilderMode
                      ? 'bg-[#50fa7b] shadow-[0_0_10px_rgba(80,250,123,0.75)]'
                      : 'bg-accent shadow-[0_0_10px_var(--color-accent)]'
                  }`}
                  style={{ width: `${railProgress}%` }}
                />
              </div>
              <div className="text-[9px] flex justify-between mb-2 font-mono text-text-dim">
                <span>{railCompletedNodes}/{railTotalNodes} modules</span>
                <span>{isBuilderMode ? 'builder' : isM1ndMode ? 'm1nd' : 'architect'}</span>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={graphTotalNodes === 0}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-border-subtle/50 text-text-dim p-1.5 text-[9px] font-bold rounded uppercase hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-30"
                  title="Export graph as JSON"
                >
                  <Download size={10} /> Export
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-border-subtle/50 text-text-dim p-1.5 text-[9px] font-bold rounded uppercase hover:text-accent hover:bg-accent/10 transition-colors"
                  title="Import graph from JSON"
                >
                  <Upload size={10} /> Import
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
