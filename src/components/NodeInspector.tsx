/**
 * NodeInspector.tsx
 * Full SSOT node editor — slides in from the right as a 420px drawer.
 * Tabs: CORE | SPEC | RATIONALE | GROUNDING | CONNECTIONS
 *
 * All edits call updateNode() on blur/save — no separate "submit".
 */
import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, ChevronRight, Layout, Server, Database, Shield, Globe,
  CheckCircle2, AlertTriangle, FileText, FlaskConical,
  Network, Plus, Trash2, Save,
} from 'lucide-react';
import { useGraphStore } from '../store/useGraphStore';
import type { NodeData } from '../lib/api';
import ConnectionSuggester from './ConnectionSuggester';

// ─── Tab types ────────────────────────────────────────────────────────────────

type InspectorTab = 'core' | 'spec' | 'rationale' | 'grounding' | 'connections';

const TABS: { id: InspectorTab; label: string; icon: React.ReactNode }[] = [
  { id: 'core',        label: 'Core',        icon: <Server size={10} />       },
  { id: 'spec',        label: 'Spec',        icon: <CheckCircle2 size={10} /> },
  { id: 'rationale',   label: 'Rationale',   icon: <FileText size={10} />     },
  { id: 'grounding',   label: 'Grounding',   icon: <FlaskConical size={10} /> },
  { id: 'connections', label: 'Connections', icon: <Network size={10} />      },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_TYPES: NodeData['type'][] = ['frontend', 'backend', 'database', 'security', 'external'];
const STATUS_CYCLE: NodeData['status'][] = ['pending', 'in-progress', 'completed'];

const TYPE_META: Record<string, { color: string; Icon: typeof Server; label: string }> = {
  frontend: { color: '#00f2ff', Icon: Layout,   label: 'Frontend'  },
  backend:  { color: '#b026ff', Icon: Server,   label: 'Backend'   },
  database: { color: '#ff9d00', Icon: Database, label: 'Database'  },
  security: { color: '#ff003c', Icon: Shield,   label: 'Security'  },
  external: { color: '#00ff66', Icon: Globe,    label: 'External'  },
};

const STATUS_META = {
  pending:       { label: 'Pending',     color: '#94a3b8' },
  'in-progress': { label: 'In Progress', color: '#00f2ff' },
  completed:     { label: 'Done',        color: '#50fa7b' },
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function NodeInspector() {
  const inspectorNodeId = useGraphStore((s) => s.inspectorNodeId);
  const closeInspector  = useGraphStore((s) => s.closeInspector);
  const graphData       = useGraphStore((s) => s.graphData);
  const updateNode      = useGraphStore((s) => s.updateNode);
  const removeLink      = useGraphStore((s) => s.removeLink);

  const node = graphData.nodes.find((n) => n.id === inspectorNodeId) ?? null;

  const [tab, setTab] = useState<InspectorTab>('core');
  const [showSuggester, setShowSuggester] = useState(false);

  // Reset to core tab when node changes
  useEffect(() => { setTab('core'); setShowSuggester(false); }, [inspectorNodeId]);

  // Global keyboard shortcuts
  useEffect(() => {
    if (!inspectorNodeId) return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'c') {
        e.preventDefault();
        setTab('connections');
        setShowSuggester(true);
      }
      if (e.key === 'Escape') closeInspector();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inspectorNodeId, closeInspector]);

  useEffect(() => {
    if (inspectorNodeId && !node) closeInspector();
  }, [inspectorNodeId, node, closeInspector]);

  const typeColor = node ? (TYPE_META[node.type]?.color ?? '#94a3b8') : '#94a3b8';

  const outgoing = node
    ? graphData.links.filter((l) => l.source === node.id)
          .map((l) => ({ link: l, target: graphData.nodes.find((n) => n.id === l.target) }))
          .filter((x) => x.target)
    : [];

  const incoming = node
    ? graphData.links.filter((l) => l.target === node.id)
          .map((l) => ({ link: l, source: graphData.nodes.find((n) => n.id === l.source) }))
          .filter((x) => x.source)
    : [];

  return (
    <AnimatePresence>
      {node && (
        <>
          <motion.div
            key="inspector-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[85]"
            onClick={closeInspector}
          />

          <motion.div
            key="inspector-drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed top-0 right-0 h-full w-[420px] z-[90] flex flex-col bg-[#070910] border-l shadow-[-8px_0_40px_rgba(0,0,0,0.5)]"
            style={{ borderColor: `${typeColor}22` }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b shrink-0"
              style={{ borderColor: `${typeColor}22` }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: typeColor, boxShadow: `0 0 8px ${typeColor}` }}
                />
                <ChevronRight size={12} className="text-text-dim shrink-0" />
                <span className="text-[11px] font-bold text-text-main truncate">
                  {node.label}
                </span>
                <span
                  className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0"
                  style={{ color: typeColor, borderColor: `${typeColor}44`, background: `${typeColor}12` }}
                >
                  {node.type}
                </span>
              </div>
              <button
                onClick={closeInspector}
                className="text-text-dim hover:text-text-main transition-colors p-1 rounded hover:bg-white/5 shrink-0"
              >
                <X size={14} />
              </button>
            </div>

            {/* Tab bar */}
            <div className="flex border-b shrink-0" style={{ borderColor: `${typeColor}15` }}>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="flex items-center gap-1 px-2 py-2.5 text-[7.5px] uppercase tracking-wider font-bold transition-colors flex-1 justify-center border-b-2"
                  style={{
                    color: tab === t.id ? typeColor : '#4a5568',
                    borderBottomColor: tab === t.id ? typeColor : 'transparent',
                  }}
                >
                  {t.icon}
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div
              className="flex-1 overflow-y-auto"
              style={{ scrollbarWidth: 'thin', scrollbarColor: `${typeColor}20 transparent` }}
            >
              {tab === 'core'        && <CoreTab        node={node} updateNode={updateNode} typeColor={typeColor} />}
              {tab === 'spec'        && <SpecTab        node={node} updateNode={updateNode} typeColor={typeColor} />}
              {tab === 'rationale'   && <RationaleTab   node={node} updateNode={updateNode} />}
              {tab === 'grounding'   && <GroundingTab   node={node} updateNode={updateNode} typeColor={typeColor} />}
              {tab === 'connections' && (
                <ConnectionsTab
                  node={node}
                  outgoing={outgoing as any}
                  incoming={incoming as any}
                  removeLink={removeLink}
                  showSuggester={showSuggester}
                  setShowSuggester={setShowSuggester}
                  typeColor={typeColor}
                />
              )}
            </div>

            {/* Footer accent */}
            <div
              className="h-[2px] w-full shrink-0"
              style={{ background: `linear-gradient(90deg, transparent, ${typeColor}40, transparent)` }}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── CORE Tab ─────────────────────────────────────────────────────────────────

function CoreTab({
  node, updateNode, typeColor,
}: {
  node: NodeData;
  updateNode: (id: string, u: Partial<NodeData>) => void;
  typeColor: string;
}) {
  return (
    <div className="p-4 space-y-4">
      <Field label="Label">
        <input
          key={node.id + '-label'}
          defaultValue={node.label}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== node.label) updateNode(node.id, { label: v });
          }}
          className="inspector-input"
        />
      </Field>

      <Field label="Type">
        <div className="flex flex-wrap gap-1.5">
          {NODE_TYPES.map((t) => {
            const m = TYPE_META[t];
            const Icon = m.Icon;
            const active = node.type === t;
            return (
              <button
                key={t}
                onClick={() => updateNode(node.id, { type: t })}
                className="flex items-center gap-1 px-2 py-1 rounded-[6px] border text-[9px] font-medium uppercase tracking-wider transition-all"
                style={{
                  color: active ? m.color : '#4a5568',
                  borderColor: active ? m.color : 'rgba(255,255,255,0.08)',
                  background: active ? `${m.color}15` : 'transparent',
                }}
              >
                <Icon size={9} /> {m.label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Status">
        <div className="flex gap-1.5">
          {STATUS_CYCLE.map((s) => {
            const m = STATUS_META[s];
            const active = node.status === s;
            return (
              <button
                key={s}
                onClick={() => updateNode(node.id, { status: s })}
                className="px-2.5 py-1 rounded-[6px] border text-[9px] font-medium uppercase tracking-wider transition-all"
                style={{
                  color: active ? m.color : '#4a5568',
                  borderColor: active ? m.color : 'rgba(255,255,255,0.08)',
                  background: active ? `${m.color}15` : 'transparent',
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Priority">
        <div className="flex gap-1.5">
          {[1, 2, 3].map((p) => (
            <button
              key={p}
              onClick={() => updateNode(node.id, { priority: p })}
              className="w-8 h-8 rounded-[6px] border text-[10px] font-bold transition-all"
              style={{
                color: node.priority === p ? typeColor : '#4a5568',
                borderColor: node.priority === p ? typeColor : 'rgba(255,255,255,0.08)',
                background: node.priority === p ? `${typeColor}15` : 'transparent',
              }}
            >
              P{p}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Description">
        <textarea
          key={node.id + '-desc'}
          defaultValue={node.description}
          onBlur={(e) => {
            if (e.target.value !== node.description)
              updateNode(node.id, { description: e.target.value });
          }}
          className="inspector-textarea min-h-[80px]"
        />
      </Field>
    </div>
  );
}

// ─── SPEC Tab ─────────────────────────────────────────────────────────────────

function SpecTab({
  node, updateNode, typeColor: _tc,
}: {
  node: NodeData;
  updateNode: (id: string, u: Partial<NodeData>) => void;
  typeColor: string;
}) {
  return (
    <div className="p-4 space-y-5">
      <TagListEditor
        label="Acceptance Criteria"
        icon={<CheckCircle2 size={10} />}
        color="#50fa7b"
        items={node.acceptance_criteria ?? []}
        placeholder="e.g. Returns 200 on valid input"
        onChange={(items) => updateNode(node.id, { acceptance_criteria: items })}
      />
      <TagListEditor
        label="Error Handlers"
        icon={<AlertTriangle size={10} />}
        color="#ffcb6b"
        items={node.error_handling ?? []}
        placeholder="e.g. 429 Rate limit → 503 with retry-after"
        onChange={(items) => updateNode(node.id, { error_handling: items })}
      />
      <Field label="Data Contract">
        <textarea
          key={node.id + '-contract'}
          defaultValue={node.data_contract ?? ''}
          onBlur={(e) => {
            if (e.target.value !== (node.data_contract ?? ''))
              updateNode(node.id, { data_contract: e.target.value });
          }}
          className="inspector-textarea min-h-[100px] font-mono text-[9.5px]"
          placeholder="{ input: T, output: U } or TypeScript interface..."
        />
      </Field>
    </div>
  );
}

// ─── RATIONALE Tab ────────────────────────────────────────────────────────────

function RationaleTab({
  node, updateNode,
}: {
  node: NodeData;
  updateNode: (id: string, u: Partial<NodeData>) => void;
}) {
  return (
    <div className="p-4 space-y-4">
      <Field label="Decision Rationale">
        <textarea
          key={node.id + '-rationale'}
          defaultValue={node.decision_rationale ?? ''}
          onBlur={(e) => {
            if (e.target.value !== (node.decision_rationale ?? ''))
              updateNode(node.id, { decision_rationale: e.target.value });
          }}
          className="inspector-textarea min-h-[120px]"
          placeholder="Why was this module designed this way? What alternatives were considered?"
        />
      </Field>
      <Field label="Construction Notes">
        <textarea
          key={node.id + '-notes'}
          defaultValue={node.constructionNotes ?? ''}
          onBlur={(e) => {
            if (e.target.value !== (node.constructionNotes ?? ''))
              updateNode(node.id, { constructionNotes: e.target.value });
          }}
          className="inspector-textarea min-h-[100px]"
          placeholder="Implementation notes, gotchas, dependencies to be aware of..."
        />
      </Field>
    </div>
  );
}

// ─── GROUNDING Tab ────────────────────────────────────────────────────────────

function GroundingTab({
  node, updateNode, typeColor,
}: {
  node: NodeData;
  updateNode: (id: string, u: Partial<NodeData>) => void;
  typeColor: string;
}) {
  const projectContext = useGraphStore((s) => s.projectContext);
  const [localVal, setLocalVal]       = useState(node.researchContext ?? '');
  const [saved, setSaved]             = useState(false);
  const [researching, setResearching] = useState(false);

  useEffect(() => { setLocalVal(node.researchContext ?? ''); }, [node.id, node.researchContext]);

  function handleSave() {
    updateNode(node.id, { researchContext: localVal });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  async function handleDeepResearch() {
    setResearching(true);
    try {
      const { performDeepResearch } = await import('../lib/api');
      const result = await performDeepResearch(node, projectContext);
      setLocalVal(result);
      updateNode(node.id, { researchContext: result });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch {
      // toast handled by caller if needed
    } finally {
      setResearching(false);
    }
  }

  const hasGrounding = Boolean(node.researchContext?.trim());

  return (
    <div className="p-4 space-y-4">
      {/* Deep Research action button */}
      <button
        onClick={handleDeepResearch}
        disabled={researching}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[8px] border text-[9px] font-bold uppercase tracking-wider transition-all disabled:opacity-60"
        style={{
          color: '#b026ff',
          borderColor: researching ? '#b026ff66' : '#b026ff44',
          background: researching ? '#b026ff18' : '#b026ff10',
        }}
      >
        {researching ? (
          <>
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#b026ff] animate-pulse" />
            Grounding in progress…
          </>
        ) : (
          <>
            <FlaskConical size={11} />
            Run Deep Research
          </>
        )}
      </button>

      {!hasGrounding && !researching && (
        <div className="px-3 py-2.5 bg-[#b026ff]/8 border border-[#b026ff]/20 rounded-[8px] text-[9.5px] text-[#b026ff]/70 text-center leading-relaxed">
          No deep grounding yet. Click above to auto-research, or paste notes manually.
        </div>
      )}

      <Field label="Research Context">
        <textarea
          value={localVal}
          onChange={(e) => setLocalVal(e.target.value)}
          className="inspector-textarea min-h-[240px]"
          placeholder="Technical research, API docs, architecture references..."
          style={{ borderColor: hasGrounding ? '#b026ff44' : undefined }}
        />
      </Field>

      <button
        onClick={handleSave}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border text-[9px] font-bold uppercase tracking-wider transition-all"
        style={{
          color: saved ? '#50fa7b' : typeColor,
          borderColor: saved ? '#50fa7b44' : `${typeColor}44`,
          background: saved ? '#50fa7b12' : `${typeColor}10`,
        }}
      >
        <Save size={10} /> {saved ? 'Saved!' : 'Save Grounding'}
      </button>
    </div>
  );
}

// ─── CONNECTIONS Tab ──────────────────────────────────────────────────────────

function ConnectionsTab({
  node, outgoing, incoming, removeLink, showSuggester, setShowSuggester, typeColor,
}: {
  node: NodeData;
  outgoing: { link: any; target: NodeData }[];
  incoming: { link: any; source: NodeData }[];
  removeLink: (s: string, t: string) => void;
  showSuggester: boolean;
  setShowSuggester: (v: boolean) => void;
  typeColor: string;
}) {
  return (
    <div className="p-4 space-y-4">
      <button
        onClick={() => setShowSuggester(true)}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-[8px] border text-[9px] font-bold uppercase tracking-wider transition-all hover:brightness-125"
        style={{ color: typeColor, borderColor: `${typeColor}44`, background: `${typeColor}10` }}
      >
        <Network size={10} /> Suggest Connections <kbd className="ml-1 text-[7px] opacity-60 border border-current px-1 rounded font-mono">⌘⇧C</kbd>
      </button>

      {showSuggester && (
        <div className="relative z-10">
          <ConnectionSuggester sourceNode={node} onClose={() => setShowSuggester(false)} />
        </div>
      )}

      <section>
        <div className="text-[8px] uppercase tracking-widest text-text-dim mb-2 font-bold">
          Outgoing ({outgoing.length})
        </div>
        {outgoing.length === 0
          ? <div className="text-[9px] text-text-dim italic">No outgoing connections</div>
          : outgoing.map(({ link, target: tgt }) => (
              <EdgeRow key={link.target} nodeLabel={tgt.label} nodeType={tgt.type} edgeLabel={link.label} direction="out" onRemove={() => removeLink(link.source, link.target)} />
            ))}
      </section>

      <section>
        <div className="text-[8px] uppercase tracking-widest text-text-dim mb-2 font-bold">
          Incoming ({incoming.length})
        </div>
        {incoming.length === 0
          ? <div className="text-[9px] text-text-dim italic">No incoming connections</div>
          : incoming.map(({ link, source: src }) => (
              <EdgeRow key={link.source} nodeLabel={src.label} nodeType={src.type} edgeLabel={link.label} direction="in" onRemove={() => removeLink(link.source, link.target)} />
            ))}
      </section>
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  frontend: '#00f2ff', backend: '#b026ff', database: '#ff9d00',
  security: '#ff003c', external: '#00ff66',
};

function EdgeRow({ nodeLabel, nodeType, edgeLabel, direction, onRemove }: {
  nodeLabel: string; nodeType: string; edgeLabel?: string;
  direction: 'in' | 'out'; onRemove: () => void;
}) {
  const c = TYPE_COLOR[nodeType] ?? '#94a3b8';
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 mb-1 bg-white/3 rounded-[6px] border border-white/5 group">
      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c }} />
      <div className="flex-1 min-w-0">
        <div className="text-[9.5px] text-text-main truncate">{nodeLabel}</div>
        {edgeLabel && (
          <div className="text-[8px] text-text-dim italic">{direction === 'out' ? '→' : '←'} {edgeLabel}</div>
        )}
      </div>
      <button onClick={onRemove} className="text-text-dim hover:text-[#ff003c] opacity-0 group-hover:opacity-100 transition-all p-0.5 shrink-0" title="Remove">
        <Trash2 size={10} />
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[8px] uppercase tracking-[0.14em] text-text-dim font-bold">
        {label}
      </label>
      {children}
    </div>
  );
}

function TagListEditor({ label, icon, color, items, placeholder, onChange }: {
  label: string; icon: React.ReactNode; color: string;
  items: string[]; placeholder: string; onChange: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  function addItem() {
    const t = draft.trim();
    if (!t || items.includes(t)) return;
    onChange([...items, t]);
    setDraft('');
  }

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-[8px] uppercase tracking-[0.14em] font-bold" style={{ color }}>
        {icon} {label} <span className="opacity-50 font-normal normal-case">({items.length})</span>
      </label>
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2 px-2 py-1.5 bg-white/3 rounded-[6px] border border-white/5 group">
            <div className="w-1 h-1 rounded-full mt-1.5 shrink-0" style={{ background: color }} />
            <span className="flex-1 text-[9.5px] text-text-main leading-[1.4]">{item}</span>
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-text-dim hover:text-[#ff003c] opacity-0 group-hover:opacity-100 transition-all p-0.5 shrink-0 mt-0.5">
              <X size={9} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
          placeholder={placeholder}
          className="inspector-input flex-1 text-[9.5px]"
        />
        <button
          onClick={addItem}
          className="flex items-center justify-center w-7 h-7 rounded-[6px] border transition-all shrink-0"
          style={{ color, borderColor: `${color}44`, background: `${color}10` }}
          title="Add (Enter)"
        >
          <Plus size={11} />
        </button>
      </div>
    </div>
  );
}
