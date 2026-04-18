import React, { useState, useRef, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeData } from '../lib/api';
import { useGraphStore } from '../store/useGraphStore';
import {
  Database, Layout, Server, Shield, Globe,
  CheckCircle2, AlertTriangle, FileText, FlaskConical,
  Pencil, Check, X, ArrowRight,
} from 'lucide-react';

type CyberNodeData = { data: NodeData; selected?: boolean };

// ─── Status cycle ──────────────────────────────────────────────────────────────

const STATUS_CYCLE: NodeData['status'][] = ['pending', 'in-progress', 'completed'];

const STATUS_META: Record<NodeData['status'], { label: string; tone: string; color: string }> = {
  pending:       { label: 'PENDING', tone: 'rgba(148,163,184,0.12)', color: '#94a3b8' },
  'in-progress': { label: 'ACTIVE',  tone: 'rgba(0,242,255,0.12)',   color: '#00f2ff' },
  completed:     { label: 'DONE',    tone: 'rgba(80,250,123,0.14)',  color: '#50fa7b' },
};

// ─── Type metadata ─────────────────────────────────────────────────────────────

const NODE_TYPES: NodeData['type'][] = ['frontend', 'backend', 'database', 'security', 'external'];

const TYPE_META: Record<string, { color: string; Icon: typeof Server; label: string }> = {
  frontend: { color: '#00f2ff', Icon: Layout,   label: 'Frontend'  },
  backend:  { color: '#b026ff', Icon: Server,   label: 'Backend'   },
  database: { color: '#ff9d00', Icon: Database, label: 'Database'  },
  security: { color: '#ff003c', Icon: Shield,   label: 'Security'  },
  external: { color: '#00ff66', Icon: Globe,    label: 'External'  },
};
const FALLBACK_TYPE = { color: 'var(--color-text-dim)', Icon: Server, label: 'Module' };

// ─── Component ────────────────────────────────────────────────────────────────

export default function CyberNode({ data, selected }: CyberNodeData) {
  const highlightedNodes  = useGraphStore((s) => s.highlightedNodes);
  const highlightSource   = useGraphStore((s) => s.highlightSource);
  const setSelectedNode   = useGraphStore((s) => s.setSelectedNode);
  const openRightPanel    = useGraphStore((s) => s.openRightPanel);
  const updateNode        = useGraphStore((s) => s.updateNode);
  const openInspector     = useGraphStore((s) => (s as any).openInspector as ((id: string) => void) | undefined);

  const isHighlighted = highlightedNodes.has(data.id);
  const isBlastSource = highlightSource === data.id;

  const { color: typeColor, Icon: TypeIcon, label: typeLabel } =
    TYPE_META[data.type ?? ''] ?? FALLBACK_TYPE;

  const statusMeta  = STATUS_META[data.status] ?? STATUS_META.pending;
  const acCount     = data.acceptance_criteria?.length ?? 0;
  const ehCount     = data.error_handling?.length ?? 0;
  const hasContract = Boolean(data.data_contract?.trim());
  const hasResearch = Boolean(data.researchContext?.trim());
  const semanticFooter = [
    data.label.toLowerCase(),
    acCount || ehCount
      ? `${acCount} AC / ${ehCount} EH`
      : hasContract
        ? 'contract defined'
        : hasResearch
          ? 'grounding active'
          : 'grounding missing',
  ].join(' · ');

  // ── Description inline edit ──────────────────────────────────────────────
  const [editingDesc, setEditingDesc] = useState(false);
  const [descText, setDescText]       = useState(data.description ?? '');

  function saveDesc(e: React.SyntheticEvent) {
    e.stopPropagation();
    updateNode(data.id, { description: descText });
    setEditingDesc(false);
  }
  function discardDesc(e: React.SyntheticEvent) {
    e.stopPropagation();
    setDescText(data.description ?? '');
    setEditingDesc(false);
  }

  // ── Label inline edit ────────────────────────────────────────────────────
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelText, setLabelText]       = useState(data.label);
  const labelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editingLabel) labelInputRef.current?.select(); }, [editingLabel]);

  function saveLabel() {
    const trimmed = labelText.trim() || data.label;
    updateNode(data.id, { label: trimmed });
    setLabelText(trimmed);
    setEditingLabel(false);
  }

  // ── Type popover ─────────────────────────────────────────────────────────
  const [typePopoverOpen, setTypePopoverOpen] = useState(false);
  const typePopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!typePopoverOpen) return;
    function handleClick(e: MouseEvent) {
      if (!typePopoverRef.current?.contains(e.target as Node)) setTypePopoverOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [typePopoverOpen]);

  // ── Card style ────────────────────────────────────────────────────────────
  const cardBg = hasResearch ? 'rgba(28, 18, 45, 0.96)' : 'rgba(12, 14, 20, 0.96)';

  let borderColor = selected ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)';
  let boxShadow   = selected
    ? '0 0 0 1px rgba(0,242,255,0.45), 0 0 22px rgba(0,242,255,0.12)'
    : '0 10px 30px rgba(0,0,0,0.32)';

  if (isBlastSource) {
    borderColor = '#ff003c';
    boxShadow   = '0 0 0 1px rgba(255,0,60,0.65), 0 0 28px rgba(255,0,60,0.28)';
  } else if (isHighlighted) {
    borderColor = '#ff9d00';
    boxShadow   = '0 0 0 1px rgba(255,157,0,0.45), 0 0 24px rgba(255,157,0,0.18)';
  }

  return (
    <div
      data-testid="demystifier-card"
      className="group/card relative w-[240px] border rounded-[12px] backdrop-blur-sm transition-all duration-300 overflow-visible"
      style={{ backgroundColor: cardBg, borderColor, boxShadow }}
    >
      {/* ── Badges ──────────────────────────────────────────────────────── */}
      {isBlastSource && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[8px] bg-[#ff003c] text-white px-2 py-0.5 rounded-full uppercase tracking-[0.18em] whitespace-nowrap z-30">
          Blast Origin
        </div>
      )}
      {isHighlighted && !isBlastSource && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[8px] bg-[#ff9d00] text-bg px-2 py-0.5 rounded-full uppercase tracking-[0.18em] whitespace-nowrap z-30">
          Impact Zone
        </div>
      )}

      <Handle
        type="target"
        position={Position.Top}
        className="w-2 h-2 !bg-bg !border-[1.5px] rounded-full"
        style={{ borderColor: typeColor }}
      />

      <div className="p-3 flex flex-col gap-2.5">

        <div className="text-[8px] font-semibold uppercase tracking-[0.24em] text-text-dim/80">
          Demystifier
        </div>

        {/* ── Row 1: Type chip (clickable) + Priority (clickable) + Status (clickable) ── */}
        <div className="flex items-center justify-between gap-1.5">

          {/* Type popover */}
          <div className="relative" ref={typePopoverRef}>
            <button
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-[6px] border text-[9px] font-medium tracking-[0.1em] uppercase hover:brightness-125 transition-all cursor-pointer"
              style={{ color: typeColor, borderColor: `${typeColor}44`, background: `${typeColor}10` }}
              onClick={(e) => { e.stopPropagation(); setTypePopoverOpen((v) => !v); }}
              title="Change node type"
            >
              <TypeIcon size={9} />
              {typeLabel}
            </button>
            {typePopoverOpen && (
              <div
                className="absolute top-full left-0 mt-1 z-[200] bg-[#0d0f16] border border-white/10 rounded-[8px] py-1 shadow-xl min-w-[130px]"
                onClick={(e) => e.stopPropagation()}
              >
                {NODE_TYPES.map((t) => {
                  const m = TYPE_META[t];
                  const TIcon = m.Icon;
                  return (
                    <button
                      key={t}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[9px] uppercase tracking-wider hover:bg-white/5 transition-colors"
                      style={{ color: m.color }}
                      onClick={(e) => {
                        e.stopPropagation();
                        updateNode(data.id, { type: t });
                        setTypePopoverOpen(false);
                      }}
                    >
                      <TIcon size={9} /> {m.label}
                      {data.type === t && <Check size={8} className="ml-auto" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Priority cycling */}
            <button
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-[6px] bg-white/6 text-text-main hover:bg-accent/10 hover:text-accent transition-colors cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                const cur = data.priority ?? 1;
                updateNode(data.id, { priority: cur >= 3 ? 1 : cur + 1 });
              }}
              title="Click to cycle priority"
            >
              P{data.priority ?? 1}
            </button>

            {/* Status cycling */}
            <button
              data-testid="demystifier-status-chip"
              className="text-[8px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-[999px] border hover:brightness-125 transition-all cursor-pointer"
              style={{
                color: statusMeta.color,
                borderColor: `${statusMeta.color}44`,
                background: statusMeta.tone,
              }}
              onClick={(e) => {
                e.stopPropagation();
                const idx = STATUS_CYCLE.indexOf(data.status);
                updateNode(data.id, { status: STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length] });
              }}
              title="Click to cycle status"
            >
              {statusMeta.label}
            </button>
          </div>
        </div>

        {/* ── Row 2: Label (double-click to edit) ─────────────────────────── */}
        <div className="group/label">
          {editingLabel ? (
            <input
              ref={labelInputRef}
              value={labelText}
              onChange={(e) => setLabelText(e.target.value)}
              onBlur={saveLabel}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') saveLabel();
                if (e.key === 'Escape') {
                  setLabelText(data.label);
                  setEditingLabel(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full text-[14px] font-semibold bg-transparent border-b border-accent text-text-main outline-none pb-0.5"
            />
          ) : (
            <h3
              className="text-[14px] leading-[1.2] font-semibold text-text-main cursor-text"
              title="Double-click to edit label"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setLabelText(data.label);
                setEditingLabel(true);
              }}
            >
              {data.label}
            </h3>
          )}

          {/* Description block */}
          <div
            className="group mt-1.5 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {editingDesc ? (
              <div className="flex flex-col gap-1.5">
                <textarea
                  autoFocus
                  value={descText}
                  onChange={(e) => setDescText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') discardDesc(e);
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveDesc(e);
                  }}
                  className="w-full min-h-[72px] resize-none bg-black/40 border border-[#b026ff]/50 rounded-[6px] p-2 text-[10.5px] text-text-main leading-[1.5] outline-none focus:border-[#b026ff] transition-colors"
                  style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(176,38,255,0.3) transparent' }}
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    onClick={discardDesc}
                    className="flex items-center gap-1 px-2 py-1 rounded-[6px] border border-[#ff003c]/40 bg-[#ff003c]/10 text-[#ff003c] text-[9px] font-bold uppercase tracking-wider hover:bg-[#ff003c]/20 hover:border-[#ff003c]/70 transition-colors"
                    title="Discard (Esc)"
                  >
                    <X size={10} /> Discard
                  </button>
                  <button
                    onClick={saveDesc}
                    className="flex items-center gap-1 px-2 py-1 rounded-[6px] border border-[#50fa7b]/40 bg-[#50fa7b]/10 text-[#50fa7b] text-[9px] font-bold uppercase tracking-wider hover:bg-[#50fa7b]/20 hover:border-[#50fa7b]/70 transition-colors"
                    title="Save (⌘↵)"
                  >
                    <Check size={10} /> Save
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="relative p-1.5 bg-black/20 rounded-[6px] border border-white/5 group-hover:border-white/10 transition-colors cursor-text"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setDescText(data.description ?? '');
                  setEditingDesc(true);
                }}
              >
                <p className="text-[10.5px] text-text-dim leading-[1.5] pr-5">
                  {data.description || <span className="italic opacity-40">No description</span>}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDescText(data.description ?? '');
                    setEditingDesc(true);
                  }}
                  className="absolute top-1 right-1 p-0.5 rounded opacity-0 group-hover:opacity-100 text-text-dim hover:text-accent hover:bg-accent/10 transition-all"
                  title="Edit description (or double-click)"
                >
                  <Pencil size={10} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Deep Grounding banner ────────────────────────────────────────── */}
        {hasResearch && (
          <button
            className="w-full flex items-center justify-between px-2 py-1.5 bg-[#b026ff]/10 border border-[#b026ff]/30 rounded-[6px] hover:bg-[#b026ff]/20 hover:border-[#b026ff]/60 transition-colors cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              if (openInspector) {
                openInspector(data.id);
              } else {
                setSelectedNode(data);
                openRightPanel();
              }
            }}
            title="Open Node Inspector — Grounding tab"
          >
            <span className="text-[9px] font-medium tracking-wide text-[#b026ff] uppercase flex items-center gap-1.5">
              <FlaskConical size={10} /> Deep Grounding Active
            </span>
            <span className="text-[8px] text-[#b026ff]/70 tracking-wider">EXPAND →</span>
          </button>
        )}

        {/* ── Indicator pills ──────────────────────────────────────────────── */}
        <div
          data-testid="demystifier-metrics"
          className="flex flex-wrap gap-1.5 pt-0.5"
        >
          <Indicator testId="demystifier-metric-ac"  icon={<CheckCircle2 size={9} />} label={acCount  > 0 ? `${acCount} Criteria`       : 'No criteria'}      tone="#50fa7b" active={acCount  > 0} />
          <Indicator testId="demystifier-metric-eh"  icon={<AlertTriangle size={9} />} label={ehCount > 0 ? `${ehCount} Error handlers` : 'No error handling'} tone="#ffcb6b" active={ehCount  > 0} />
          <Indicator testId="demystifier-metric-ctr" icon={<FileText size={9} />}      label={hasContract ? 'Contract set'              : 'No contract'}       tone="#8be9fd" active={hasContract} />
          <Indicator testId="demystifier-metric-rch" icon={<FlaskConical size={9} />}  label={hasResearch  ? 'Grounded'                 : 'Not grounded'}      tone="#b026ff" active={hasResearch} />
        </div>

        <div
          data-testid="demystifier-footer"
          className="truncate text-[9px] text-text-dim uppercase tracking-[0.08em]"
          title={semanticFooter}
        >
          {semanticFooter}
        </div>

      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-2 h-2 !bg-bg !border-[1.5px] rounded-full"
        style={{ borderColor: typeColor }}
      />

      {/* ── Connect shortcut button — appears on card hover ──────────────── */}
      <button
        className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-all hover:scale-110 z-20"
        style={{
          background: `${typeColor}18`,
          borderColor: `${typeColor}55`,
          color: typeColor,
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (openInspector) openInspector(data.id);
          else { setSelectedNode(data); openRightPanel(); }
        }}
        title="Connect to… (open inspector → Connections tab)"
      >
        <ArrowRight size={11} />
      </button>

      {/* ── Corner accents ────────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 w-3 h-3 border-t border-l rounded-tl-[12px] opacity-50" style={{ borderColor: `${typeColor}88` }} />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r rounded-br-[12px] opacity-50" style={{ borderColor: `${typeColor}88` }} />
    </div>
  );
}

// ─── Indicator pill ────────────────────────────────────────────────────────────

function Indicator({
  icon, label, tone, active, testId,
}: {
  icon: React.ReactNode; label: string; tone: string; active: boolean; testId: string;
}) {
  const color = active ? tone : '#94a3b8';
  return (
    <div
      data-testid={testId}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded-[6px] border text-[9px]"
      style={{
        color,
        borderColor: `${color}33`,
        background: active ? `${tone}0D` : 'transparent',
        opacity: active ? 1 : 0.5,
      }}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}
