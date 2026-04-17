import React, { useState, useRef, useEffect } from 'react';
import { useGraphStore } from '../store/useGraphStore';
import { performDeepResearch } from '../lib/api';
import { toast } from 'sonner';
import { Trash2, Edit3, CheckCircle2, PlayCircle, Circle, Copy, Search, Layers } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  nodeId: string;
  nodeLabel: string;
  onClose: () => void;
}

export default function NodeContextMenu({ x, y, nodeId, nodeLabel, onClose }: ContextMenuProps) {
  const { removeNode, updateNode, setSelectedNode, graphData, selectedNodes, toggleNodeSelection, projectContext } = useGraphStore();
  const [isRenaming, setIsRenaming] = useState(false);
  const [newLabel, setNewLabel] = useState(nodeLabel);
  const [isResearching, setIsResearching] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleDelete = () => {
    removeNode(nodeId);
    toast.success(`Deleted: ${nodeLabel}`);
    onClose();
  };

  const handleRename = () => {
    if (newLabel.trim() && newLabel !== nodeLabel) {
      updateNode(nodeId, { label: newLabel.trim() });
      toast.success(`Renamed: ${nodeLabel} → ${newLabel.trim()}`);
    }
    setIsRenaming(false);
    onClose();
  };

  const handleSetStatus = (status: 'pending' | 'in-progress' | 'completed') => {
    updateNode(nodeId, { status });
    toast.info(`${nodeLabel}: ${status}`);
    onClose();
  };

  const handleDuplicate = () => {
    const node = graphData.nodes.find(n => n.id === nodeId);
    if (node) {
      const newId = `${node.id}-copy-${Date.now()}`;
      const newNode = { ...node, id: newId, label: `${node.label} (copy)` };
      useGraphStore.setState(state => ({
        graphData: {
          nodes: [...state.graphData.nodes, newNode],
          links: state.graphData.links
        }
      }));
      toast.success(`Duplicated: ${node.label}`);
    }
    onClose();
  };

  const handleResearch = async () => {
    const node = graphData.nodes.find(n => n.id === nodeId);
    if (!node) return;
    setIsResearching(true);
    try {
      const result = await performDeepResearch(node, projectContext);
      updateNode(nodeId, { researchContext: result });
      toast.success(`Research grounded to ${nodeLabel}`);
    } catch (error) {
      toast.error('Deep research failed');
    } finally {
      setIsResearching(false);
      onClose();
    }
  };

  const handleBatchResearch = async () => {
    const nodeIds = Array.from(selectedNodes);
    if (nodeIds.length === 0) return;
    setIsResearching(true);
    let done = 0;
    for (const nid of nodeIds) {
      const node = graphData.nodes.find(n => n.id === nid);
      if (!node) continue;
      try {
        const result = await performDeepResearch(node, projectContext);
        updateNode(nid, { researchContext: result });
        done++;
        toast.success(`[${done}/${nodeIds.length}] Grounded: ${node.label}`);
      } catch {
        toast.error(`Failed: ${node.label}`);
      }
    }
    setIsResearching(false);
    onClose();
  };

  const batchCount = selectedNodes.size;

  const menuItems = [
    { icon: Search, label: isResearching ? 'Grounding...' : 'Deep Research', action: handleResearch, color: 'text-accent', disabled: isResearching },
    ...(batchCount > 1 ? [{ icon: Layers, label: `Research Selected (${batchCount})`, action: handleBatchResearch, color: 'text-[#b026ff]', disabled: isResearching }] : []),
    { divider: true },
    { icon: Edit3, label: 'Rename', action: () => setIsRenaming(true), color: 'text-accent' },
    { icon: Copy, label: 'Duplicate', action: handleDuplicate, color: 'text-text-dim' },
    { divider: true },
    { icon: Circle, label: 'Set Pending', action: () => handleSetStatus('pending'), color: 'text-text-dim' },
    { icon: PlayCircle, label: 'Set In Progress', action: () => handleSetStatus('in-progress'), color: 'text-[#ff9d00]' },
    { icon: CheckCircle2, label: 'Set Completed', action: () => handleSetStatus('completed'), color: 'text-[#00ff66]' },
    { divider: true },
    { icon: Trash2, label: 'Delete Node', action: handleDelete, color: 'text-[#ff003c]' },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-[200] bg-surface border border-border-subtle shadow-[0_4px_24px_rgba(0,0,0,0.6)] rounded-md py-1 min-w-[180px] font-mono text-[11px] animate-in fade-in slide-in-from-top-1 duration-150"
      style={{ left: x, top: y }}
    >
      {/* Node label header */}
      <div className="px-3 py-1.5 text-[9px] uppercase tracking-widest text-text-dim border-b border-border-subtle truncate">
        {nodeLabel}
      </div>

      {isRenaming ? (
        <div className="p-2">
          <input
            ref={inputRef}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') { setIsRenaming(false); onClose(); }
            }}
            className="w-full bg-bg border border-accent/50 rounded px-2 py-1 text-text-main text-[11px] outline-none focus:border-accent"
          />
          <div className="flex gap-1 mt-1">
            <button onClick={handleRename} className="flex-1 bg-accent/20 text-accent py-0.5 rounded text-[9px] hover:bg-accent hover:text-bg transition-colors">Save</button>
            <button onClick={() => { setIsRenaming(false); onClose(); }} className="flex-1 bg-border-subtle text-text-dim py-0.5 rounded text-[9px] hover:text-white transition-colors">Cancel</button>
          </div>
        </div>
      ) : (
        menuItems.map((item, idx) =>
          item.divider ? (
            <div key={idx} className="border-t border-border-subtle my-1" />
          ) : (
            <button
              key={idx}
              onClick={item.action}
              disabled={(item as any).disabled}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${item.color}`}
            >
              {item.icon && <item.icon size={12} />}
              <span>{item.label}</span>
            </button>
          )
        )
      )}
    </div>
  );
}
