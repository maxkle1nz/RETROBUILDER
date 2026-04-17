import React, { useEffect, useCallback, useState, useMemo } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  MarkerType,
  BackgroundVariant,
  Panel,
  useReactFlow,
  ReactFlowProvider,
  Connection,
  addEdge as rfAddEdge,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Maximize, Network, Undo2, Redo2 } from 'lucide-react';
import { useStore } from 'zustand';

import { useGraphStore } from '../store/useGraphStore';
import CyberNode from './CyberNode';
import NodeContextMenu from './NodeContextMenu';
import { getLayoutedElements } from '../lib/layout';

const nodeTypes = {
  cyber: CyberNode,
};

/** Maps node type → neon edge colour */
const TYPE_EDGE_COLOR: Record<string, string> = {
  frontend: '#00f2ff',
  backend:  '#b026ff',
  database: '#ff9d00',
  security: '#ff003c',
  external: '#00ff66',
};

function hexWithAlpha(hex: string, alpha: number): string {
  // Convert #rrggbb to rgba
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function buildEdgeStyle(
  edge: Edge,
  activeNodeId: string | null,
  typeColorMap: Record<string, string>,
): Partial<Edge> {
  const sourceColor = typeColorMap[edge.source] ?? 'var(--color-accent)';
  const isHex = sourceColor.startsWith('#');

  // When no node is active → show type color at 35% opacity
  if (activeNodeId === null) {
    const idleColor = isHex ? hexWithAlpha(sourceColor, 0.35) : 'rgba(0,242,255,0.35)';
    return {
      animated: false,
      style: { stroke: idleColor, strokeWidth: 1 },
      markerEnd: { type: MarkerType.ArrowClosed, color: idleColor },
      label: undefined,
      labelStyle: undefined,
      labelBgStyle: undefined,
    };
  }

  const isConnected = edge.source === activeNodeId || edge.target === activeNodeId;

  if (isConnected) {
    // Full neon glow on connected edges
    return {
      animated: true,
      style: {
        stroke: sourceColor,
        strokeWidth: 2,
        filter: `drop-shadow(0 0 4px ${sourceColor})`,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: sourceColor },
      labelStyle: {
        fill: sourceColor,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '0.08em',
      },
      labelBgStyle: {
        fill: 'rgba(5,6,8,0.82)',
        stroke: `${sourceColor}55`,
      },
    };
  }

  // Non-connected: dim to 15% but keep type color
  const dimColor = isHex ? hexWithAlpha(sourceColor, 0.15) : 'rgba(0,242,255,0.15)';
  return {
    animated: false,
    style: { stroke: dimColor, strokeWidth: 1 },
    markerEnd: { type: MarkerType.ArrowClosed, color: dimColor },
    label: undefined,
    labelStyle: undefined,
    labelBgStyle: undefined,
  };
}

function Flow() {
  const {
    graphData,
    setSelectedNode,
    addLink,
    setSelectedNodes,
    clearNodeSelection,
    selectedNode,
  } = useGraphStore();

  const undo = useGraphStore.temporal.getState().undo;
  const redo = useGraphStore.temporal.getState().redo;
  const pastStates  = useStore(useGraphStore.temporal, (s) => s.pastStates);
  const futureStates = useStore(useGraphStore.temporal, (s) => s.futureStates);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { fitView, setCenter, getNodes } = useReactFlow();

  // Which node is currently being hovered
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const activeNodeId = selectedNode?.id ?? hoveredNodeId;

  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; nodeId: string; nodeLabel: string
  } | null>(null);

  // Map nodeId → typeColor (rebuilt when graphData changes)
  const typeColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const n of graphData.nodes) {
      map[n.id] = TYPE_EDGE_COLOR[n.type ?? ''] ?? 'var(--color-accent)';
    }
    return map;
  }, [graphData.nodes]);

  // Re-style all edges reactively when hovered / selected node changes
  useEffect(() => {
    setEdges((prev) =>
      prev.map((e) => {
        const updates = buildEdgeStyle(e, activeNodeId, typeColorMap);
        return { ...e, ...updates };
      }),
    );
  }, [activeNodeId, typeColorMap, setEdges]);

  const handleAutoLayout = useCallback(() => {
    const { nodes: ln, edges: le } = getLayoutedElements(nodes, edges, 'TB');
    setNodes([...ln]);
    setEdges([...le]);
    setTimeout(() => fitView({ duration: 800 }), 50);
  }, [nodes, edges, setNodes, setEdges, fitView]);

  // Transform graphData into React Flow format
  useEffect(() => {
    if (!graphData || graphData.nodes.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const initialNodes = graphData.nodes.map((n) => ({
      id: n.id,
      type: 'cyber',
      position: { x: 0, y: 0 },
      data: n,
    })) as unknown as Node[];

    const initialEdges: Edge[] = graphData.links.map((l, idx) => {
      const srcColor = TYPE_EDGE_COLOR[(graphData.nodes.find(n => n.id === l.source)?.type ?? '')] ?? 'var(--color-accent)';
      const isHex = srcColor.startsWith('#');
      const idleColor = isHex ? hexWithAlpha(srcColor, 0.35) : 'rgba(0,242,255,0.35)';
      return {
        id: `e-${l.source}-${l.target}-${idx}`,
        source: l.source,
        target: l.target,
        label: l.label,
        animated: false,
        style: { stroke: idleColor, strokeWidth: 1 },
        markerEnd: { type: MarkerType.ArrowClosed, color: idleColor },
      };
    });

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      initialNodes,
      initialEdges,
      'TB',
    );

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
    setTimeout(() => fitView({ duration: 800 }), 100);
  }, [graphData, setNodes, setEdges, fitView]);

  // Focus on a node via store (for Spotlight)
  const focusNodeId = useGraphStore((s) => s.focusNodeId);
  const clearFocusNodeId = useGraphStore((s) => s.clearFocusNodeId);
  useEffect(() => {
    if (!focusNodeId) return;
    const allNodes = getNodes();
    const target = allNodes.find((n) => n.id === focusNodeId);
    if (target) {
      setCenter(
        target.position.x + (target.measured?.width ?? 240) / 2,
        target.position.y + (target.measured?.height ?? 120) / 2,
        { zoom: 1.4, duration: 600 },
      );
    }
    clearFocusNodeId();
  }, [focusNodeId, getNodes, setCenter, clearFocusNodeId]);

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    setSelectedNode(node.data as any);
    useGraphStore.getState().openRightPanel();
  }, [setSelectedNode]);

  const onNodeMouseEnter = useCallback((_: unknown, node: Node) => {
    setHoveredNodeId(node.id);
  }, []);

  const onNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      nodeId: node.id,
      nodeLabel: (node.data as any)?.label || node.id,
    });
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setContextMenu(null);
    clearNodeSelection();
    useGraphStore.getState().closeRightPanel();
  }, [setSelectedNode, clearNodeSelection]);

  const onSelectionChange = useCallback(({ nodes: sel }: OnSelectionChangeParams) => {
    setSelectedNodes(sel.map((n) => n.id));
  }, [setSelectedNodes]);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) =>
      rfAddEdge(
        {
          ...params,
          animated: false,
          style: { stroke: 'rgba(255,255,255,0.06)', strokeWidth: 1 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: 'rgba(255,255,255,0.06)',
          },
        },
        eds,
      ),
    );
    addLink({ source: params.source, target: params.target });
  }, [setEdges, addLink]);

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        fitView
        panOnScroll={true}
        selectionOnDrag={true}
        className="bg-transparent"
        minZoom={0.1}
        maxZoom={4}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="var(--color-border-subtle)"
        />
        <Controls
          className="bg-surface border border-border-subtle fill-text-main"
          showInteractive={true}
        />
        <MiniMap
          nodeColor={(n) => {
            switch (n.data?.type) {
              case 'frontend': return '#00f2ff';
              case 'backend':  return '#b026ff';
              case 'database': return '#ff9d00';
              case 'security': return '#ff003c';
              case 'external': return '#00ff66';
              default:         return '#8892a0';
            }
          }}
          maskColor="rgba(5, 6, 8, 0.8)"
          className="bg-surface border border-accent/30 !rounded-none shadow-[0_0_15px_rgba(0,242,255,0.1)]"
          style={{ backgroundColor: '#050608' }}
        />

        {/* MiniMap legend */}
        <Panel position="bottom-right" className="mr-[10px] mb-[140px]">
          <div className="bg-surface/90 border border-border-subtle rounded px-3 py-2 text-[8px] font-mono uppercase tracking-wider space-y-1">
            <div className="flex items-center gap-2"><div className="w-2 h-2 bg-[#00f2ff]" /> Frontend</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 bg-[#b026ff]" /> Backend</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 bg-[#ff9d00]" /> Database</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 bg-[#ff003c]" /> Security</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 bg-[#00ff66]" /> External</div>
          </div>
        </Panel>

        <Panel position="top-left" className="flex gap-2">
          <button
            onClick={() => undo()}
            disabled={pastStates.length === 0}
            className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border-subtle text-text-dim hover:text-accent hover:border-accent disabled:opacity-50 disabled:hover:text-text-dim disabled:hover:border-border-subtle transition-colors rounded text-[10px] uppercase tracking-widest font-bold cursor-pointer"
          >
            <Undo2 size={14} /> Undo
          </button>
          <button
            onClick={() => redo()}
            disabled={futureStates.length === 0}
            className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border-subtle text-text-dim hover:text-accent hover:border-accent disabled:opacity-50 disabled:hover:text-text-dim disabled:hover:border-border-subtle transition-colors rounded text-[10px] uppercase tracking-widest font-bold cursor-pointer"
          >
            <Redo2 size={14} /> Redo
          </button>
        </Panel>

        <Panel position="top-right" className="flex gap-2">
          <button
            onClick={() => fitView({ duration: 800 })}
            className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border-subtle text-text-dim hover:text-accent hover:border-accent transition-colors rounded text-[10px] uppercase tracking-widest font-bold cursor-pointer"
          >
            <Maximize size={14} /> Center
          </button>
          <button
            onClick={handleAutoLayout}
            className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border-subtle text-text-dim hover:text-accent hover:border-accent transition-colors rounded text-[10px] uppercase tracking-widest font-bold cursor-pointer"
          >
            <Network size={14} /> Auto-Organize
          </button>
        </Panel>
      </ReactFlow>

      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          nodeLabel={contextMenu.nodeLabel}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}

export default function GraphView() {
  return (
    <div className="absolute inset-0">
      <ReactFlowProvider>
        <Flow />
      </ReactFlowProvider>
      <div className="absolute inset-0 scanlines pointer-events-none z-50" />
    </div>
  );
}
