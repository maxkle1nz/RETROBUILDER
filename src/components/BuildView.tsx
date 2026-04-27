import React, { useEffect, useMemo } from 'react';
import { ReactFlow, Background, BackgroundVariant, MiniMap } from '@xyflow/react';
import { useGraphStore } from '../store/useGraphStore';
import { useBuildStore, type OMXBuildEvent } from '../store/useBuildStore';
import { useOMXStream } from '../hooks/useOMXStream';
import { fetchOmxHistory, fetchOmxStatus, loadSession, recordOmxOperationalMessage, resumeOmxBuild } from '../lib/api';
import CyberNodeBuild from './CyberNodeBuild';
import BuildConsole from './BuildConsole';
import BuildCompletionReport from './BuildCompletionReport';
import { motion } from 'motion/react';
import { XCircle, Hammer, Sparkles, RotateCcw, FolderOpen, PenTool } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import { toast } from 'sonner';

const nodeTypes = { cyber: CyberNodeBuild };

export default function BuildView() {
  const { graphData, activeSessionId, activeSessionName, activeSessionSource, manifesto, architecture, projectContext, importMeta, setAppMode, hydrateSession, openSessionLauncher } = useGraphStore();
  const isBuilding = useBuildStore((s) => s.isBuilding);
  const buildStatus = useBuildStore((s) => s.buildStatus);
  const buildProgress = useBuildStore((s) => s.buildProgress);
  const completedNodes = useBuildStore((s) => s.completedNodes);
  const totalNodes = useBuildStore((s) => s.totalNodes);
  const resumeAvailable = useBuildStore((s) => s.resumeAvailable);
  const resumeReason = useBuildStore((s) => s.resumeReason);
  const activeWaveId = useBuildStore((s) => s.activeWaveId);
  const wavesTotal = useBuildStore((s) => s.wavesTotal);
  const wavesCompleted = useBuildStore((s) => s.wavesCompleted);
  const workerCount = useBuildStore((s) => s.workerCount);
  const verifyPendingCount = useBuildStore((s) => s.verifyPendingCount);
  const mergePendingCount = useBuildStore((s) => s.mergePendingCount);
  const rejectedMergeCount = useBuildStore((s) => Object.values(s.mergeReceipts).filter((receipt) => !receipt.applied).length);
  const activeTasks = useBuildStore((s) => s.activeTasks);
  const nodeStates = useBuildStore((s) => s.nodeStates);
  const hydrateBuildLifecycle = useBuildStore((s) => s.hydrateBuildLifecycle);
  const buildResult = useBuildStore((s) => s.buildResult);
  const [resuming, setResuming] = React.useState(false);
  const hasBlueprintModules = graphData.nodes.length > 0;
  const showCompletionReport = Boolean(buildResult?.documentation);

  useEffect(() => {
    const store = useBuildStore.getState();
    if (!activeSessionId) {
      store.resetBuild();
      return;
    }
    if (buildStatus === 'running' || buildStatus === 'queued' || buildStatus === 'stopping') return;

    let cancelled = false;

    void (async () => {
      try {
        const remote = await fetchOmxStatus(activeSessionId);
        if (cancelled) return;

        const shouldHydrateRemoteLifecycle =
          remote.status === 'queued' ||
          remote.status === 'running' ||
          remote.status === 'stopping' ||
          remote.status === 'stopped' ||
          remote.status === 'succeeded' ||
          remote.status === 'failed';

        // Preserve terminal and in-flight lifecycle plus persisted terminal summaries on builder reentry.

        if (!shouldHydrateRemoteLifecycle) {
          store.resetBuild();
          store.initNodeStates(graphData.nodes.map((n) => n.id));
          return;
        }

        store.resetBuild();
        if (remote.source !== 'session-draft' || graphData.nodes.length === 0) {
          const session = await loadSession(activeSessionId);
          if (cancelled) return;
          hydrateSession(session);
          store.initNodeStates(session.graph.nodes.map((n) => n.id));
        } else {
          store.initNodeStates(graphData.nodes.map((n) => n.id));
        }
        hydrateBuildLifecycle(remote);

        if (remote.buildId) {
          const history = await fetchOmxHistory(activeSessionId, remote.buildId);
          for (const event of history) {
            store.processBuildEvent(event as OMXBuildEvent);
          }
        }
      } catch (error) {
        console.warn('[BuildView] Failed to hydrate remote OMX status:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeSessionId, buildStatus, graphData.nodes, hydrateBuildLifecycle, hydrateSession]);

  // Only start SSE stream when a build is actually in progress
  useOMXStream(activeSessionId, isBuilding);

  // Convert graph data → XYFlow format
  // Nodes are computed from graphData; CyberNodeBuild reads its own state from useBuildStore
  const nodes = useMemo(
    () => {
      if (showCompletionReport) return [];
      return graphData.nodes.map((n, i) => ({
        id: n.id,
        type: 'cyber' as const,
        position: n.position ?? { x: (i % 4) * 220 + 60, y: Math.floor(i / 4) * 160 + 60 },
        data: { label: n.label, type: n.type, status: n.status, description: n.description },
        draggable: false,
        selectable: false,
      }));
    },
    [graphData.nodes, showCompletionReport],
  );

  // Edges re-compute on every nodeStates change so they illuminate in real-time
  const edges = useMemo(
    () => {
      if (showCompletionReport) return [];
      return graphData.links.map((l) => {
        const sourceState = nodeStates[l.source];
        const targetState = nodeStates[l.target];
        const isLive = sourceState?.status === 'complete' && targetState?.status !== 'dormant';
        return {
          id: `${l.source}->${l.target}`,
          source: l.source,
          target: l.target,
          animated: isLive,
          style: {
            stroke: isLive ? 'rgba(80,250,123,0.5)' : 'rgba(255,255,255,0.06)',
            strokeWidth: isLive ? 1.5 : 1,
            transition: 'stroke 0.6s ease, stroke-width 0.6s ease',
          },
        };
      });
    },
    [graphData.links, nodeStates, showCompletionReport],
  );

  const exitBuild = () => {
    setAppMode('architect');
  };

  const handleResume = async () => {
    if (!activeSessionId) return;
    setResuming(true);
    try {
      await recordOmxOperationalMessage(activeSessionId, {
        role: 'user',
        action: 'resume',
        message: `Resume requested from BuildView (${resumeReason || 'manual'})`,
      });
      const build = await resumeOmxBuild(activeSessionId, {
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
      hydrateBuildLifecycle(build);
      toast.success(`Resumed OMX build ${build.buildId.slice(0, 8)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to resume OMX build');
    } finally {
      setResuming(false);
    }
  };

  // Minimap node color based on build status
  const minimapNodeColor = (node: { id: string }) => {
    const st = nodeStates[node.id]?.status;
    if (st === 'complete')  return '#50fa7b';
    if (st === 'building')  return '#00f2ff';
    if (st === 'queued')    return '#ffcb6b';
    if (st === 'error')     return '#ff003c';
    return '#1a1f2b';
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#040507]">
      {/* Build Progress Bar Header */}
      <div className="h-[46px] border-b border-border-subtle flex items-center gap-4 px-4 shrink-0 bg-[#06080b]">
        <div className="flex items-center gap-2">
          <Hammer size={13} className={isBuilding ? 'text-accent animate-pulse' : 'text-[#50fa7b]'} />
          <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-text-main">
            Build Mode
          </span>
          {wavesTotal > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[8px] uppercase tracking-[0.2em] text-text-dim">
              {activeWaveId || 'wave-idle'} · {wavesCompleted}/{wavesTotal}
            </span>
          )}
          {workerCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[8px] uppercase tracking-[0.2em] text-text-dim">
              workers {workerCount}
            </span>
          )}
          {(verifyPendingCount > 0 || mergePendingCount > 0) && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[8px] uppercase tracking-[0.2em] text-text-dim">
              verify {verifyPendingCount} · merge {mergePendingCount}
            </span>
          )}
          {rejectedMergeCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#ff5c7a]/30 bg-[#ff5c7a]/10 px-2 py-1 text-[8px] uppercase tracking-[0.2em] text-[#ff5c7a]">
              merge rejected · {rejectedMergeCount}
            </span>
          )}
          {buildResult?.designGateStatus && (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[8px] uppercase tracking-[0.2em] ${
              buildResult.designGateStatus === 'passed'
                ? 'border-[#50fa7b]/30 bg-[#50fa7b]/10 text-[#50fa7b]'
                : buildResult.designGateStatus === 'failed'
                  ? 'border-[#ff5c7a]/30 bg-[#ff5c7a]/10 text-[#ff5c7a]'
                  : 'border-[#ffcb6b]/30 bg-[#ffcb6b]/10 text-[#ffcb6b]'
            }`}>
              <Sparkles size={10} />
              21ST {buildResult.designGateStatus}
              {typeof buildResult.designScore === 'number' ? ` · ${buildResult.designScore}` : ''}
            </span>
          )}
        </div>

        {/* Global progress bar */}
        <div className="flex-1 flex items-center gap-3">
          <div className="flex-1 h-[3px] bg-white/5 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: buildProgress === 100
                  ? '#50fa7b'
                  : 'linear-gradient(90deg, var(--color-accent) 0%, #7b4fff 100%)',
                boxShadow: buildProgress === 100
                  ? '0 0 8px #50fa7b'
                  : '0 0 8px var(--color-accent)',
              }}
              animate={{ width: `${buildProgress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
          <span className="text-[9px] font-mono text-text-dim shrink-0">
            {hasBlueprintModules ? `${completedNodes}/${totalNodes} nodes · ${buildProgress}%` : 'No modules loaded'}
          </span>
          {activeTasks.length > 0 && (
            <span className="text-[9px] font-mono text-text-dim shrink-0">
              task {activeTasks.join(', ')}
            </span>
          )}
        </div>

        {/* Exit build mode */}
        <div className="flex items-center gap-2">
          {resumeAvailable && (
            <button
              onClick={handleResume}
              disabled={resuming}
              className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-[#ffcb6b] hover:text-white transition-colors border border-[#ffcb6b]/30 rounded px-2 py-1 hover:border-white/20 disabled:opacity-50"
            >
              <RotateCcw size={11} />
              {resuming ? 'Resuming' : `Resume ${resumeReason || 'build'}`}
            </button>
          )}
          <button
            onClick={exitBuild}
            className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-text-dim hover:text-white transition-colors border border-border-subtle rounded px-2 py-1 hover:border-white/20"
          >
            <XCircle size={11} />
            Exit
          </button>
        </div>
      </div>

      {/* Canvas + Console split */}
      <div className="flex-1 flex min-h-0 flex-col overflow-hidden xl:flex-row">
        {/* Blueprint Canvas */}
        <div className="relative min-h-[360px] flex-1 overflow-hidden xl:min-h-0">
          {!showCompletionReport ? (
            <>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                fitView
                fitViewOptions={{ padding: 0.15 }}
                minZoom={0.2}
                maxZoom={2}
                proOptions={{ hideAttribution: true }}
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={28}
                  size={1}
                  color="rgba(255,255,255,0.04)"
                />
                <MiniMap
                  nodeColor={minimapNodeColor}
                  maskColor="rgba(4,5,7,0.85)"
                  style={{
                    background: '#060809',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '2px',
                  }}
                />
              </ReactFlow>

              {/* Dormant overlay — fades as build progresses */}
              <motion.div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'radial-gradient(circle at center, rgba(4,5,7,0) 40%, rgba(4,5,7,0.7) 100%)',
                }}
                animate={{ opacity: buildProgress > 50 ? 0 : 1 - buildProgress / 100 }}
                transition={{ duration: 1 }}
              />

              {!hasBlueprintModules && (
                <div className="absolute inset-0 z-10 flex items-center justify-center px-6 pointer-events-auto">
                  <motion.div
                    initial={{ opacity: 0, y: 14, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    className="relative w-full max-w-[520px] overflow-hidden rounded-[28px] border border-[#50fa7b]/20 bg-[#06100c]/85 p-7 text-center shadow-[0_28px_90px_rgba(0,0,0,0.5)] backdrop-blur-xl"
                  >
                    <div
                      aria-hidden="true"
                      className="absolute inset-x-8 -top-24 h-48 rounded-full bg-[#50fa7b]/15 blur-3xl"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-[linear-gradient(135deg,rgba(80,250,123,0.08),transparent_45%,rgba(0,242,255,0.06))]"
                    />

                    <div className="relative">
                      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#50fa7b]/25 bg-[#50fa7b]/10 text-[#50fa7b] shadow-[0_0_32px_rgba(80,250,123,0.16)]">
                        <Hammer size={22} />
                      </div>
                      <div className="mb-3 text-[10px] font-mono uppercase tracking-[0.35em] text-[#50fa7b]/80">
                        BU1LDER STANDBY
                      </div>
                      <h2 className="text-balance text-2xl font-semibold tracking-tight text-white">
                        Load a blueprint before the build lane starts
                      </h2>
                      <p className="mx-auto mt-3 max-w-[400px] text-sm leading-6 text-text-dim">
                        The build engine is online, but there are no modules to execute yet.
                        Open a saved session or return to Architect to shape the graph first.
                      </p>

                      <div className="mt-6 grid gap-2 rounded-2xl border border-white/10 bg-black/20 p-2 text-left sm:grid-cols-3">
                        {[
                          ['01', 'Blueprint'],
                          ['02', 'Readiness'],
                          ['03', 'OMX build'],
                        ].map(([step, label]) => (
                          <div key={step} className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
                            <div className="text-[9px] font-mono text-[#50fa7b]/70">{step}</div>
                            <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-text-main">{label}</div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                        <button
                          type="button"
                          onClick={openSessionLauncher}
                          className="inline-flex items-center gap-2 rounded-full border border-[#50fa7b]/30 bg-[#50fa7b]/12 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#50fa7b] transition hover:border-[#50fa7b]/60 hover:bg-[#50fa7b]/18 hover:text-white"
                        >
                          <FolderOpen size={13} />
                          Open sessions
                        </button>
                        <button
                          type="button"
                          onClick={exitBuild}
                          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-text-dim transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
                        >
                          <PenTool size={13} />
                          Back to Architect
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </div>
              )}
            </>
          ) : (
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(0,242,255,0.08),transparent_34%),linear-gradient(135deg,rgba(80,250,123,0.04),rgba(4,5,7,0.96)_42%,rgba(4,5,7,1))]"
            />
          )}

          {buildResult?.documentation && (
            <BuildCompletionReport
              documentation={
                buildResult.runnableManifest && !buildResult.documentation.runnableManifest
                  ? { ...buildResult.documentation, runnableManifest: buildResult.runnableManifest }
                  : buildResult.documentation
              }
              buildStatus={buildStatus}
              sessionId={activeSessionId}
            />
          )}
        </div>

        {!showCompletionReport && (
          <div className="flex h-[280px] w-full shrink-0 flex-col overflow-hidden border-t border-border-subtle xl:border-l xl:border-t-0 xl:h-auto xl:w-[300px]">
            <BuildConsole />
          </div>
        )}
      </div>
    </div>
  );
}
