import React, { useEffect, useCallback, useState } from 'react';
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

function Flow() {
  const { graphData, setSelectedNode, addLink, setSelectedNodes, clearNodeSelection } = useGraphStore();
  
  // Correct usage of zundo v2 with React
  const undo = useGraphStore.temporal.getState().undo;
  const redo = useGraphStore.temporal.getState().redo;
  const pastStates = useStore(useGraphStore.temporal, (state) => state.pastStates);
  const futureStates = useStore(useGraphStore.temporal, (state) => state.futureStates);
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { fitView } = useReactFlow();

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string; nodeLabel: string } | null>(null);

  const handleAutoLayout = useCallback(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      nodes,
      edges,
      'TB'
    );
    setNodes([...layoutedNodes]);
    setEdges([...layoutedEdges]);
    setTimeout(() => fitView({ duration: 800 }), 50);
  }, [nodes, edges, setNodes, setEdges, fitView]);

  // Transform graphData (from LLM) into React Flow format
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

    const initialEdges: Edge[] = graphData.links.map((l, idx) => ({
      id: `e-${l.source}-${l.target}-${idx}`,
      source: l.source,
      target: l.target,
      label: l.label,
      animated: true,
      className: 'animated',
      style: { stroke: 'var(--color-accent)' },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: 'var(--color-accent)',
      },
    }));

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      initialNodes,
      initialEdges,
      'TB'
    );

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
    
    // Fit view after initial layout
    setTimeout(() => fitView({ duration: 800 }), 100);
  }, [graphData, setNodes, setEdges, fitView]);

  const onNodeClick = useCallback((_, node: Node) => {
    setSelectedNode(node.data as any);
    useGraphStore.getState().openRightPanel();
  }, [setSelectedNode]);

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

  const onSelectionChange = useCallback(({ nodes: selectedFlowNodes }: OnSelectionChangeParams) => {
    const ids = selectedFlowNodes.map((n) => n.id);
    setSelectedNodes(ids);
  }, [setSelectedNodes]);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => rfAddEdge({
      ...params,
      animated: true,
      className: 'animated',
      style: { stroke: 'var(--color-accent)' },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-accent)' },
    }, eds));
    
    // Sync with global store
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
              case 'backend': return '#b026ff';
              case 'database': return '#ff9d00';
              case 'security': return '#ff003c';
              case 'external': return '#00ff66';
              default: return '#8892a0';
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

      {/* Node context menu */}
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
