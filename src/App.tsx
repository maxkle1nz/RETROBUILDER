/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import GraphView from './components/GraphView';
import Sidebar from './components/Sidebar';
import Checklist from './components/Checklist';
import ChatFooter from './components/ChatFooter';
import ProposalModal from './components/ProposalModal';
import RightPanel from './components/RightPanel';
import ErrorBoundary from './components/ErrorBoundary';
import { useGraphStore } from './store/useGraphStore';
import { BrainCircuit, PenTool, PanelRightClose, PanelLeftClose } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Toaster, toast } from 'sonner';

function LiveUptime() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return <span>{h}:{m}:{s}</span>;
}

export default function App() {
  const { appMode, setAppMode, isRightPanelOpen, graphData } = useGraphStore();
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const totalNodes = graphData.nodes.length;
  const completedNodes = graphData.nodes.filter(n => n.status === 'completed').length;
  const syncPct = totalNodes > 0 ? Math.round((completedNodes / totalNodes) * 100) : 0;

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // ⌘+Z — undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useGraphStore.temporal.getState().undo();
        toast.info('Undo', { duration: 1500 });
      }
      // ⌘+Shift+Z — redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        useGraphStore.temporal.getState().redo();
        toast.info('Redo', { duration: 1500 });
      }
      // Esc — close panels
      if (e.key === 'Escape') {
        useGraphStore.getState().closeRightPanel();
        useGraphStore.getState().setSelectedNode(null);
      }
      // ⌘+1 — Architect mode
      if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault();
        setAppMode('architect');
      }
      // ⌘+2 — M1ND mode
      if ((e.metaKey || e.ctrlKey) && e.key === '2') {
        e.preventDefault();
        setAppMode('m1nd');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setAppMode]);

  const isM1nd = appMode === 'm1nd';

  return (
    <ErrorBoundary fallbackMessage="RETROBUILDER encountered a critical error. Click Recover to reset the view.">
      <div 
        className="w-screen h-screen flex flex-col overflow-hidden bg-bg text-text-main font-sans selection:bg-accent-dim"
        data-mode={appMode}
      >
        <Toaster 
          position="top-right" 
          theme="dark"
          toastOptions={{
            style: {
              background: '#101218',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#e0e6ed',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
            },
          }}
        />

        <header className={`h-[60px] border-b flex justify-between items-center px-6 backdrop-blur-[10px] shrink-0 z-20 transition-colors duration-500 ${
          isM1nd 
            ? 'bg-[rgba(20,12,28,0.85)] border-[#b026ff]/20' 
            : 'bg-[rgba(16,18,24,0.8)] border-border-subtle'
        }`}>
          <div className="flex items-center gap-6">
            <div className={`font-display font-bold text-[1.1rem] tracking-[3px] transition-colors duration-500 ${
              isM1nd ? 'text-[#b026ff]' : 'text-accent'
            }`}>
              M1ND // SYSTEM
            </div>
            
            <div className="flex bg-black/50 rounded-md border border-border-subtle p-1">
              <button
                onClick={() => setAppMode('architect')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold tracking-wider transition-all duration-300 ${
                  appMode === 'architect' ? 'bg-accent/20 text-accent' : 'text-text-dim hover:text-white'
                }`}
              >
                <PenTool size={14} />
                ARCHITECT
              </button>
              <button
                onClick={() => setAppMode('m1nd')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold tracking-wider transition-all duration-300 ${
                  appMode === 'm1nd' ? 'bg-[#b026ff]/20 text-[#b026ff]' : 'text-text-dim hover:text-white'
                }`}
              >
                <BrainCircuit size={14} />
                M1ND
              </button>
            </div>
          </div>

          <div className="flex gap-5 text-[11px] text-text-dim items-center font-mono">
            <span>SYNC: <span className={isM1nd ? 'text-[#b026ff]' : 'text-accent'}>{syncPct}%</span></span>
            <span>NODES: <span className="text-text-main">{totalNodes}</span></span>
            <span>UPTIME: <LiveUptime /></span>
            <div className="text-[9px] px-2 py-0.5 rounded bg-[#222] text-white font-mono tracking-wider">v2.5.0</div>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          <AnimatePresence>
            {!leftCollapsed && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 220, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden shrink-0"
              >
                <Checklist />
              </motion.div>
            )}
          </AnimatePresence>
          
          <div className={`flex-1 relative flex items-center justify-center transition-colors duration-500 ${
            isM1nd
              ? 'bg-[radial-gradient(circle_at_center,#1a0f24_0%,#050608_100%)]'
              : 'bg-[radial-gradient(circle_at_center,#151a24_0%,#050608_100%)]'
          }`}>
            {/* Panel collapse toggles */}
            <div className="absolute top-2 left-2 z-50">
              <button
                onClick={() => setLeftCollapsed(!leftCollapsed)}
                className="p-1.5 bg-surface/80 border border-border-subtle rounded text-text-dim hover:text-accent transition-colors"
                title={leftCollapsed ? 'Show Checklist' : 'Hide Checklist'}
              >
                <PanelLeftClose size={14} />
              </button>
            </div>
            <div className="absolute top-2 right-2 z-50">
              <button
                onClick={() => setRightCollapsed(!rightCollapsed)}
                className="p-1.5 bg-surface/80 border border-border-subtle rounded text-text-dim hover:text-accent transition-colors"
                title={rightCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}
              >
                <PanelRightClose size={14} />
              </button>
            </div>

            <div className="absolute inset-0 grid-pulse pointer-events-none" />
            <ErrorBoundary fallbackMessage="Graph rendering failed. This may be caused by malformed AI output.">
              <GraphView />
            </ErrorBoundary>
          </div>

          <AnimatePresence>
            {isRightPanelOpen && <RightPanel />}
          </AnimatePresence>

          <AnimatePresence>
            {!rightCollapsed && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 320, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden shrink-0"
              >
                <Sidebar />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        <ChatFooter />
        <ProposalModal />
      </div>
    </ErrorBoundary>
  );
}
