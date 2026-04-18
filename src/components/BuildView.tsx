import React, { useEffect, useMemo } from 'react';
import { ReactFlow, Background, BackgroundVariant, MiniMap } from '@xyflow/react';
import { useGraphStore } from '../store/useGraphStore';
import { useBuildStore } from '../store/useBuildStore';
import { useOMXStream } from '../hooks/useOMXStream';
import { fetchOmxStatus, loadSession } from '../lib/api';
import CyberNodeBuild from './CyberNodeBuild';
import BuildConsole from './BuildConsole';
import { motion } from 'motion/react';
import { XCircle, Hammer } from 'lucide-react';
import '@xyflow/react/dist/style.css';

const nodeTypes = { cyber: CyberNodeBuild };

export default function BuildView() {
  const { graphData, activeSessionId, setAppMode, hydrateSession } = useGraphStore();
  const isBuilding = useBuildStore((s) => s.isBuilding);
  const buildStatus = useBuildStore((s) => s.buildStatus);
  const buildProgress = useBuildStore((s) => s.buildProgress);
  const completedNodes = useBuildStore((s) => s.completedNodes);
  const totalNodes = useBuildStore((s) => s.totalNodes);
  const nodeStates = useBuildStore((s) => s.nodeStates);
  const hydrateBuildLifecycle = useBuildStore((s) => s.hydrateBuildLifecycle);

  useEffect(() => {
    if (!activeSessionId) return;
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
          return;
        }

        const session = await loadSession(activeSessionId);
        if (cancelled) return;

        hydrateSession(session);
        useBuildStore.getState().initNodeStates(session.graph.nodes.map((n) => n.id));
        hydrateBuildLifecycle(remote);
      } catch (error) {
        console.warn('[BuildView] Failed to hydrate remote OMX status:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeSessionId, buildStatus, hydrateBuildLifecycle, hydrateSession]);

  // Only start SSE stream when a build is actually in progress
  useOMXStream(activeSessionId, isBuilding);

  // Convert graph data → XYFlow format
  // Nodes are computed from graphData; CyberNodeBuild reads its own state from useBuildStore
  const nodes = useMemo(
    () =>
      graphData.nodes.map((n, i) => ({
        id: n.id,
        type: 'cyber' as const,
        position: (n as any).position ?? { x: (i % 4) * 220 + 60, y: Math.floor(i / 4) * 160 + 60 },
        data: { label: n.label, type: n.type, status: n.status, description: n.description },
        draggable: false,
        selectable: false,
      })),
    [graphData.nodes],
  );

  // Edges re-compute on every nodeStates change so they illuminate in real-time
  const edges = useMemo(
    () =>
      graphData.links.map((l) => {
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
      }),
    [graphData.links, nodeStates],
  );

  const exitBuild = () => {
    setAppMode('architect');
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
            {completedNodes}/{totalNodes} nodes · {buildProgress}%
          </span>
        </div>

        {/* Exit build mode */}
        <button
          onClick={exitBuild}
          className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-text-dim hover:text-white transition-colors border border-border-subtle rounded px-2 py-1 hover:border-white/20"
        >
          <XCircle size={11} />
          Exit
        </button>
      </div>

      {/* Canvas + Console split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Blueprint Canvas */}
        <div className="flex-1 relative overflow-hidden">
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
        </div>

        {/* Build Console */}
        <div className="w-[300px] shrink-0 flex flex-col overflow-hidden border-l border-border-subtle">
          <BuildConsole />
        </div>
      </div>
    </div>
  );
}
