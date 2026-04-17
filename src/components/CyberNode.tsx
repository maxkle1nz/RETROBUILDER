import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeData } from '../lib/api';
import { useGraphStore } from '../store/useGraphStore';
import {
  Database, Layout, Server, Shield, Globe,
  CheckCircle2, AlertTriangle, FileText, FlaskConical,
} from 'lucide-react';

type CyberNodeData = { data: NodeData; selected?: boolean };

const STATUS_META = {
  pending:     { label: 'Pending',     tone: 'rgba(148,163,184,0.12)', color: '#94a3b8' },
  'in-progress': { label: 'In Progress', tone: 'rgba(0,242,255,0.12)',   color: '#00f2ff' },
  completed:   { label: 'Done',        tone: 'rgba(80,250,123,0.14)',   color: '#50fa7b' },
} as const;

const FALLBACK_STATUS_META = { label: 'Pending', tone: 'rgba(148,163,184,0.12)', color: '#94a3b8' };

const TYPE_META: Record<string, { color: string; Icon: typeof Server; label: string }> = {
  frontend: { color: '#00f2ff', Icon: Layout,   label: 'Frontend'  },
  backend:  { color: '#b026ff', Icon: Server,   label: 'Backend'   },
  database: { color: '#ff9d00', Icon: Database, label: 'Database'  },
  security: { color: '#ff003c', Icon: Shield,   label: 'Security'  },
  external: { color: '#00ff66', Icon: Globe,    label: 'External'  },
};
const FALLBACK_TYPE = { color: 'var(--color-text-dim)', Icon: Server, label: 'Module' };

export default function CyberNode({ data, selected }: CyberNodeData) {
  const highlightedNodes = useGraphStore((s) => s.highlightedNodes);
  const highlightSource  = useGraphStore((s) => s.highlightSource);

  const isHighlighted = highlightedNodes.has(data.id);
  const isBlastSource = highlightSource === data.id;

  const { color: typeColor, Icon: TypeIcon, label: typeLabel } =
    TYPE_META[data.type ?? ''] ?? FALLBACK_TYPE;

  const statusMeta = STATUS_META[data.status] ?? FALLBACK_STATUS_META;

  const acCount    = data.acceptance_criteria?.length ?? 0;
  const ehCount    = data.error_handling?.length ?? 0;
  const hasContract = Boolean(data.data_contract?.trim());
  const hasResearch = Boolean(data.researchContext?.trim());

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
      className="relative w-[240px] border rounded-[12px] backdrop-blur-sm transition-all duration-300 overflow-visible"
      style={{ backgroundColor: cardBg, borderColor, boxShadow }}
    >
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

        {/* Row 1: Type chip + Priority + Status */}
        <div className="flex items-center justify-between gap-1.5">
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-[6px] border text-[9px] font-medium tracking-[0.1em] uppercase"
            style={{ color: typeColor, borderColor: `${typeColor}44`, background: `${typeColor}10` }}
          >
            <TypeIcon size={9} />
            {typeLabel}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {data.priority && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-[6px] bg-white/6 text-text-main">
                P{data.priority}
              </span>
            )}
            <span
              data-testid="demystifier-status-chip"
              className="text-[8px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-[999px] border"
              style={{ color: statusMeta.color, borderColor: `${statusMeta.color}44`, background: statusMeta.tone }}
            >
              {statusMeta.label}
            </span>
          </div>
        </div>

        {/* Row 2: Module name + description — primary focus */}
        <div>
          <h3 className="text-[14px] leading-[1.2] font-semibold text-text-main">
            {data.label}
          </h3>
          {data.description && (
            <div className="mt-1.5 p-1.5 bg-black/20 rounded-[6px] border border-white/5">
              <p className="text-[10.5px] text-text-dim leading-[1.5]">
                {data.description}
              </p>
            </div>
          )}
        </div>

        {hasResearch && (
          <div className="flex items-center justify-between px-2 py-1 bg-[#b026ff]/10 border border-[#b026ff]/30 rounded-[6px]">
             <span className="text-[9px] font-medium tracking-wide text-[#b026ff] uppercase flex items-center gap-1.5">
               <FlaskConical size={10} /> Deep Grounding Active
             </span>
             <span className="text-[8px] text-[#b026ff]/70 tracking-wider">CLICK TO EXPAND</span>
          </div>
        )}

        {/* Row 3: Readable indicator pills */}
        <div
          data-testid="demystifier-metrics"
          className="flex flex-wrap gap-1.5 pt-0.5"
        >
          <Indicator
            testId="demystifier-metric-ac"
            icon={<CheckCircle2 size={9} />}
            label={acCount > 0 ? `${acCount} Criteria` : 'No criteria'}
            tone="#50fa7b"
            active={acCount > 0}
          />
          <Indicator
            testId="demystifier-metric-eh"
            icon={<AlertTriangle size={9} />}
            label={ehCount > 0 ? `${ehCount} Error handlers` : 'No error handling'}
            tone="#ffcb6b"
            active={ehCount > 0}
          />
          <Indicator
            testId="demystifier-metric-ctr"
            icon={<FileText size={9} />}
            label={hasContract ? 'Contract set' : 'No contract'}
            tone="#8be9fd"
            active={hasContract}
          />
          <Indicator
            testId="demystifier-metric-rch"
            icon={<FlaskConical size={9} />}
            label={hasResearch ? 'Grounded' : 'Not grounded'}
            tone="#b026ff"
            active={hasResearch}
          />
        </div>

      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-2 h-2 !bg-bg !border-[1.5px] rounded-full"
        style={{ borderColor: typeColor }}
      />

      <div className="absolute top-0 left-0 w-3 h-3 border-t border-l rounded-tl-[12px] opacity-50" style={{ borderColor: `${typeColor}88` }} />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r rounded-br-[12px] opacity-50" style={{ borderColor: `${typeColor}88` }} />
    </div>
  );
}

function Indicator({
  icon,
  label,
  tone,
  active,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  tone: string;
  active: boolean;
  testId: string;
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
