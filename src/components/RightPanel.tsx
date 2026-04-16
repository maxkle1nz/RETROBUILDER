import React, { useEffect, useMemo, useState } from 'react';
import { useGraphStore } from '../store/useGraphStore';
import { useBuildStore } from '../store/useBuildStore';
import {
  activateSessionDraft,
  ExportBlockedError,
  exportSessionDraftToOmx,
  getSessionGapsDraft,
  getSessionImpactDraft,
  getSessionReadinessDraft,
  performDeepResearch,
  runSessionAdvancedDraft,
  type BlueprintGapReport,
  type BlueprintImpactReport,
  type BlueprintReadinessReport,
  type SessionAdvancedReport,
} from '../lib/api';
import {
  X,
  Activity,
  Zap,
  Target,
  GitMerge,
  Shield,
  Network,
  BarChart3,
  Layers,
  Download,
  CheckSquare,
  AlertTriangle,
  Search,
} from 'lucide-react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';

type PanelTab = 'ready' | 'impact' | 'gaps' | 'research' | 'advanced';

export default function RightPanel() {
  const {
    activeSessionId,
    activeSessionName,
    activeSessionSource,
    importMeta,
    closeRightPanel,
    selectedNode,
    appMode,
    setHighlightedNodes,
    clearHighlightedNodes,
    graphData,
    manifesto,
    architecture,
    projectContext,
  } = useGraphStore();
  const [tab, setTab] = useState<PanelTab>('ready');
  const [readiness, setReadiness] = useState<BlueprintReadinessReport | null>(null);
  const [impact, setImpact] = useState<BlueprintImpactReport | null>(null);
  const [gaps, setGaps] = useState<BlueprintGapReport | null>(null);
  const [researchResult, setResearchResult] = useState<string | null>(null);
  const [advancedData, setAdvancedData] = useState<SessionAdvancedReport | null>(null);
  const [advancedAction, setAdvancedAction] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const currentDraft = useMemo(() => ({
    name: activeSessionName,
    source: activeSessionSource,
    graph: graphData,
    manifesto,
    architecture,
    projectContext,
    importMeta,
  }), [activeSessionName, activeSessionSource, graphData, manifesto, architecture, projectContext, importMeta]);

  useEffect(() => {
    const checkHealth = async () => {
      if (!activeSessionId) {
        setIsConnected(false);
        return;
      }
      try {
        const result = await runSessionAdvancedDraft(activeSessionId, 'health', currentDraft);
        setIsConnected(!result.data?.error);
      } catch {
        setIsConnected(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => {
      clearInterval(interval);
      clearHighlightedNodes();
    };
  }, [clearHighlightedNodes, activeSessionId, currentDraft]);

  useEffect(() => {
    if (appMode !== 'm1nd' || !activeSessionId) return;
    refreshReadiness();
  }, [appMode, activeSessionId, currentDraft]);

  useEffect(() => {
    if (tab !== 'impact' || !activeSessionId || !selectedNode) return;
    runImpact();
  }, [tab, activeSessionId, selectedNode?.id, currentDraft]);

  useEffect(() => {
    if (tab !== 'gaps' || !activeSessionId) return;
    runGaps();
  }, [tab, activeSessionId, currentDraft]);

  const summaryBadge = useMemo(() => {
    if (!readiness) return null;
    if (readiness.status === 'blocked') return { label: 'Blocked', className: 'bg-[#ff5c7a]/10 text-[#ff5c7a]' };
    if (readiness.status === 'needs_review') return { label: 'Needs Review', className: 'bg-[#ffcb6b]/10 text-[#ffcb6b]' };
    return { label: 'Ready', className: 'bg-[#50fa7b]/10 text-[#50fa7b]' };
  }, [readiness]);

  async function refreshReadiness() {
    if (!activeSessionId) return;
    try {
      const result = await getSessionReadinessDraft(activeSessionId, currentDraft);
      setReadiness(result);
    } catch (error) {
      console.error(error);
      setReadiness(null);
    }
  }

  async function runImpact() {
    if (!activeSessionId || !selectedNode) return;
    setLoading(true);
    try {
      const result = await getSessionImpactDraft(activeSessionId, selectedNode.id, currentDraft);
      setImpact(result);
      const ids = Array.from(new Set([
        selectedNode.id,
        ...result.upstream.map((entry) => entry.id),
        ...result.downstream.map((entry) => entry.id),
        ...result.changedTogether.map((entry) => entry.id),
      ]));
      setHighlightedNodes(ids, selectedNode.id);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to analyze impact');
    } finally {
      setLoading(false);
    }
  }

  async function runGaps() {
    if (!activeSessionId) return;
    setLoading(true);
    try {
      const result = await getSessionGapsDraft(activeSessionId, currentDraft);
      setGaps(result);
    } catch (error) {
      console.error(error);
      toast.error('Failed to analyze blueprint gaps');
    } finally {
      setLoading(false);
    }
  }

  async function runResearch() {
    if (!selectedNode) return;
    setLoading(true);
    try {
      const result = await performDeepResearch(selectedNode, projectContext);
      setResearchResult(result);
    } catch (error) {
      console.error(error);
      toast.error('Deep research failed');
    } finally {
      setLoading(false);
    }
  }

  async function runAdvancedAction(action: string) {
    if (!activeSessionId) return;
    setLoading(true);
    setAdvancedAction(action);
    try {
      const result = await runSessionAdvancedDraft(
        activeSessionId,
        action as SessionAdvancedReport['action'],
        currentDraft,
        selectedNode?.id,
      );
      setAdvancedData(result);
      setIsConnected(!result.data?.error);
    } catch (error) {
      console.error(error);
      setAdvancedData({
        action: action as SessionAdvancedReport['action'],
        data: { error: 'Failed to execute advanced m1nd action.' },
        projection: { prepared: false, runtimeDir: 'unavailable' },
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    if (!activeSessionId) return;
    setExporting(true);
    try {
      const result = await exportSessionDraftToOmx(activeSessionId, currentDraft);

      // Download the OMX plan file
      const blob = new Blob(
        [`${result.plan}\n\n---\n\n${result.agents}`],
        { type: 'text/markdown' },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'omx-plan.md';
      a.click();
      URL.revokeObjectURL(url);
      setReadiness(result.readiness);

      // ─── Activate Build Mode ───
      const nodeIds = graphData.nodes.map((n) => n.id);
      useBuildStore.getState().resetBuild();
      useBuildStore.getState().initNodeStates(nodeIds);
      useBuildStore.getState().startBuild();
      useGraphStore.getState().setAppMode('builder');

      toast.success('OMX plan exported — Build Mode activated');
    } catch (error) {
      if (error instanceof ExportBlockedError) {
        setReadiness(error.readiness || null);
        toast.error(error.message);
      } else {
        console.error(error);
        toast.error('Failed to export OMX plan');
      }
    } finally {
      setExporting(false);
    }
  }

  function renderReadiness() {
    if (!activeSessionId) {
      return <div className="text-sm text-text-dim">No active session loaded.</div>;
    }
    if (!readiness) {
      return <div className="text-sm text-text-dim">Collecting readiness report...</div>;
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-text-dim mb-1">Ralph Readiness</div>
            {summaryBadge && (
              <span className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded ${summaryBadge.className}`}>
                {summaryBadge.label}
              </span>
            )}
          </div>
          <button
            onClick={handleExport}
            disabled={exporting || !readiness.exportAllowed}
            className="flex items-center gap-2 bg-[#50fa7b]/10 border border-[#50fa7b]/30 text-[#50fa7b] px-3 py-2 rounded text-[10px] uppercase tracking-widest font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={12} />
            {exporting ? 'Exporting...' : 'Export to Ralph'}
          </button>
        </div>

        {activeSessionSource === 'imported_codebase' && importMeta && (
          <div className="bg-[#50fa7b]/5 border border-[#50fa7b]/20 rounded p-3">
            <div className="text-[10px] uppercase tracking-widest text-[#50fa7b] mb-2">Imported Session</div>
            <div className="text-[11px] text-text-dim font-mono">{importMeta.sourcePath}</div>
            {importMeta.notes?.length > 0 && (
              <ul className="mt-2 space-y-1">
                {importMeta.notes.map((note, index) => (
                  <li key={index} className="text-[10px] text-text-dim">- {note}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-surface/70 border border-border-subtle rounded p-3">
            <div className="text-[9px] uppercase tracking-widest text-text-dim mb-1">Grounding</div>
            <div className="text-sm text-text-main capitalize">{readiness.stats.groundingQuality}</div>
          </div>
          <div className="bg-surface/70 border border-border-subtle rounded p-3">
            <div className="text-[9px] uppercase tracking-widest text-text-dim mb-1">Build Order</div>
            <div className="text-sm text-text-main">{readiness.buildOrder.length} modules</div>
          </div>
          <div className="bg-surface/70 border border-border-subtle rounded p-3">
            <div className="text-[9px] uppercase tracking-widest text-text-dim mb-1">Acceptance Coverage</div>
            <div className="text-sm text-text-main">{readiness.stats.acceptanceCoverage}%</div>
          </div>
          <div className="bg-surface/70 border border-border-subtle rounded p-3">
            <div className="text-[9px] uppercase tracking-widest text-text-dim mb-1">Contracts Coverage</div>
            <div className="text-sm text-text-main">{readiness.stats.contractCoverage}%</div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#ff5c7a] mb-2">Hard Blockers</div>
            {readiness.blockers.length === 0 ? (
              <div className="text-[11px] text-[#50fa7b]">No blockers detected.</div>
            ) : (
              readiness.blockers.map((issue) => (
                <div key={issue.code} className="bg-[#ff5c7a]/5 border border-[#ff5c7a]/20 rounded p-3 mb-2">
                  <div className="text-[10px] uppercase tracking-widest text-[#ff5c7a]">{issue.code}</div>
                  <div className="text-[11px] text-text-main mt-1">{issue.message}</div>
                </div>
              ))
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#ffcb6b] mb-2">Warnings</div>
            {readiness.warnings.length === 0 ? (
              <div className="text-[11px] text-text-dim">No warnings right now.</div>
            ) : (
              readiness.warnings.map((issue) => (
                <div key={issue.code} className="bg-[#ffcb6b]/5 border border-[#ffcb6b]/20 rounded p-3 mb-2">
                  <div className="text-[10px] uppercase tracking-widest text-[#ffcb6b]">{issue.code}</div>
                  <div className="text-[11px] text-text-main mt-1">{issue.message}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="border-t border-border-subtle pt-4">
          <div className="text-[10px] uppercase tracking-widest text-text-dim mb-2">Computed Build Order</div>
          <div className="space-y-2">
            {readiness.buildOrder.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between bg-surface/60 border border-border-subtle rounded px-3 py-2">
                <span className="text-[11px] text-text-main">{entry.label}</span>
                <span className="text-[10px] font-mono text-accent">P{entry.priority}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderImpact() {
    if (!selectedNode) {
      return <div className="text-sm text-text-dim">Select a node to inspect upstream, downstream and changed-together modules.</div>;
    }
    if (!impact) {
      return <div className="text-sm text-text-dim">Collecting impact report...</div>;
    }

    const sections: Array<[string, typeof impact.upstream]> = [
      ['Upstream', impact.upstream],
      ['Downstream', impact.downstream],
      ['Changed Together', impact.changedTogether],
    ];

    return (
      <div className="space-y-4">
        <div className="bg-surface/70 border border-border-subtle rounded p-3">
          <div className="text-[10px] uppercase tracking-widest text-accent mb-1">Selected Module</div>
          <div className="text-sm text-text-main">{impact.nodeLabel}</div>
          <div className="text-[11px] text-text-dim mt-2">{impact.explanation}</div>
        </div>
        {impact.semanticRelated.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#8be9fd] mb-2">Semantic Related</div>
            <div className="flex flex-wrap gap-2">
              {impact.semanticRelated.map((item) => (
                <span key={item} className="text-[10px] px-2 py-1 rounded bg-[#8be9fd]/10 text-[#8be9fd]">
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}
        {sections.map(([label, entries]) => (
          <div key={label}>
            <div className="text-[10px] uppercase tracking-widest text-text-dim mb-2">{label}</div>
            {entries.length === 0 ? (
              <div className="text-[11px] text-text-dim">No modules in this direction.</div>
            ) : (
              <div className="space-y-2">
                {entries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between bg-surface/60 border border-border-subtle rounded px-3 py-2">
                    <span className="text-[11px] text-text-main">{entry.label}</span>
                    <span className="text-[10px] font-mono text-accent">P{entry.priority}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  function renderGaps() {
    if (!gaps) {
      return <div className="text-sm text-text-dim">Collecting structural gaps...</div>;
    }
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3">
          <GapSection title="Missing Acceptance Criteria" entries={gaps.missingAcceptanceCriteria} accent="text-[#ff5c7a]" />
          <GapSection title="Missing Contracts" entries={gaps.missingContracts} accent="text-[#ffcb6b]" />
          <GapSection title="Missing Error Handling" entries={gaps.missingErrorHandling} accent="text-[#8be9fd]" />
        </div>
        {(gaps.suggestedModules.length > 0 || gaps.semanticHints.length > 0) && (
          <div className="space-y-3">
            {gaps.suggestedModules.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[#50fa7b] mb-2">Suggested Modules</div>
                <ul className="space-y-2">
                  {gaps.suggestedModules.map((item) => (
                    <li key={item} className="text-[11px] text-text-main bg-[#50fa7b]/5 border border-[#50fa7b]/20 rounded p-3">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {gaps.semanticHints.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[#b026ff] mb-2">m1nd Hints</div>
                <ul className="space-y-2">
                  {gaps.semanticHints.map((item, index) => (
                    <li key={`${item}-${index}`} className="text-[11px] text-text-main bg-[#b026ff]/5 border border-[#b026ff]/20 rounded p-3">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderResearch() {
    if (!selectedNode) {
      return <div className="text-sm text-text-dim">Select a node to ground it with donors, papers and implementation guidance.</div>;
    }

    return (
      <div className="space-y-4">
        <div className="bg-surface/60 border border-border-subtle rounded p-3">
          <div className="text-[10px] uppercase tracking-widest text-accent mb-1">Grounding Target</div>
          <div className="text-sm text-text-main">{selectedNode.label}</div>
          <div className="text-[11px] text-text-dim mt-2">{selectedNode.description}</div>
        </div>
        <button
          onClick={runResearch}
          disabled={loading}
          className="w-full py-3 bg-accent/10 border border-accent/30 hover:bg-accent/20 text-accent rounded text-[11px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Search size={14} />
          {loading ? 'Grounding...' : 'Run Grounding & Research'}
        </button>
        {researchResult && (
          <div className="bg-black/40 border border-border-subtle rounded p-3 prose prose-invert prose-sm max-w-none prose-a:text-accent prose-headings:text-text-main">
            <ReactMarkdown>{researchResult}</ReactMarkdown>
          </div>
        )}
      </div>
    );
  }

  function renderAdvanced() {
    const mermaidContent = advancedAction === 'diagram'
      ? advancedData?.data?.diagram || advancedData?.data?.source || null
      : null;
    return (
        <div className="space-y-4">
          <div className="text-[10px] uppercase tracking-widest text-text-dim">Advanced m1nd Surface</div>
          <div className="grid grid-cols-2 gap-2">
            {([
              { action: 'health', Icon: Activity },
              { action: 'layers', Icon: Layers },
              { action: 'metrics', Icon: BarChart3 },
              { action: 'diagram', Icon: Network },
              { action: 'impact', Icon: Target },
              { action: 'predict', Icon: GitMerge },
            ]).map(({ action, Icon }) => (
            <button
              key={action}
              onClick={() => runAdvancedAction(action)}
              disabled={loading}
              className={`flex flex-col items-center justify-center gap-2 bg-[#1a1f2b] border p-3 rounded-md hover:border-accent hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                advancedAction === action ? 'border-accent text-accent' : 'border-border-subtle'
              }`}
            >
              <Icon size={18} />
              <span className="text-[10px] uppercase tracking-wider">{action}</span>
            </button>
            ))}
          </div>
        {loading && (
          <div className="text-xs text-accent animate-pulse flex items-center gap-2">
            <Zap size={14} /> Processing via m1nd MCP...
          </div>
        )}
        <div className="bg-black/50 border border-border-subtle p-3 rounded-md">
          <h4 className="text-[10px] text-accent uppercase tracking-widest mb-2">Advanced Output</h4>
          {mermaidContent ? (
            <pre className="text-[10px] text-[#b026ff] whitespace-pre-wrap font-mono overflow-x-auto max-h-[300px] overflow-y-auto custom-scrollbar">
              {mermaidContent}
            </pre>
          ) : (
            <pre className="text-[10px] text-text-dim whitespace-pre-wrap font-mono overflow-x-auto max-h-[300px] overflow-y-auto custom-scrollbar">
              {advancedData ? JSON.stringify(advancedData.data, null, 2) : 'Run an advanced action to inspect raw m1nd output.'}
            </pre>
          )}
        </div>
        {(advancedData?.projection || readiness?.projection) && (
          <div className="bg-surface/60 border border-border-subtle rounded p-3">
            <div className="text-[10px] uppercase tracking-widest text-text-dim mb-2">Projection Runtime</div>
            <div className="text-[10px] font-mono text-text-main break-all">{(advancedData?.projection || readiness?.projection)?.runtimeDir}</div>
            <div className="text-[10px] text-text-dim mt-1">
              {(advancedData?.projection || readiness?.projection)?.prepared ? 'Prepared for m1nd' : 'Projection not prepared'}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ x: 400 }}
      animate={{ x: 0 }}
      exit={{ x: 400 }}
      className="w-[380px] border-l border-border-subtle bg-[rgba(16,18,24,0.95)] backdrop-blur-md flex flex-col z-30 shadow-[-10px_0_30px_rgba(0,0,0,0.5)]"
    >
      <div className="h-[60px] border-b border-border-subtle flex items-center justify-between px-4 shrink-0">
        <div className="font-bold text-accent tracking-widest text-sm flex items-center gap-2">
          <Activity size={16} />
          {appMode === 'm1nd' ? 'M1ND COCKPIT' : 'PROPERTIES'}
        </div>
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-sm ${isConnected ? 'bg-[#50fa7b] shadow-[0_0_6px_#50fa7b]' : 'bg-[#ffcb6b]'}`} title={isConnected ? 'm1nd: connected' : 'm1nd: offline'} />
          <button onClick={closeRightPanel} className="text-text-dim hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {appMode === 'architect' ? (
          selectedNode ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-white font-bold text-lg mb-1">{selectedNode.label}</h3>
                <div className="text-xs text-accent uppercase tracking-wider mb-3">{selectedNode.type}</div>
                <p className="text-sm text-text-dim leading-relaxed">{selectedNode.description}</p>
              </div>
              <div className="border-t border-border-subtle pt-4">
                <h4 className="text-xs font-bold text-text-dim uppercase tracking-widest mb-3">Data Contract</h4>
                <div className="bg-[#1a1f2b] border border-border-subtle p-3 rounded-md text-xs text-text-main font-mono">
                  {selectedNode.data_contract || 'No data contract defined.'}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-text-dim text-sm text-center">
              Select a node to view details
            </div>
          )
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {([
                { id: 'ready' as PanelTab, Icon: CheckSquare, label: 'Ready' },
                { id: 'impact' as PanelTab, Icon: Target, label: 'Impact' },
                { id: 'gaps' as PanelTab, Icon: AlertTriangle, label: 'Gaps' },
                { id: 'research' as PanelTab, Icon: Search, label: 'Grounding' },
                { id: 'advanced' as PanelTab, Icon: Shield, label: 'Advanced' },
              ]).map(({ id, Icon, label }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded text-[10px] uppercase tracking-widest font-bold transition-colors ${
                    tab === id
                      ? 'bg-accent/10 border border-accent/30 text-accent'
                      : 'bg-surface/60 border border-border-subtle text-text-dim hover:text-text-main'
                  }`}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>

            {tab === 'ready' && renderReadiness()}
            {tab === 'impact' && renderImpact()}
            {tab === 'gaps' && renderGaps()}
            {tab === 'research' && renderResearch()}
            {tab === 'advanced' && renderAdvanced()}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function GapSection({
  title,
  entries,
  accent,
}: {
  title: string;
  entries: Array<{ id: string; label: string; priority: number }>;
  accent: string;
}) {
  return (
    <div>
      <div className={`text-[10px] uppercase tracking-widest mb-2 ${accent}`}>{title}</div>
      {entries.length === 0 ? (
        <div className="text-[11px] text-text-dim">Nothing flagged here.</div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="bg-surface/60 border border-border-subtle rounded px-3 py-2 flex items-center justify-between">
              <span className="text-[11px] text-text-main">{entry.label}</span>
              <span className="text-[10px] font-mono text-accent">P{entry.priority}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
