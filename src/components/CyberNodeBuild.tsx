import React, { useEffect, useRef } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion, AnimatePresence } from 'motion/react';
import { useBuildStore, type BuildNodeStatus } from '../store/useBuildStore';

const STATUS_COLORS: Record<BuildNodeStatus, { border: string; bg: string; glow: string; text: string }> = {
  dormant:  { border: 'rgba(255,255,255,0.06)', bg: 'rgba(10,11,16,0.8)',  glow: 'none',                              text: '#3a4050' },
  queued:   { border: 'rgba(255,200,107,0.4)',  bg: 'rgba(255,200,107,0.04)', glow: '0 0 8px rgba(255,200,107,0.15)',   text: '#ffcb6b' },
  building: { border: 'rgba(0,242,255,0.6)',    bg: 'rgba(0,242,255,0.05)',   glow: '0 0 16px rgba(0,242,255,0.25)',    text: '#00f2ff' },
  complete: { border: 'rgba(80,250,123,0.5)',   bg: 'rgba(80,250,123,0.06)',  glow: '0 0 20px rgba(80,250,123,0.2)',    text: '#50fa7b' },
  error:    { border: 'rgba(255,0,60,0.6)',     bg: 'rgba(255,0,60,0.06)',    glow: '0 0 14px rgba(255,0,60,0.25)',     text: '#ff003c' },
};

const PHASE_LABELS = { scaffold: '01', implement: '02', test: '03', integrate: '04' };

export default function CyberNodeBuild({ data, selected, id }: NodeProps) {
  const nodeState = useBuildStore((s) => s.nodeStates[id]);
  const status = nodeState?.status ?? 'dormant';
  const colors = STATUS_COLORS[status];
  const pct = nodeState?.pct ?? 0;

  const label = (data as any).label as string;
  const type  = (data as any).type as string | undefined;

  return (
    <div
      className="relative min-w-[160px] select-none"
      style={{
        border: `1.5px solid ${colors.border}`,
        background: colors.bg,
        boxShadow: selected ? `0 0 0 2px rgba(0,242,255,0.5), ${colors.glow}` : colors.glow,
        transition: 'border-color 0.6s ease, box-shadow 0.6s ease, background 0.6s ease',
        borderRadius: '2px',
      }}
    >
      {/* HUD corner decorator */}
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r" style={{ borderColor: colors.border }} />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l" style={{ borderColor: colors.border }} />

      {/* Flood-fill completion overlay (slides up from bottom) */}
      <AnimatePresence>
        {status === 'complete' && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'rgba(80,250,123,0.06)', borderRadius: '2px' }}
            initial={{ clipPath: 'inset(100% 0 0 0)' }}
            animate={{ clipPath: 'inset(0% 0 0 0)' }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* Building shimmer */}
      {status === 'building' && (
        <motion.div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          style={{ borderRadius: '2px' }}
        >
          <motion.div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(0,242,255,0.08) 50%, transparent 100%)',
              width: '200%',
            }}
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          />
        </motion.div>
      )}

      {/* Content */}
      <div className="px-3 py-2.5 relative z-10">
        {/* Type badge */}
        {type && (
          <div className="text-[7px] uppercase tracking-[2px] mb-1.5 font-mono" style={{ color: colors.text, opacity: status === 'dormant' ? 0.3 : 0.7 }}>
            {type}
          </div>
        )}

        {/* Label */}
        <div
          className="text-[11px] font-semibold font-mono leading-tight"
          style={{ color: status === 'dormant' ? '#3a4050' : '#e0e6ed', transition: 'color 0.6s ease' }}
        >
          {label}
        </div>

        {/* Status line */}
        <div className="flex items-center justify-between mt-1.5 gap-2">
          <div className="text-[8px] uppercase tracking-widest font-mono" style={{ color: colors.text, opacity: 0.8 }}>
            {status === 'building' && nodeState?.phase
              ? `${PHASE_LABELS[nodeState.phase]} ${nodeState.phase}`
              : status}
          </div>
          {nodeState?.phase && (
            <div className="text-[7px] tracking-widest font-mono opacity-50" style={{ color: colors.text }}>
              {pct}%
            </div>
          )}
        </div>

        {/* Progress bar — only visible when building */}
        {status === 'building' && (
          <div className="mt-1.5 h-px bg-white/5 overflow-hidden">
            <motion.div
              className="h-full"
              style={{ background: colors.text }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
        )}

        {/* Current file — truncated */}
        {status === 'building' && nodeState?.currentFile && (
          <div className="text-[7px] font-mono mt-1 truncate max-w-[140px] opacity-50" style={{ color: colors.text }}>
            {nodeState.currentFile.split('/').pop()}
          </div>
        )}

        {/* Completion stats */}
        {status === 'complete' && (
          <div className="text-[7px] font-mono mt-1 opacity-60" style={{ color: colors.text }}>
            {nodeState.filesWritten}f · {nodeState.linesWritten}L
          </div>
        )}
      </div>

      {/* Propagation ring — triggers on complete */}
      <PropagationRing active={status === 'complete'} color={colors.glow} />

      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />
    </div>
  );
}

function PropagationRing({ active, color }: { active: boolean; color: string }) {
  const hasRung = useRef(false);

  useEffect(() => {
    if (active && !hasRung.current) {
      hasRung.current = true;
    }
  }, [active]);

  if (!active || !hasRung.current) return null;

  return (
    <motion.div
      className="absolute inset-0 pointer-events-none"
      style={{ borderRadius: '2px', border: '1px solid rgba(80,250,123,0.6)' }}
      initial={{ scale: 1, opacity: 0.8 }}
      animate={{ scale: 2.5, opacity: 0 }}
      transition={{ duration: 1.2, ease: 'easeOut' }}
    />
  );
}
