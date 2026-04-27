import React, { useEffect, useCallback, useState, useMemo } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  BackgroundVariant,
  Panel,
  useReactFlow,
  ReactFlowProvider,
  addEdge as rfAddEdge,
  type Connection,
  type Edge,
  type Node,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Maximize, Network, Undo2, Redo2 } from 'lucide-react';
import { useStore } from 'zustand';

import { useGraphStore } from '../store/useGraphStore';
import CyberNode from './CyberNode';
import NodeContextMenu from './NodeContextMenu';
import { getLayoutedElements } from '../lib/layout';
import type { NodeData } from '../lib/api';

type CyberFlowNodeData = NodeData & Record<string, unknown>;
type CyberFlowNode = Node<CyberFlowNodeData, 'cyber'>;

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

const NODE_TYPE_LEGEND = [
  { label: 'FE', title: 'Frontend', color: '#00f2ff' },
  { label: 'API', title: 'Backend', color: '#b026ff' },
  { label: 'DB', title: 'Database', color: '#ff9d00' },
  { label: 'SEC', title: 'Security', color: '#ff003c' },
  { label: 'EXT', title: 'External', color: '#00ff66' },
];

const FLOW_ACTION_BUTTON_CLASS =
  'flex h-8 items-center gap-2 rounded-md border border-border-subtle bg-surface/80 px-2.5 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-text-dim backdrop-blur transition-colors hover:border-accent/70 hover:text-accent disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-border-subtle disabled:hover:text-text-dim';

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

  const [nodes, setNodes, onNodesChange] = useNodesState<CyberFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
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

    const initialNodes: CyberFlowNode[] = graphData.nodes.map((n) => ({
      id: n.id,
      type: 'cyber',
      position: { x: 0, y: 0 },
      data: { ...n },
    }));

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

  const onNodeClick = useCallback((_: unknown, node: CyberFlowNode) => {
    setSelectedNode(node.data);
    useGraphStore.getState().openRightPanel();
  }, [setSelectedNode]);

  const onNodeMouseEnter = useCallback((_: unknown, node: CyberFlowNode) => {
    setHoveredNodeId(node.id);
  }, []);

  const onNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: CyberFlowNode) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      nodeId: node.id,
      nodeLabel: node.data.label || node.id,
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
          className="!rounded-md border border-border-subtle !bg-surface/75 fill-text-main opacity-60 shadow-[0_0_16px_rgba(0,242,255,0.06)] backdrop-blur transition-opacity hover:opacity-100"
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
          className="!rounded-md border border-accent/20 bg-surface/70 opacity-55 shadow-[0_0_15px_rgba(0,242,255,0.08)] backdrop-blur transition-opacity hover:opacity-100"
          style={{ backgroundColor: '#050608' }}
        />

        {/* MiniMap legend */}
        <Panel position="bottom-right" className="mr-[10px] mb-[126px]">
          <div className="rounded-md border border-border-subtle bg-surface/70 px-2 py-1.5 font-mono text-[7px] uppercase tracking-[0.18em] text-text-dim opacity-60 shadow-[0_0_14px_rgba(0,242,255,0.05)] backdrop-blur transition-opacity hover:opacity-100">
            <div className="mb-1 hidden text-[6.5px] tracking-[0.28em] text-text-dim/80 2xl:block">
              Type map
            </div>
            <div className="flex items-center gap-1.5">
              {NODE_TYPE_LEGEND.map((item) => (
                <div key={item.label} className="flex items-center gap-1" title={item.title}>
                  <span className="h-1.5 w-1.5 rounded-full shadow-[0_0_8px_currentColor]" style={{ color: item.color, backgroundColor: item.color }} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel position="top-left" className="flex gap-2">
          <button
            onClick={() => undo()}
            disabled={pastStates.length === 0}
            aria-label="Undo graph change"
            className={FLOW_ACTION_BUTTON_CLASS}
            title="Undo"
          >
            <Undo2 size={14} />
            <span className="hidden 2xl:inline">Undo</span>
          </button>
          <button
            onClick={() => redo()}
            disabled={futureStates.length === 0}
            aria-label="Redo graph change"
            className={FLOW_ACTION_BUTTON_CLASS}
            title="Redo"
          >
            <Redo2 size={14} />
            <span className="hidden 2xl:inline">Redo</span>
          </button>
        </Panel>

        <Panel position="top-right" className="flex gap-2">
          <button
            onClick={() => fitView({ duration: 800 })}
            aria-label="Center graph"
            className={FLOW_ACTION_BUTTON_CLASS}
            title="Center graph"
          >
            <Maximize size={14} />
            <span className="hidden 2xl:inline">Center</span>
          </button>
          <button
            onClick={handleAutoLayout}
            aria-label="Auto-organize graph"
            className={FLOW_ACTION_BUTTON_CLASS}
            title="Auto-organize graph"
          >
            <Network size={14} />
            <span className="hidden 2xl:inline">Organize</span>
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
    <div className="absolute inset-0 bg-bg">
      <ReactFlowProvider>
        <Flow />
      </ReactFlowProvider>
      <div className="absolute inset-0 scanlines pointer-events-none z-50" />
    </div>
  );
}
