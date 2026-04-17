import React, { useState, useMemo } from 'react';
import { useGraphStore } from '../store/useGraphStore';
import type { NodeData, KompletusResult, SpecularAuditResult, UserMoment, NodeScreenEntry } from '../lib/api';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Check, AlertTriangle, ChevronDown, ChevronRight,
  Shield, Database, Globe, Monitor, Server, Zap,
  FileText, Code, Search, Loader2, Edit3, Save,
  Eye, Layout,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Helpers ──────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, React.ReactNode> = {
  frontend: <Monitor size={14} />,
  backend: <Server size={14} />,
  database: <Database size={14} />,
  external: <Globe size={14} />,
  security: <Shield size={14} />,
};

const TYPE_COLORS: Record<string, string> = {
  frontend: '#50fa7b',
  backend: '#00f2ff',
  database: '#ff79c6',
  external: '#ffcb6b',
  security: '#ff5c7a',
};

const STAGE_LABELS: Record<string, string> = {
  konstruktor: '🔨 KONSTRUKTOR',
  hardener: '🔁 HARDENER',
  triage: '🔬 SMART TRIAGE',
  research: '📚 DEEP RESEARCH',
  specular: '🪞 SPECULAR',
  l1ght: '💡 L1GHT PRE-FLIGHT',
  quality: '✅ QUALITY GATE',
  complete: '🎯 KOMPLETUS',
};

// ─── Node Card (editable) ─────────────────────────────────────────────

function NodeCard({ node, research, onUpdate }: {
  node: NodeData;
  research?: { report: string; meta: Record<string, unknown> };
  onUpdate: (id: string, updates: Partial<NodeData>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDC, setEditDC] = useState(node.data_contract || '');
  const [editEH, setEditEH] = useState((node.error_handling || []).join('\n'));
  const [editAC, setEditAC] = useState((node.acceptance_criteria || []).join('\n'));
  const [showResearch, setShowResearch] = useState(false);

  const handleSave = () => {
    onUpdate(node.id, {
      data_contract: editDC,
      error_handling: editEH.split('\n').filter(l => l.trim()),
      acceptance_criteria: editAC.split('\n').filter(l => l.trim()),
    });
    setEditing(false);
    toast.success(`${node.label} updated`);
  };

  const color = TYPE_COLORS[node.type] || '#888';

  return (
    <div className="bg-[#0c0e14] border border-border-subtle rounded-lg overflow-hidden hover:border-accent/30 transition-colors">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left"
      >
        <span style={{ color }}>{TYPE_ICONS[node.type] || <Zap size={14} />}</span>
        <span className="text-sm font-bold text-text-main flex-1">{node.label}</span>
        <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded" style={{ background: `${color}20`, color }}>
          {node.type}
        </span>
        <span className="text-[9px] text-text-dim">P{node.priority}</span>
        {research && <span title="Research available"><Search size={12} className="text-accent" /></span>}
        {expanded ? <ChevronDown size={14} className="text-text-dim" /> : <ChevronRight size={14} className="text-text-dim" />}
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border-subtle overflow-hidden"
          >
            <div className="p-4 space-y-3">
              {/* Description */}
              <div>
                <div className="text-[9px] uppercase tracking-widest text-text-dim mb-1">Description</div>
                <div className="text-xs text-text-main leading-relaxed">{node.description}</div>
              </div>

              {/* Data Contract */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] uppercase tracking-widest text-text-dim">Data Contract</span>
                  {!editing && (
                    <button onClick={() => setEditing(true)} className="text-accent hover:text-white">
                      <Edit3 size={10} />
                    </button>
                  )}
                </div>
                {editing ? (
                  <textarea
                    value={editDC}
                    onChange={(e) => setEditDC(e.target.value)}
                    className="w-full bg-bg border border-accent/30 rounded px-2 py-1.5 text-xs text-text-main font-mono outline-none resize-none"
                    rows={2}
                  />
                ) : (
                  <div className="text-xs text-accent font-mono bg-bg/50 rounded px-2 py-1.5">{node.data_contract || '—'}</div>
                )}
              </div>

              {/* Acceptance Criteria */}
              <div>
                <div className="text-[9px] uppercase tracking-widest text-text-dim mb-1">Acceptance Criteria ({node.acceptance_criteria?.length || 0})</div>
                {editing ? (
                  <textarea
                    value={editAC}
                    onChange={(e) => setEditAC(e.target.value)}
                    className="w-full bg-bg border border-accent/30 rounded px-2 py-1.5 text-xs text-text-main font-mono outline-none resize-none"
                    rows={3}
                    placeholder="One criterion per line"
                  />
                ) : (
                  <ul className="space-y-1">
                    {(node.acceptance_criteria || []).map((ac, i) => (
                      <li key={i} className="text-xs text-text-main flex items-start gap-1.5">
                        <Check size={10} className="text-[#50fa7b] mt-0.5 shrink-0" />
                        <span>{ac}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Error Handling */}
              <div>
                <div className="text-[9px] uppercase tracking-widest text-text-dim mb-1">Error Handling ({node.error_handling?.length || 0})</div>
                {editing ? (
                  <textarea
                    value={editEH}
                    onChange={(e) => setEditEH(e.target.value)}
                    className="w-full bg-bg border border-accent/30 rounded px-2 py-1.5 text-xs text-text-main font-mono outline-none resize-none"
                    rows={3}
                    placeholder="One strategy per line"
                  />
                ) : (
                  <ul className="space-y-1">
                    {(node.error_handling || []).map((eh, i) => (
                      <li key={i} className="text-xs text-text-main flex items-start gap-1.5">
                        <AlertTriangle size={10} className="text-[#ffcb6b] mt-0.5 shrink-0" />
                        <span>{eh}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Edit controls */}
              {editing && (
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    className="px-3 py-1.5 bg-accent text-bg rounded text-[10px] uppercase tracking-widest font-bold flex items-center gap-1.5 hover:bg-white transition-colors"
                  >
                    <Save size={10} /> Save
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="px-3 py-1.5 border border-border-subtle rounded text-[10px] uppercase tracking-widest text-text-dim hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Research toggle */}
              {research && (
                <div>
                  <button
                    onClick={() => setShowResearch(!showResearch)}
                    className="text-[10px] uppercase tracking-widest text-accent flex items-center gap-1.5 hover:text-white transition-colors"
                  >
                    <Search size={10} />
                    {showResearch ? 'Hide Research' : 'Show Research Report'}
                  </button>
                  {showResearch && (
                    <div className="mt-2 bg-bg/80 border border-accent/10 rounded p-3 max-h-[300px] overflow-y-auto">
                      <pre className="text-[11px] text-text-dim whitespace-pre-wrap font-mono leading-relaxed">
                        {research.report.substring(0, 3000)}
                        {research.report.length > 3000 && '\n\n... (truncated)'}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Decision Rationale */}
              {node.decision_rationale && (
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-text-dim mb-1">Decision Rationale</div>
                  <div className="text-xs text-text-dim italic">{node.decision_rationale}</div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Pipeline Progress ────────────────────────────────────────────────

function PipelineProgress({ events }: { events: Array<{ stage: string; status: string; message?: string }> }) {
  const stages = ['konstruktor', 'hardener', 'triage', 'research', 'specular', 'l1ght', 'quality', 'complete'];
  const completedStages = new Set(events.filter(e => e.status === 'done').map(e => e.stage));
  const runningStage = events.filter(e => e.status === 'running').pop()?.stage;

  return (
    <div className="flex items-center gap-1 px-4 py-3 bg-[#060810] border-b border-border-subtle overflow-x-auto">
      {stages.map((stage, i) => {
        const isDone = completedStages.has(stage);
        const isRunning = runningStage === stage;
        return (
          <React.Fragment key={stage}>
            {i > 0 && <div className="w-4 h-px bg-border-subtle shrink-0" />}
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold shrink-0 transition-all ${
              isDone ? 'bg-[#50fa7b]/10 text-[#50fa7b]' :
              isRunning ? 'bg-accent/10 text-accent animate-pulse' :
              'text-text-dim'
            }`}>
              {isDone ? <Check size={10} /> : isRunning ? <Loader2 size={10} className="animate-spin" /> : null}
              {STAGE_LABELS[stage] || stage}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Artifacts Panel ──────────────────────────────────────────────────

function ArtifactsPanel({ l1ght }: { l1ght: KompletusResult['l1ght'] }) {
  const [activeTab, setActiveTab] = useState<'routes' | 'env' | 'db'>('routes');
  const tabs = [
    { key: 'routes' as const, label: 'Route Map', icon: <Globe size={12} />, content: l1ght.artifacts.routeMap },
    { key: 'env' as const, label: '.env Template', icon: <FileText size={12} />, content: l1ght.artifacts.envTemplate },
    { key: 'db' as const, label: 'DB Schema', icon: <Database size={12} />, content: l1ght.artifacts.dbSchema },
  ].filter(t => t.content);

  if (tabs.length === 0) return null;

  return (
    <div className="bg-[#0c0e14] border border-border-subtle rounded-lg overflow-hidden">
      <div className="flex items-center gap-1 border-b border-border-subtle px-3 py-2">
        <Code size={12} className="text-accent" />
        <span className="text-[10px] uppercase tracking-widest font-bold text-accent">L1GHT Artifacts</span>
      </div>
      <div className="flex border-b border-border-subtle">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-2 text-[10px] uppercase tracking-widest flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-accent text-accent'
                : 'border-transparent text-text-dim hover:text-white'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>
      <div className="p-3 max-h-[300px] overflow-y-auto">
        <pre className="text-[11px] text-text-main font-mono whitespace-pre-wrap leading-relaxed">
          {tabs.find(t => t.key === activeTab)?.content || 'No content'}
        </pre>
      </div>
    </div>
  );
}

// ─── SPECULAR View ────────────────────────────────────────────────────

const SCREEN_ICONS: Record<string, React.ReactNode> = {
  dashboard: <Layout size={12} />,
  form: <Edit3 size={12} />,
  list: <FileText size={12} />,
  calendar: <Globe size={12} />,
  chat: <Server size={12} />,
  detail: <Eye size={12} />,
  wizard: <Zap size={12} />,
};

function ParityGauge({ score }: { score: number }) {
  const color = score >= 80 ? '#50fa7b' : score >= 50 ? '#ffcb6b' : '#ff5c7a';
  return (
    <div className="flex items-center gap-4">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1a1e2e" strokeWidth="2.5" />
          <circle
            cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="2.5"
            strokeDasharray={`${score} ${100 - score}`}
            strokeLinecap="round"
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold" style={{ color }}>{score}</span>
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-text-dim">Parity Score</div>
        <div className="text-sm font-bold" style={{ color }}>
          {score >= 80 ? 'Strong Coverage' : score >= 50 ? 'Partial Coverage' : 'Needs Attention'}
        </div>
      </div>
    </div>
  );
}

function SpecularView({ specular }: { specular: SpecularAuditResult }) {
  const screensNeeded = specular.nodeScreenMap.filter(n => n.hasUserSurface).length;
  const backendOnly = specular.nodeScreenMap.filter(n => !n.hasUserSurface).length;

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header with Parity Score */}
      <div className="bg-[#0c0e14] border border-border-subtle rounded-lg p-5 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Eye size={16} className="text-accent" />
            <span className="text-[11px] uppercase tracking-widest font-bold text-accent">SPECULAR PARITY AUDIT</span>
          </div>
          <div className="text-xs text-text-dim">
            {specular.moments.length} user moments · {screensNeeded} screens needed · {backendOnly} backend-only
          </div>
        </div>
        <ParityGauge score={specular.parityScore} />
      </div>

      {/* User Moments */}
      <div className="bg-[#0c0e14] border border-border-subtle rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle flex items-center gap-2">
          <Zap size={12} className="text-accent" />
          <span className="text-[10px] uppercase tracking-widest font-bold text-accent">User Moments</span>
          <span className="text-[9px] text-text-dim ml-auto">What the user experiences</span>
        </div>
        <div className="p-4 space-y-3">
          {specular.moments.map((moment, i) => (
            <motion.div
              key={moment.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-bg/50 border border-border-subtle rounded-lg p-4 hover:border-accent/30 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-accent text-[10px] font-bold shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-text-main mb-1">{moment.label}</div>
                  <div className="text-xs text-text-dim italic mb-2">"{moment.userQuestion}"</div>
                  <div className="flex flex-wrap gap-1.5">
                    {moment.backendStages.map(stage => (
                      <span
                        key={stage}
                        className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded bg-accent/10 text-accent font-mono"
                      >
                        ← {stage}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Node Screen Map */}
      <div className="bg-[#0c0e14] border border-border-subtle rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle flex items-center gap-2">
          <Monitor size={12} className="text-accent" />
          <span className="text-[10px] uppercase tracking-widest font-bold text-accent">Node UIX Surface Map</span>
          <span className="text-[9px] text-text-dim ml-auto">Per-module screen assignment</span>
        </div>
        <div className="divide-y divide-border-subtle">
          {specular.nodeScreenMap.map(entry => (
            <div
              key={entry.nodeId}
              className={`px-4 py-3 flex items-center gap-3 ${entry.hasUserSurface ? 'hover:bg-accent/5' : 'opacity-60'} transition-colors`}
            >
              <div className={`w-5 h-5 rounded flex items-center justify-center text-[10px] ${
                entry.hasUserSurface ? 'bg-[#50fa7b]/10 text-[#50fa7b]' : 'bg-bg text-text-dim'
              }`}>
                {entry.hasUserSurface ? <Check size={10} /> : '—'}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold text-text-main">{entry.label}</span>
                {entry.screenType && (
                  <span className="ml-2 text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-accent/10 text-accent inline-flex items-center gap-1">
                    {SCREEN_ICONS[entry.screenType] || <Layout size={10} />}
                    {entry.screenType}
                  </span>
                )}
              </div>
              {entry.userActions && entry.userActions.length > 0 && (
                <div className="flex gap-1">
                  {entry.userActions.slice(0, 3).map(action => (
                    <span key={action} className="text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded border border-border-subtle text-text-dim">
                      {action}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Coverage Matrix */}
      {specular.coverage.length > 0 && (
        <div className="bg-[#0c0e14] border border-border-subtle rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border-subtle flex items-center gap-2">
            <Shield size={12} className="text-accent" />
            <span className="text-[10px] uppercase tracking-widest font-bold text-accent">Coverage Matrix</span>
          </div>
          <div className="p-3">
            <div className="grid grid-cols-3 gap-2 text-[9px] uppercase tracking-widest text-text-dim mb-2 px-2">
              <span>Backend Phase</span>
              <span>User Moment</span>
              <span className="text-right">Confidence</span>
            </div>
            {specular.coverage.map((entry, i) => (
              <div key={i} className="grid grid-cols-3 gap-2 px-2 py-1.5 hover:bg-bg/50 rounded text-xs">
                <span className="text-accent font-mono">{entry.backendPhase}</span>
                <span className="text-text-main">{entry.momentLabel}</span>
                <span className="text-right">
                  <span className={`font-mono ${entry.confidence >= 0.8 ? 'text-[#50fa7b]' : entry.confidence >= 0.5 ? 'text-[#ffcb6b]' : 'text-[#ff5c7a]'}`}>
                    {Math.round(entry.confidence * 100)}%
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Report Modal ────────────────────────────────────────────────

export default function KompletusReport() {
  const {
    showKompletusReport,
    kompletusResult,
    kompletusProgress,
    closeKompletusReport,
    updateKompletusNode,
    setGraphData,
    setManifesto,
    setArchitecture,
  } = useGraphStore();

  const [activeView, setActiveView] = useState<'modules' | 'artifacts' | 'specular' | 'summary'>('modules');

  const result = kompletusResult;

  const stats = useMemo(() => {
    if (!result) return null;
    const nodes = result.graph.nodes;
    return {
      total: nodes.length,
      withResearch: Object.keys(result.research).length,
      types: Object.keys(TYPE_COLORS).reduce((acc, t) => {
        acc[t] = nodes.filter(n => n.type === t).length;
        return acc;
      }, {} as Record<string, number>),
      ehTotal: nodes.reduce((sum, n) => sum + (n.error_handling?.length || 0), 0),
      acTotal: nodes.reduce((sum, n) => sum + (n.acceptance_criteria?.length || 0), 0),
      totalTimeS: (result.meta.totalTimeMs / 1000).toFixed(1),
    };
  }, [result]);

  if (!showKompletusReport || !result) return null;

  const handleAcceptAndContinue = () => {
    setGraphData(result.graph);
    setManifesto(result.manifesto);
    setArchitecture(result.architecture);
    closeKompletusReport();
    toast.success(`KOMPLETUS blueprint applied: ${result.graph.nodes.length} modules ready for OMX`);
  };

  return (
    <div className="fixed inset-0 z-[200] bg-bg/95 backdrop-blur-xl flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border-subtle bg-[#060810]">
        <div className="flex items-center gap-3">
          <div className="text-accent font-bold text-sm tracking-wide">⚡ KOMPLETUS REPORT</div>
          {result.qualityGate.passed ? (
            <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded bg-[#50fa7b]/10 text-[#50fa7b] font-bold">
              ✓ Quality Gate Passed
            </span>
          ) : (
            <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded bg-[#ffcb6b]/10 text-[#ffcb6b] font-bold">
              ⚠ {result.qualityGate.remainingIssues.length} issues
            </span>
          )}
          {stats && (
            <span className="text-[10px] text-text-dim">
              {stats.total} modules · {stats.withResearch} researched · {stats.ehTotal} EH · {stats.acTotal} AC · {stats.totalTimeS}s
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleAcceptAndContinue}
            className="px-4 py-2 bg-accent text-bg rounded text-[11px] uppercase tracking-widest font-bold hover:bg-white transition-colors flex items-center gap-2"
          >
            <Check size={14} /> Accept & Continue to OMX
          </button>
          <button onClick={closeKompletusReport} className="text-text-dim hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Pipeline progress bar */}
      <PipelineProgress events={kompletusProgress} />

      {/* View tabs */}
      <div className="flex items-center gap-1 px-6 py-2 border-b border-border-subtle bg-[#080a10]">
        {(['modules', 'artifacts', 'specular', 'summary'] as const).map(view => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            className={`px-3 py-1.5 rounded text-[10px] uppercase tracking-widest font-bold transition-colors ${
              activeView === view
                ? 'bg-accent/10 text-accent'
                : 'text-text-dim hover:text-white'
            }`}
          >
            {view === 'modules' && <Server size={10} className="inline mr-1.5" />}
            {view === 'artifacts' && <Code size={10} className="inline mr-1.5" />}
            {view === 'specular' && <Eye size={10} className="inline mr-1.5" />}
            {view === 'summary' && <FileText size={10} className="inline mr-1.5" />}
            {view}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeView === 'modules' && (
          <div className="max-w-5xl mx-auto space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-text-dim mb-3">
              {result.graph.nodes.length} Modules — Click to expand · Click ✏️ to edit fields
            </div>
            {result.graph.nodes
              .sort((a, b) => (a.priority || 0) - (b.priority || 0))
              .map(node => (
                <NodeCard
                  key={node.id}
                  node={node}
                  research={result.research[node.id]}
                  onUpdate={updateKompletusNode}
                />
              ))}
          </div>
        )}

        {activeView === 'artifacts' && (
          <div className="max-w-5xl mx-auto space-y-4">
            <ArtifactsPanel l1ght={result.l1ght} />

            {/* Quality Gate */}
            <div className="bg-[#0c0e14] border border-border-subtle rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Shield size={14} className={result.qualityGate.passed ? 'text-[#50fa7b]' : 'text-[#ffcb6b]'} />
                <span className="text-[10px] uppercase tracking-widest font-bold text-text-main">
                  Quality Gate ({result.qualityGate.iterations} iteration{result.qualityGate.iterations !== 1 ? 's' : ''})
                </span>
              </div>
              {result.qualityGate.passed ? (
                <div className="text-xs text-[#50fa7b]">✓ All checks passed. Blueprint is ready for autonomous construction.</div>
              ) : (
                <div className="space-y-1">
                  {result.qualityGate.remainingIssues.map((issue, i) => (
                    <div key={i} className="text-xs text-[#ffcb6b] flex items-start gap-1.5">
                      <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                      <span>{issue}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Stage Timings */}
            <div className="bg-[#0c0e14] border border-border-subtle rounded-lg p-4">
              <div className="text-[10px] uppercase tracking-widest font-bold text-accent mb-2">Pipeline Timing</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(result.meta.stages).map(([stage, data]) => (
                  <div key={stage} className="bg-bg/50 rounded px-3 py-2">
                    <div className="text-[9px] uppercase tracking-widest text-text-dim">{stage}</div>
                    <div className="text-sm text-text-main font-mono">{(data.durationMs / 1000).toFixed(1)}s</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeView === 'specular' && result.specular && (
          <SpecularView specular={result.specular} />
        )}

        {activeView === 'summary' && (
          <div className="max-w-3xl mx-auto space-y-4">
            {/* Explanation */}
            <div className="bg-[#0c0e14] border border-border-subtle rounded-lg p-4">
              <div className="text-[10px] uppercase tracking-widest font-bold text-accent mb-2">Architecture Explanation</div>
              <div className="text-sm text-text-main leading-relaxed whitespace-pre-wrap">{result.explanation}</div>
            </div>

            {/* Manifesto */}
            <div className="bg-[#0c0e14] border border-border-subtle rounded-lg p-4">
              <div className="text-[10px] uppercase tracking-widest font-bold text-accent mb-2">Manifesto</div>
              <div className="text-sm text-text-main leading-relaxed whitespace-pre-wrap">{result.manifesto}</div>
            </div>

            {/* Architecture */}
            <div className="bg-[#0c0e14] border border-border-subtle rounded-lg p-4">
              <div className="text-[10px] uppercase tracking-widest font-bold text-accent mb-2">Architecture</div>
              <pre className="text-xs text-text-main font-mono whitespace-pre-wrap leading-relaxed">{result.architecture}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
