import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useBuildStore, type BuildLogEntry } from '../store/useBuildStore';
import { useGraphStore } from '../store/useGraphStore';
import { reassignOmxTaskOwnership, recordOmxOperationalMessage, retryOmxTask } from '../lib/api';
import { Terminal, CheckCircle2, AlertCircle, ArrowRight, Cpu, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

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
  const { activeSessionId, activeSessionName, activeSessionSource, graphData, manifesto, architecture, projectContext, importMeta } = useGraphStore();
  const { globalLogs, buildProgress, isBuilding, buildStatus, buildResult, completedNodes, totalNodes, activeNodeId, nodeStates, activeWaveId, activeTasks, workerCount, wavesTotal, wavesCompleted, verifyPendingCount, mergePendingCount, tasks, workers, mergeReceipts } = useBuildStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [terminalLogsExpanded, setTerminalLogsExpanded] = React.useState(false);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [globalLogs.length]);

  const activeState = activeNodeId ? nodeStates[activeNodeId] : null;
  const rejectedMerges = Object.values(mergeReceipts).filter((receipt) => !receipt.applied);
  const logRenderLimit = isBuilding ? 240 : 80;
  const visibleLogs = globalLogs.length > logRenderLimit ? globalLogs.slice(-logRenderLimit) : globalLogs;
  const hiddenLogCount = globalLogs.length - visibleLogs.length;
  const docsNeedReview = buildResult?.documentation?.quality.status === 'needs_review';
  const terminalLogsCollapsed = Boolean(buildResult) && !isBuilding;

  const handleRetryTask = async (taskId: string) => {
    if (!activeSessionId) return;
    try {
      await recordOmxOperationalMessage(activeSessionId, {
        role: 'user',
        action: 'retry',
        message: `Retry requested from BuildConsole for ${taskId}.`,
      });
      const build = await retryOmxTask(activeSessionId, taskId, {
        name: activeSessionName,
        source: activeSessionSource,
        graph: graphData,
        manifesto,
        architecture,
        projectContext,
        importMeta,
      });
      const store = useBuildStore.getState();
      store.resetBuild();
      store.initNodeStates(graphData.nodes.map((node) => node.id));
      store.startBuild(build.status);
      store.hydrateBuildLifecycle(build);
      toast.success(`Retried ${taskId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to retry OMX task');
    }
  };

  const handleReassignTask = async (taskId: string) => {
    if (!activeSessionId) return;
    try {
      await recordOmxOperationalMessage(activeSessionId, {
        role: 'user',
        action: 'reassign_owner',
        message: `Take ownership requested from BuildConsole for ${taskId}.`,
      });
      const build = await reassignOmxTaskOwnership(activeSessionId, taskId, {
        name: activeSessionName,
        source: activeSessionSource,
        graph: graphData,
        manifesto,
        architecture,
        projectContext,
        importMeta,
      });
      const store = useBuildStore.getState();
      store.resetBuild();
      store.initNodeStates(graphData.nodes.map((node) => node.id));
      store.startBuild(build.status);
      store.hydrateBuildLifecycle(build);
      toast.success(`Ownership reassigned to ${taskId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reassign OMX ownership');
    }
  };

  const logFeed = (
    <div
      ref={scrollRef}
      className={terminalLogsCollapsed
        ? 'max-h-[220px] overflow-y-auto custom-scrollbar py-2 space-y-0.5'
        : 'flex-1 overflow-y-auto custom-scrollbar py-2 space-y-0.5'}
    >
      {globalLogs.length === 0 ? (
        <div className="flex items-center justify-center h-full min-h-[96px] text-[11px] text-text-dim opacity-30 uppercase tracking-widest">
          Awaiting build signal...
        </div>
      ) : (
        <>
          {hiddenLogCount > 0 && (
            <div className="mx-4 mb-2 rounded border border-white/10 bg-white/[0.03] px-3 py-2 text-[8px] uppercase tracking-[0.18em] text-text-dim">
              Showing latest {visibleLogs.length} of {globalLogs.length} logs
            </div>
          )}
          <AnimatePresence initial={false}>
            {visibleLogs.map((log) => {
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
        </>
      )}
    </div>
  );

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

      {(wavesTotal > 0 || workerCount > 0) && (
        <div className="border-b border-border-subtle px-4 py-3 bg-white/[0.02] shrink-0">
          <div className="grid grid-cols-2 gap-2 text-[9px] uppercase tracking-[0.18em] text-text-dim">
            <div>Wave: <span className="text-white">{activeWaveId || `${wavesCompleted}/${wavesTotal}`}</span></div>
            <div>Workers: <span className="text-white">{workerCount}</span></div>
            <div>Verify pending: <span className="text-white">{verifyPendingCount}</span></div>
            <div>Merge pending: <span className="text-white">{mergePendingCount}</span></div>
          </div>
          {activeTasks.length > 0 && (
            <div className="mt-3 space-y-1">
              {activeTasks.map((taskId) => {
                const task = tasks[taskId];
                const worker = task?.workerId ? workers[task.workerId] : null;
                if (!task) return null;
                return (
                  <div key={taskId} className="rounded border border-white/10 bg-black/20 px-2 py-1">
                    <div className="text-[10px] text-white font-mono">{task.label}</div>
                    <div className="text-[8px] uppercase tracking-[0.18em] text-text-dim">
                      {task.status} · {worker?.workerId || 'unassigned'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {rejectedMerges.length > 0 && (
        <div className="border-b border-[#ff5c7a]/20 bg-[#ff5c7a]/5 px-4 py-3 shrink-0">
          <div className="text-[9px] uppercase tracking-[0.22em] text-[#ff5c7a] mb-2">
            Merge Rejections
          </div>
          <div className="space-y-2">
            {rejectedMerges.map((receipt) => {
              const task = tasks[receipt.taskId];
              return (
                <div key={receipt.taskId} className="rounded border border-[#ff5c7a]/20 bg-black/20 px-2 py-2">
                  <div className="text-[10px] text-white font-mono">
                    {task?.label || receipt.taskId}
                  </div>
                  <div className="text-[8px] uppercase tracking-[0.18em] text-[#ff5c7a] mt-1">
                    {receipt.reason || 'Ownership or merge validation failed'}
                  </div>
                  <div className="mt-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleRetryTask(receipt.taskId)}
                        className="rounded border border-[#ff5c7a]/30 px-2 py-1 text-[8px] uppercase tracking-[0.18em] text-[#ff5c7a] transition-colors hover:bg-[#ff5c7a]/10"
                      >
                        Retry task
                      </button>
                      <button
                        onClick={() => handleReassignTask(receipt.taskId)}
                        className="rounded border border-[#ffcb6b]/30 px-2 py-1 text-[8px] uppercase tracking-[0.18em] text-[#ffcb6b] transition-colors hover:bg-[#ffcb6b]/10"
                      >
                        Take ownership & retry
                      </button>
                    </div>
                  </div>
                  {receipt.ownerCandidates && receipt.ownerCandidates.length > 0 && (
                    <div className="mt-2 text-[8px] text-text-dim font-mono">
                      current owner candidates: {receipt.ownerCandidates.join(', ')}
                    </div>
                  )}
                  {receipt.rejectedPaths.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {receipt.rejectedPaths.map((entry) => (
                        <div key={entry} className="text-[8px] text-text-dim font-mono truncate">
                          {entry}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {terminalLogsCollapsed ? (
        <div className="border-b border-border-subtle bg-white/[0.015] px-4 py-3">
          <button
            type="button"
            onClick={() => setTerminalLogsExpanded((value) => !value)}
            className="flex w-full items-center justify-between gap-3 rounded border border-white/10 bg-black/20 px-3 py-2 text-left transition hover:border-white/20"
          >
            <span>
              <span className="block text-[9px] uppercase tracking-[0.24em] text-text-dim">Build log</span>
              <span className="mt-1 block text-[10px] leading-4 text-white/75">
                Hidden after completion to keep the handoff light.
              </span>
            </span>
            <span className="shrink-0 text-[8px] uppercase tracking-[0.2em] text-accent">
              {terminalLogsExpanded ? 'Hide' : `Show ${visibleLogs.length}`}
            </span>
          </button>
          {terminalLogsExpanded && (
            <div className="mt-3 rounded border border-white/10 bg-black/20">
              {logFeed}
            </div>
          )}
        </div>
      ) : logFeed}

      {/* Build Result Screen */}
      {buildResult && buildStatus !== 'stopped' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`border-t p-4 shrink-0 ${
            buildStatus === 'failed'
              ? 'border-[#ff5c7a]/20 bg-[#ff5c7a]/5'
              : docsNeedReview
                ? 'border-[#ffcb6b]/20 bg-[#ffcb6b]/5'
              : 'border-[#50fa7b]/20 bg-[#50fa7b]/5'
          }`}
        >
          <div className={`text-[9px] uppercase tracking-[0.3em] mb-3 flex items-center gap-2 ${
            buildStatus === 'failed' ? 'text-[#ff5c7a]' : docsNeedReview ? 'text-[#ffcb6b]' : 'text-[#50fa7b]'
          }`}>
            <CheckCircle2 size={10} />
            {buildStatus === 'failed' ? 'Mission Ended With Failures' : docsNeedReview ? 'Mission Complete With Warnings' : 'Mission Complete'}
          </div>
          {buildResult.designGateStatus && (
            <div className={`mb-3 rounded border px-3 py-2 text-[9px] uppercase tracking-[0.22em] ${
              buildResult.designGateStatus === 'passed'
                ? 'border-[#50fa7b]/30 bg-[#50fa7b]/10 text-[#50fa7b]'
                : 'border-[#ff5c7a]/30 bg-[#ff5c7a]/10 text-[#ff5c7a]'
            }`}>
              21st design gate {buildResult.designGateStatus}
              {typeof buildResult.designScore === 'number' ? ` · ${buildResult.designScore}` : ''}
            </div>
          )}
          {buildResult.systemVerify && (
            <div className={`mb-3 rounded border px-3 py-2 text-[9px] uppercase tracking-[0.22em] ${
              buildResult.systemVerify.status === 'passed'
                ? 'border-[#50fa7b]/30 bg-[#50fa7b]/10 text-[#50fa7b]'
                : buildResult.systemVerify.status === 'failed'
                  ? 'border-[#ff5c7a]/30 bg-[#ff5c7a]/10 text-[#ff5c7a]'
                  : 'border-white/10 bg-white/[0.03] text-text-dim'
            }`}>
              final system verify {buildResult.systemVerify.status}
              {buildResult.systemVerify.command ? ` · ${buildResult.systemVerify.command}` : ''}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className={`text-[13px] font-bold ${buildStatus === 'failed' ? 'text-[#ff5c7a]' : 'text-[#50fa7b]'}`}>{buildResult.totalFiles}</div>
              <div className="text-[7px] uppercase tracking-widest text-text-dim">Files</div>
            </div>
            <div>
              <div className={`text-[13px] font-bold ${buildStatus === 'failed' ? 'text-[#ff5c7a]' : 'text-[#50fa7b]'}`}>{buildResult.totalLines.toLocaleString()}</div>
              <div className="text-[7px] uppercase tracking-widest text-text-dim">Lines</div>
            </div>
            <div>
              <div className={`text-[13px] font-bold ${buildStatus === 'failed' ? 'text-[#ff5c7a]' : 'text-[#50fa7b]'}`}>{(buildResult.elapsedMs / 1000).toFixed(1)}s</div>
              <div className="text-[7px] uppercase tracking-widest text-text-dim">Time</div>
            </div>
          </div>
          {buildResult.documentation && (
            <div className="mt-3 rounded border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className="text-[8px] uppercase tracking-[0.22em] text-text-dim">Generated Docs</div>
              <div className={`mt-2 inline-flex rounded border px-2 py-1 text-[8px] uppercase tracking-[0.2em] ${
                buildResult.documentation.quality.status === 'passed'
                  ? 'border-[#50fa7b]/30 bg-[#50fa7b]/10 text-[#50fa7b]'
                  : buildResult.documentation.quality.status === 'failed'
                    ? 'border-[#ff5c7a]/30 bg-[#ff5c7a]/10 text-[#ff5c7a]'
                    : 'border-[#ffcb6b]/30 bg-[#ffcb6b]/10 text-[#ffcb6b]'
              }`}>
                docs {buildResult.documentation.quality.status} · {buildResult.documentation.quality.score}/100
              </div>
              <div className="mt-2 text-[10px] leading-5 text-white">
                {buildResult.documentation.readmePath}
              </div>
              <div className="text-[10px] leading-5 text-white/80">
                {buildResult.documentation.wikiPath}
              </div>
              <div className="text-[10px] leading-5 text-white/80">
                {buildResult.documentation.dossierPath}
              </div>
              {buildResult.documentation.quality.findings[0] && (
                <div className="mt-2 text-[10px] leading-5 text-text-dim">
                  {buildResult.documentation.quality.findings[0]}
                </div>
              )}
            </div>
          )}
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
