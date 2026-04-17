import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Terminal,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Cpu,
  ChevronDown,
  X,
} from 'lucide-react';
import { useBuildStore, type BuildLogEntry } from '../store/useBuildStore';

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

interface OmxTerminalDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function OmxTerminalDrawer({ open, onClose }: OmxTerminalDrawerProps) {
  const { globalLogs, isBuilding, buildResult, buildProgress, completedNodes, totalNodes } =
    useBuildStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [globalLogs.length]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 240, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.32, 0, 0.67, 0] }}
          className="w-full shrink-0 border-t border-border-subtle bg-[#060809] flex flex-col font-mono overflow-hidden"
          style={{ boxShadow: '0 -4px 24px rgba(0,0,0,0.4)' }}
        >
          {/* Drawer header */}
          <div className="h-[38px] border-b border-border-subtle flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-2.5">
              <Terminal size={11} className="text-accent" />
              <span className="text-[9px] uppercase tracking-[0.28em] font-bold text-accent">
                OMX Terminal
              </span>
              {isBuilding && (
                <span className="flex items-center gap-1 text-[8px] text-[#ffcb6b] animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ffcb6b] inline-block" />
                  LIVE
                </span>
              )}
              {!isBuilding && buildResult && (
                <span className="text-[8px] text-[#50fa7b]">✓ DONE</span>
              )}
              {!isBuilding && !buildResult && globalLogs.length > 0 && (
                <span className="text-[8px] text-text-dim">STANDBY</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Progress */}
              {(isBuilding || buildResult) && (
                <div className="flex items-center gap-2 pr-2">
                  <div className="w-[80px] h-px bg-border-subtle overflow-hidden">
                    <motion.div
                      className="h-full bg-accent"
                      style={{ boxShadow: '0 0 4px var(--color-accent)' }}
                      animate={{ width: `${buildProgress}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                  </div>
                  <span className="text-[8px] text-text-dim font-mono">
                    {completedNodes}/{totalNodes}
                  </span>
                </div>
              )}

              <button
                onClick={onClose}
                className="p-1 text-text-dim hover:text-white transition-colors rounded"
                title="Minimize terminal"
              >
                <ChevronDown size={14} />
              </button>
              <button
                onClick={onClose}
                className="p-1 text-text-dim hover:text-[#ff003c] transition-colors rounded"
                title="Close terminal"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {/* Log feed */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto py-1 space-y-0.5"
            style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}
          >
            {globalLogs.length === 0 ? (
              <div className="flex items-center justify-center h-full text-[10px] text-text-dim opacity-30 uppercase tracking-widest">
                Awaiting build signal...
              </div>
            ) : (
              globalLogs.map((log) => {
                const Icon  = LOG_ICON[log.type];
                const color = LOG_COLOR[log.type];
                return (
                  <div
                    key={log.id}
                    className={`flex items-start gap-2 px-4 py-[3px] hover:bg-white/[0.015] ${
                      log.type === 'system'
                        ? 'border-t border-b border-border-subtle my-0.5 py-1.5'
                        : ''
                    }`}
                  >
                    <Icon size={9} className={`${color} mt-0.5 shrink-0`} />
                    <div className="min-w-0 flex-1">
                      <div className={`text-[10px] leading-tight ${color} truncate`}>
                        {log.message}
                      </div>
                      {log.file && (
                        <div className="text-[8px] text-text-dim opacity-40 truncate">
                          {log.file}
                        </div>
                      )}
                    </div>
                    <div className="text-[7px] text-text-dim opacity-25 shrink-0 mt-0.5">
                      {new Date(log.timestamp).toLocaleTimeString('en', {
                        hour12: false,
                        second: '2-digit',
                        minute: '2-digit',
                        hour:   '2-digit',
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
