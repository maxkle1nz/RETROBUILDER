import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Database,
  Layout,
  Server,
  Shield,
  Globe,
  X,
} from 'lucide-react';
import { useGraphStore } from '../store/useGraphStore';
import type { NodeData } from '../lib/api';

const TYPE_META: Record<string, { color: string; Icon: typeof Server; label: string }> = {
  frontend: { color: '#00f2ff', Icon: Layout,   label: 'Frontend' },
  backend:  { color: '#b026ff', Icon: Server,   label: 'Backend'  },
  database: { color: '#ff9d00', Icon: Database, label: 'Database' },
  security: { color: '#ff003c', Icon: Shield,   label: 'Security' },
  external: { color: '#00ff66', Icon: Globe,    label: 'External' },
};
const FALLBACK_TYPE = { color: '#8892a0', Icon: Server, label: 'Module' };

const STATUS_COLOR: Record<string, string> = {
  pending:     '#94a3b8',
  'in-progress': '#00f2ff',
  completed:   '#50fa7b',
};

function fuzzyMatch(node: NodeData, query: string): boolean {
  if (!query) return true;
  const q    = query.toLowerCase();
  const text = `${node.label} ${node.description ?? ''} ${node.type ?? ''} ${node.status ?? ''}`.toLowerCase();
  // All tokens must appear somewhere in the text
  return q.split(/\s+/).every((token) => text.includes(token));
}

interface SpotlightSearchProps {
  onClose: () => void;
}

export default function SpotlightSearch({ onClose }: SpotlightSearchProps) {
  const graphData       = useGraphStore((s) => s.graphData);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const openRightPanel  = useGraphStore((s) => s.openRightPanel);
  const setFocusNodeId  = useGraphStore((s) => s.setFocusNodeId);

  const [query, setQuery]     = useState('');
  const [cursor, setCursor]   = useState(0);
  const inputRef              = useRef<HTMLInputElement>(null);
  const listRef               = useRef<HTMLDivElement>(null);

  const results = graphData.nodes.filter((n) => fuzzyMatch(n, query)).slice(0, 8);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);

  const selectNode = useCallback(
    (node: NodeData) => {
      setSelectedNode(node);
      openRightPanel();
      setFocusNodeId(node.id);
      onClose();
    },
    [setSelectedNode, openRightPanel, setFocusNodeId, onClose],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, results.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      }
      if (e.key === 'Enter' && results[cursor]) {
        selectNode(results[cursor]);
      }
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [results, cursor, selectNode, onClose]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[cursor] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[9000] flex items-start justify-center pt-[18vh]"
      style={{ background: 'rgba(5,6,8,0.72)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, y: -12, opacity: 0 }}
        animate={{ scale: 1,    y: 0,   opacity: 1 }}
        exit={{ scale: 0.96,    y: -8,  opacity: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[560px] rounded-[14px] border border-white/10 overflow-hidden"
        style={{
          background: 'rgba(14, 16, 24, 0.97)',
          boxShadow: '0 0 0 1px rgba(0,242,255,0.15), 0 32px 80px rgba(0,0,0,0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8">
          <Search size={15} className="text-accent shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search modules…"
            className="flex-1 bg-transparent text-[13px] text-text-main placeholder:text-text-dim/50 outline-none font-sans"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-text-dim hover:text-white transition-colors"
            >
              <X size={12} />
            </button>
          )}
          <span className="text-[9px] text-text-dim border border-white/10 rounded px-1.5 py-0.5 font-mono tracking-wider">
            ESC
          </span>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[320px] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {results.length === 0 ? (
            <div className="py-10 text-center text-[11px] text-text-dim/50 uppercase tracking-widest">
              No modules match
            </div>
          ) : (
            results.map((node, i) => {
              const { color, Icon, label: typeLabel } = TYPE_META[node.type ?? ''] ?? FALLBACK_TYPE;
              const statusColor = STATUS_COLOR[node.status ?? 'pending'] ?? '#94a3b8';
              const isActive    = i === cursor;
              return (
                <button
                  key={node.id}
                  onClick={() => selectNode(node)}
                  className="w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors"
                  style={{
                    background: isActive ? 'rgba(255,255,255,0.04)' : 'transparent',
                    borderLeft: isActive ? `2px solid ${color}` : '2px solid transparent',
                  }}
                >
                  <div
                    className="w-6 h-6 rounded-[6px] flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: `${color}18`, border: `1px solid ${color}44` }}
                  >
                    <Icon size={11} style={{ color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-semibold text-text-main truncate">
                        {node.label}
                      </span>
                      <span
                        className="text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                        style={{ color, background: `${color}15` }}
                      >
                        {typeLabel}
                      </span>
                    </div>
                    {node.description && (
                      <div className="text-[10px] text-text-dim truncate mt-0.5">
                        {node.description}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: statusColor }}
                      title={node.status}
                    />
                    {node.priority && (
                      <span className="text-[8px] text-text-dim font-mono">
                        P{node.priority}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-white/5 flex items-center gap-3 text-[8px] text-text-dim/50 font-mono">
          <span><kbd className="border border-white/10 rounded px-1">↑↓</kbd> Navigate</span>
          <span><kbd className="border border-white/10 rounded px-1">↵</kbd> Select</span>
          <span><kbd className="border border-white/10 rounded px-1">Esc</kbd> Close</span>
          <span className="ml-auto">{graphData.nodes.length} modules indexed</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
