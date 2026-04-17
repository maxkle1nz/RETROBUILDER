import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { NodeData } from '../lib/api';
import { useGraphStore } from '../store/useGraphStore';
import { CheckCircle2, Circle, PlayCircle, Database, Layout, Server, Shield, Globe } from 'lucide-react';

type CyberNodeData = { data: NodeData; selected?: boolean };

export default function CyberNode({ data, selected }: CyberNodeData) {
  const highlightedNodes = useGraphStore((s) => s.highlightedNodes);
  const highlightSource = useGraphStore((s) => s.highlightSource);
  
  const isHighlighted = highlightedNodes.has(data.id);
  const isBlastSource = highlightSource === data.id;

  // Determine colors based on type
  let typeColor = 'var(--color-text-dim)';
  let TypeIcon = Server;
  
  switch (data.type) {
    case 'frontend':
      typeColor = '#00f2ff'; // Cyan
      TypeIcon = Layout;
      break;
    case 'backend':
      typeColor = '#b026ff'; // Purple
      TypeIcon = Server;
      break;
    case 'database':
      typeColor = '#ff9d00'; // Orange
      TypeIcon = Database;
      break;
    case 'security':
      typeColor = '#ff003c'; // Red
      TypeIcon = Shield;
      break;
    case 'external':
      typeColor = '#00ff66'; // Green
      TypeIcon = Globe;
      break;
  }

  const isCompleted = data.status === 'completed';
  const isInProgress = data.status === 'in-progress';

  // Blast radius visual styling
  let borderColor = selected ? 'var(--color-accent)' : 'var(--color-border-subtle)';
  let shadowClass = selected ? 'shadow-[0_0_20px_rgba(0,242,255,0.2)] z-10' : 'shadow-lg z-0';
  
  if (isBlastSource) {
    borderColor = '#ff003c';
    shadowClass = 'shadow-[0_0_30px_rgba(255,0,60,0.5)] z-20 animate-pulse';
  } else if (isHighlighted) {
    borderColor = '#ff9d00';
    shadowClass = 'shadow-[0_0_20px_rgba(255,157,0,0.3)] z-10';
  }

  return (
    <div 
      className={`relative min-w-[200px] bg-[rgba(16,18,24,0.95)] border backdrop-blur-md transition-all duration-300 ${shadowClass}`}
      style={{ borderColor }}
    >
      {/* Blast radius badge */}
      {isBlastSource && (
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] bg-[#ff003c] text-white px-2 py-0.5 rounded-full uppercase tracking-widest whitespace-nowrap z-30">
          ⚡ Blast Origin
        </div>
      )}
      {isHighlighted && !isBlastSource && (
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] bg-[#ff9d00] text-bg px-2 py-0.5 rounded-full uppercase tracking-widest whitespace-nowrap z-30">
          Impact Zone
        </div>
      )}

      {/* Target Handle (Input) */}
      <Handle 
        type="target" 
        position={Position.Top} 
        className="w-2 h-2 !bg-bg !border-[1.5px] rounded-none"
        style={{ borderColor: typeColor }}
      />

      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-border-subtle bg-[rgba(255,255,255,0.02)]">
        <div className="flex items-center gap-2">
          <TypeIcon size={12} style={{ color: typeColor }} />
          <span className="text-[10px] uppercase font-mono tracking-widest" style={{ color: typeColor }}>
            {data.type || 'module'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {data.priority && (
            <span className="text-[8px] font-mono bg-[rgba(255,255,255,0.08)] px-1.5 py-0.5 rounded text-text-dim">
              P{data.priority}
            </span>
          )}
          {isCompleted && <CheckCircle2 size={12} style={{ color: typeColor }} />}
          {isInProgress && <PlayCircle size={12} className="text-text-dim" />}
          {!isCompleted && !isInProgress && <Circle size={12} className="text-text-dim" />}
        </div>
      </div>

      {/* Body */}
      <div className="p-3">
        <h3 className="text-[13px] font-bold text-text-main mb-1 truncate">{data.label}</h3>
        <p className="text-[10px] text-text-dim leading-tight line-clamp-2 font-mono">
          {data.description}
        </p>
      </div>

      {/* Footer / Data Contract */}
      {data.data_contract && (
        <div className="px-3 py-2 border-t border-border-subtle bg-[rgba(0,0,0,0.3)]">
          <div className="text-[8px] uppercase text-text-dim mb-1 tracking-widest">Data Contract</div>
          <div className="text-[9px] text-accent-dim font-mono truncate">
            {data.data_contract}
          </div>
        </div>
      )}

      {/* Acceptance Criteria Badge */}
      {data.acceptance_criteria && data.acceptance_criteria.length > 0 && (
        <div className="px-3 py-1.5 border-t border-border-subtle bg-[rgba(80,250,123,0.04)] flex items-center justify-between">
          <span className="text-[8px] uppercase text-[#50fa7b]/70 tracking-widest">AC</span>
          <span className="text-[9px] font-mono text-[#50fa7b]">
            {data.acceptance_criteria.length} criteria
          </span>
        </div>
      )}

      {/* Grounded Badge — node has been enriched with research */}
      {data.researchContext && (
        <div className="px-3 py-1 border-t border-border-subtle bg-[rgba(0,242,255,0.04)] flex items-center justify-between">
          <span className="text-[8px] uppercase text-accent/70 tracking-widest">🔬 Grounded</span>
          {data.constructionNotes && (
            <span className="text-[8px] font-mono text-[#b026ff]/70">📝</span>
          )}
        </div>
      )}

      {/* Source Handle (Output) */}
      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="w-2 h-2 !bg-bg !border-[1.5px] rounded-none"
        style={{ borderColor: typeColor }}
      />
      
      {/* Cyberpunk Decorative Elements */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l" style={{ borderColor: typeColor }} />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r" style={{ borderColor: typeColor }} />
    </div>
  );
}
