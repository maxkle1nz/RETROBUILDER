/**
 * ConnectionSuggester.tsx
 * Floating popover showing ranked connection candidates for a source node.
 * Opens from the card's ⟶ button or the Inspector's Connections tab.
 * ⌘1–⌘4 shortcut keys to connect instantly.
 */
import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Zap, Search } from 'lucide-react';
import { useGraphStore } from '../store/useGraphStore';
import {
  suggestConnections,
  getAutoEdgeLabel,
  type ConnectionCandidate,
  type NodeType,
} from '../lib/connectionRules';
import type { NodeData } from '../lib/api';

interface Props {
  sourceNode: NodeData;
  onClose: () => void;
  /** If provided, focus the search box immediately */
  autoFocusSearch?: boolean;
}

const TYPE_COLOR: Record<string, string> = {
  frontend: '#00f2ff',
  backend:  '#b026ff',
  database: '#ff9d00',
  security: '#ff003c',
  external: '#00ff66',
};

export default function ConnectionSuggester({ sourceNode, onClose, autoFocusSearch }: Props) {
  const graphData = useGraphStore((s) => s.graphData);
  const addLink   = useGraphStore((s) => s.addLink);
  const [showAllTargets, setShowAllTargets] = useState(false);

  const smartCandidates: ConnectionCandidate[] = suggestConnections(sourceNode.id, graphData, 5);
  const allTargets = useMemo<ConnectionCandidate[]>(() => {
    const outgoingTargets = new Set(
      graphData.links.filter((link) => link.source === sourceNode.id).map((link) => link.target),
    );
    const sourceType = (sourceNode.type ?? 'backend') as NodeType;

    return graphData.nodes
      .filter((node) => node.id !== sourceNode.id && !outgoingTargets.has(node.id))
      .map((node) => {
        const targetType = (node.type ?? 'backend') as NodeType;
        return {
          node,
          score: node.group === sourceNode.group ? 0.35 : 0.1,
          reason: node.group === sourceNode.group ? 'Same group · manual target' : 'Manual target',
          autoLabel: getAutoEdgeLabel(sourceType, targetType),
        };
      })
      .sort((a, b) => b.score - a.score || a.node.label.localeCompare(b.node.label));
  }, [graphData.links, graphData.nodes, sourceNode.group, sourceNode.id, sourceNode.type]);

  const candidates = showAllTargets ? allTargets : smartCandidates;
  const emptyMessage = showAllTargets
    ? 'No remaining unconnected nodes.'
    : 'All smart matches are already connected.';

  const connect = useCallback(
    (candidate: ConnectionCandidate) => {
      addLink({
        source: sourceNode.id,
        target: candidate.node.id,
        label:  candidate.autoLabel,
      });
      onClose();
    },
    [addLink, sourceNode.id, onClose],
  );

  // ⌘1–⌘4 shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < candidates.length) {
        e.preventDefault();
        connect(candidates[idx]);
      }
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [candidates, connect, onClose]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 6 }}
        transition={{ duration: 0.15 }}
        className="w-[280px] bg-[#090b10] border border-accent/25 rounded-[10px] shadow-[0_0_30px_rgba(0,242,255,0.08)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/6">
          <div className="flex items-center gap-2">
            <Zap size={12} className="text-accent" />
            <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-accent">
              Connect
            </span>
            <span className="text-[9px] text-text-dim">from</span>
            <span className="text-[9px] font-semibold text-text-main truncate max-w-[100px]">
              {sourceNode.label}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-text-dim hover:text-text-main transition-colors p-0.5 rounded"
          >
            <X size={12} />
          </button>
        </div>

        {/* Candidates */}
        <div className="py-1">
          {candidates.length === 0 ? (
              <div className="px-3 py-4 text-center text-[10px] text-text-dim italic">
                No compatible nodes found.<br />
                {emptyMessage}
              </div>
          ) : (
            candidates.map((c, i) => {
              const tColor = TYPE_COLOR[c.node.type ?? ''] ?? '#94a3b8';
              const shortcut = i < 4 ? `⌘${i + 1}` : null;
              return (
                <button
                  key={c.node.id}
                  onClick={() => connect(c)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/4 transition-colors text-left group"
                >
                  {/* Type dot */}
                  <div
                    className="w-2 h-2 rounded-full shrink-0 mt-0.5"
                    style={{ background: tColor, boxShadow: `0 0 6px ${tColor}` }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-semibold text-text-main truncate">
                      {c.node.label}
                    </div>
                    <div className="text-[8.5px] text-text-dim mt-0.5">
                      <span style={{ color: tColor }}>{c.node.type}</span>
                      {' · '}
                      <span className="italic">{c.autoLabel}</span>
                      {' · '}
                      {c.reason}
                    </div>
                  </div>
                  {shortcut && (
                    <kbd className="text-[8px] text-text-dim border border-white/10 bg-white/4 px-1.5 py-0.5 rounded opacity-60 group-hover:opacity-100 shrink-0 font-mono">
                      {shortcut}
                    </kbd>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer: connect to any */}
          <div className="border-t border-white/6 px-3 py-2">
            <button
              className="w-full flex items-center gap-2 text-[9px] text-text-dim hover:text-accent transition-colors py-1"
              onClick={() => setShowAllTargets((value) => !value)}
            >
              <Search size={10} />
              <span>{showAllTargets ? 'Show smart suggestions' : `Browse all nodes (${allTargets.length})`}</span>
            </button>
          </div>
      </motion.div>
    </AnimatePresence>
  );
}
