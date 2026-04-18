import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useBuildStore, type BuildLogEntry } from '../store/useBuildStore';
import { Terminal, CheckCircle2, AlertCircle, ArrowRight, Cpu, ChevronDown } from 'lucide-react';

const LOG_ICON: Record<BuildLogEntry['type'], React.ComponentType<{ size?: number; className?: string }>> = {
  system:  Cpu,
  info:    Terminal,
  success: CheckCircle2,
  error:   AlertCircle,
  edge:    ArrowRight,
};

const LOG_COLOR: Record<BuildLogEntry['type'], string> = {
  system:  'text-accent',
  info:    'text-text-dim',
  success: 'text-[#50fa7b]',
  error:   'text-[#ff003c]',
  edge:    'text-[#b026ff]',
};

export default function BuildConsole({ drawerMode = false, open = true, onClose }: {
  drawerMode?: boolean;
  open?: boolean;
  onClose?: () => void;
}) {
  const { globalLogs, buildProgress, isBuilding, buildStatus, buildResult, completedNodes, totalNodes, activeNodeId, nodeStates } = useBuildStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [globalLogs.length]);

  const activeState = activeNodeId ? nodeStates[activeNodeId] : null;

  const inner = (
    <div className={`w-full flex flex-col font-mono ${
      drawerMode
        ? 'h-full bg-[#060809]'
        : 'h-full bg-[#060809] border-l border-border-subtle'
    }`}>
      {/* Console Header */}
      <div className="h-[46px] border-b border-border-subtle flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <Terminal size={12} className="text-accent" />
          <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-accent">
            {drawerMode ? 'OMX Terminal' : 'Build Console'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[9px] font-mono text-text-dim uppercase tracking-widest">
            {isBuilding ? (
              <span className="text-[#ffcb6b] animate-pulse">● LIVE</span>
            ) : buildStatus === 'failed' ? (
              <span className="text-[#ff003c]">✗ FAILED</span>
            ) : buildStatus === 'stopped' ? (
              <span className="text-[#ffcb6b]">■ STOPPED</span>
            ) : buildResult ? (
              <span className="text-[#50fa7b]">✓ DONE</span>
            ) : (
              <span>STANDBY</span>
            )}
          </div>
          {drawerMode && onClose && (
            <button
              onClick={onClose}
              className="p-1 text-text-dim hover:text-white transition-colors rounded ml-1"
              title="Minimize"
            >
              <ChevronDown size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Active Node Status */}
      {activeNodeId && activeState && isBuilding && (
        <div className="border-b border-border-subtle px-4 py-2 bg-accent/5 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] uppercase tracking-widest text-accent">Active: {activeNodeId}</span>
            <span className="text-[9px] text-text-dim">{activeState.phase} · {activeState.pct}%</span>
          </div>
          <div className="h-px bg-border-subtle overflow-hidden">
            <motion.div
              className="h-full bg-accent"
              style={{ boxShadow: '0 0 6px var(--color-accent)' }}
              animate={{ width: `${activeState.pct}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>
          {activeState.currentFile && (
            <div className="text-[8px] text-text-dim mt-1 truncate">{activeState.currentFile}</div>
          )}
        </div>
      )}

      {/* Log Feed */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto custom-scrollbar py-2 space-y-0.5"
      >
        {globalLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[11px] text-text-dim opacity-30 uppercase tracking-widest">
            Awaiting build signal...
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {globalLogs.map((log) => {
              const Icon = LOG_ICON[log.type];
              const color = LOG_COLOR[log.type];
              return (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15 }}
                  className={`flex items-start gap-2 px-4 py-1 hover:bg-white/[0.02] ${
                    log.type === 'system' ? 'border-t border-b border-border-subtle my-1 py-2' : ''
                  }`}
                >
                  <Icon size={10} className={`${color} mt-0.5 shrink-0`} />
                  <div className="min-w-0 flex-1">
                    <div className={`text-[10px] leading-tight ${color} truncate`}>{log.message}</div>
                    {log.file && (
                      <div className="text-[8px] text-text-dim opacity-50 truncate">{log.file}</div>
                    )}
                  </div>
                  <div className="text-[7px] text-text-dim opacity-30 shrink-0 mt-0.5">
                    {new Date(log.timestamp).toLocaleTimeString('en', { hour12: false, second: '2-digit', minute: '2-digit', hour: '2-digit' })}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Build Result Screen */}
      {buildResult && buildStatus !== 'failed' && buildStatus !== 'stopped' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-t border-[#50fa7b]/20 bg-[#50fa7b]/5 p-4 shrink-0"
        >
          <div className="text-[9px] uppercase tracking-[0.3em] text-[#50fa7b] mb-3 flex items-center gap-2">
            <CheckCircle2 size={10} />
            Mission Complete
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[13px] font-bold text-[#50fa7b]">{buildResult.totalFiles}</div>
              <div className="text-[7px] uppercase tracking-widest text-text-dim">Files</div>
            </div>
            <div>
              <div className="text-[13px] font-bold text-[#50fa7b]">{buildResult.totalLines.toLocaleString()}</div>
              <div className="text-[7px] uppercase tracking-widest text-text-dim">Lines</div>
            </div>
            <div>
              <div className="text-[13px] font-bold text-[#50fa7b]">{(buildResult.elapsedMs / 1000).toFixed(1)}s</div>
              <div className="text-[7px] uppercase tracking-widest text-text-dim">Time</div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Footer progress */}
      <div className="border-t border-border-subtle px-4 py-2 flex items-center gap-3 shrink-0">
        <div className="flex-1 h-px bg-border-subtle overflow-hidden">
          <motion.div
            className="h-full bg-accent"
            style={{ boxShadow: '0 0 4px var(--color-accent)' }}
            animate={{ width: `${buildProgress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
        <span className="text-[9px] font-mono text-text-dim shrink-0">
          {completedNodes}/{totalNodes} · {buildProgress}%
        </span>
      </div>
    </div>
  );

  if (drawerMode) {
    return (
      <AnimatePresence>
        {open && (
          <motion.div
            key="build-console-drawer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 240, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.32, 0, 0.67, 0] }}
            className="w-full shrink-0 border-t border-border-subtle overflow-hidden"
            style={{ boxShadow: '0 -4px 24px rgba(0,0,0,0.4)' }}
          >
            {inner}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return inner;
}
