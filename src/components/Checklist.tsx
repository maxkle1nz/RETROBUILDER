import React from 'react';
import { useGraphStore } from '../store/useGraphStore';
import { useBuildStore } from '../store/useBuildStore';
import { CheckCircle2, Circle, BrainCircuit, Activity, Rocket, Hammer, Loader2, AlertCircle } from 'lucide-react';

export default function Checklist() {
  const { graphData, appMode } = useGraphStore();
  const { isBuilding, buildProgress, completedNodes, totalNodes: buildTotal, nodeStates, buildResult } = useBuildStore();
  
  const totalNodes = graphData.nodes.length;
  const completedGraphNodes = graphData.nodes.filter(n => n.status === 'completed').length;
  const inProgressNodes = graphData.nodes.filter(n => n.status === 'in-progress').length;

  const hasSkeleton = totalNodes > 0;
  const isOrgansDone = totalNodes > 0 && completedGraphNodes === totalNodes;
  const isBuilder = appMode === 'builder';

  // ── Build Mode ──
  if (isBuilder) {
    const nodeEntries = Object.entries(nodeStates);
    const errorNodes = nodeEntries.filter(([, s]) => s.status === 'error');
    const buildingNodes = nodeEntries.filter(([, s]) => s.status === 'building');
    const queuedNodes = nodeEntries.filter(([, s]) => s.status === 'queued');
    const doneNodes = nodeEntries.filter(([, s]) => s.status === 'complete');
    const dormantNodes = nodeEntries.filter(([, s]) => s.status === 'dormant');

    return (
      <div className="w-full h-full bg-[#060809] border-r border-[#50fa7b]/10 flex flex-col text-text-main font-sans z-10 relative">
        <div className="text-[10px] uppercase tracking-widest p-4 text-[#50fa7b] border-b border-[#50fa7b]/10 flex items-center gap-2">
          <Hammer size={12} className={isBuilding ? 'animate-pulse' : ''} />
          Build Tracker
        </div>

        <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
          <div className="space-y-5">
            {/* Phase 1: Blueprint (always done in build mode) */}
            <div className="relative">
              <div className="absolute left-3.5 top-8 bottom-[-20px] w-px bg-[#50fa7b]/30" />
              <div className="flex items-start gap-3">
                <div className="mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 border bg-[#50fa7b]/10 border-[#50fa7b]/40 text-[#50fa7b] shadow-[0_0_8px_rgba(80,250,123,0.3)]">
                  <CheckCircle2 size={16} />
                </div>
                <div>
                  <h3 className="text-[13px] font-medium text-text-main">1. Blueprint</h3>
                  <p className="text-[10px] text-text-dim mt-0.5">{totalNodes} nodes defined</p>
                </div>
              </div>
            </div>

            {/* Phase 2: Construction (live) */}
            <div className="relative">
              <div className={`absolute left-3.5 top-8 bottom-[-20px] w-px ${buildResult ? 'bg-[#50fa7b]/30' : 'bg-border-subtle'}`} />
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 border ${
                  buildResult
                    ? 'bg-[#50fa7b]/10 border-[#50fa7b]/40 text-[#50fa7b] shadow-[0_0_8px_rgba(80,250,123,0.3)]'
                    : isBuilding
                      ? 'bg-accent-dim border-accent/50 text-accent'
                      : 'bg-bg border-border-subtle text-text-dim'
                }`}>
                  {buildResult ? <CheckCircle2 size={16} /> : isBuilding ? <Loader2 size={14} className="animate-spin" /> : <Circle size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[13px] font-medium text-text-main">2. Construction</h3>

                  {/* Global progress */}
                  <div className="mt-2 bg-[rgba(255,255,255,0.03)] rounded-[6px] border border-border-subtle p-3">
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-text-dim">Progress</span>
                      <span className="text-[#50fa7b]">{buildProgress}%</span>
                    </div>
                    <div className="h-1 bg-border-subtle rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[#50fa7b] shadow-[0_0_10px_rgba(80,250,123,0.4)] transition-all duration-500" 
                        style={{ width: `${buildProgress}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-text-dim mt-2 uppercase">
                      <span>{doneNodes.length} done</span>
                      <span>{buildingNodes.length} active</span>
                      <span>{queuedNodes.length + dormantNodes.length} pending</span>
                    </div>
                  </div>

                  {/* Build node list */}
                  <div className="mt-3 space-y-1">
                    {doneNodes.map(([id]) => (
                      <div key={id} className="flex items-center gap-2 text-[10px]">
                        <CheckCircle2 size={10} className="text-[#50fa7b] shrink-0" />
                        <span className="text-text-main truncate">{id}</span>
                      </div>
                    ))}
                    {buildingNodes.map(([id, s]) => (
                      <div key={id} className="flex items-center gap-2 text-[10px]">
                        <Loader2 size={10} className="text-accent animate-spin shrink-0" />
                        <span className="text-accent truncate">{id}</span>
                        <span className="text-text-dim ml-auto shrink-0 font-mono">{s.pct}%</span>
                      </div>
                    ))}
                    {errorNodes.map(([id]) => (
                      <div key={id} className="flex items-center gap-2 text-[10px]">
                        <AlertCircle size={10} className="text-[#ff003c] shrink-0" />
                        <span className="text-[#ff003c] truncate">{id}</span>
                      </div>
                    ))}
                    {queuedNodes.map(([id]) => (
                      <div key={id} className="flex items-center gap-2 text-[10px]">
                        <Circle size={10} className="text-[#ffcb6b] shrink-0" />
                        <span className="text-text-dim truncate">{id}</span>
                      </div>
                    ))}
                    {dormantNodes.slice(0, 5).map(([id]) => (
                      <div key={id} className="flex items-center gap-2 text-[10px]">
                        <Circle size={10} className="text-text-dim/30 shrink-0" />
                        <span className="text-text-dim/40 truncate">{id}</span>
                      </div>
                    ))}
                    {dormantNodes.length > 5 && (
                      <div className="text-[9px] text-text-dim/30 pl-5">+{dormantNodes.length - 5} more</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Phase 3: Validation */}
            <div className="relative">
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 border ${
                  buildResult ? 'bg-[#50fa7b]/10 border-[#50fa7b]/40 text-[#50fa7b] shadow-[0_0_8px_rgba(80,250,123,0.3)]' : 'bg-bg border-border-subtle text-text-dim'
                }`}>
                  {buildResult ? <Rocket size={14} /> : <Circle size={16} />}
                </div>
                <div>
                  <h3 className={`text-[13px] font-medium ${buildResult ? 'text-text-main' : 'text-text-dim'}`}>3. Validation</h3>
                  <p className="text-[10px] text-text-dim mt-0.5">
                    {buildResult ? `${buildResult.totalFiles} files · ${buildResult.totalLines.toLocaleString()} lines` : 'Awaiting completion'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Build Stats */}
        <div className="text-[10px] uppercase tracking-widest p-4 text-text-dim border-b border-border-subtle border-t mt-auto">
          Build Stats
        </div>
        <div className="p-4 text-[11px] text-text-dim font-mono space-y-1">
          <div className="flex justify-between"><span>Nodes</span><span className="text-text-main">{buildTotal || totalNodes}</span></div>
          <div className="flex justify-between"><span>Complete</span><span className="text-[#50fa7b]">{doneNodes.length}</span></div>
          <div className="flex justify-between"><span>Building</span><span className="text-accent">{buildingNodes.length}</span></div>
          <div className="flex justify-between"><span>Errors</span><span className={errorNodes.length > 0 ? 'text-[#ff003c]' : 'text-text-dim'}>{errorNodes.length}</span></div>
        </div>
      </div>
    );
  }

  // ── Standard Mode (Architect / M1ND) ──
  return (
    <div className="w-full h-full bg-surface border-r border-border-subtle flex flex-col text-text-main font-sans z-10 relative">
      <div className="text-[10px] uppercase tracking-widest p-4 text-text-dim border-b border-border-subtle">
        Project Skeleton
      </div>

      <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
        <div className="space-y-6">
          {/* Phase 1: Skeleton */}
          <div className="relative">
            <div className={`absolute left-3.5 top-8 bottom-[-24px] w-px ${hasSkeleton ? 'bg-accent/50' : 'bg-border-subtle'}`} />
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 border ${hasSkeleton ? 'bg-accent-dim border-accent/50 text-accent shadow-[0_0_8px_var(--color-accent)]' : 'bg-bg border-border-subtle text-text-dim'}`}>
                {hasSkeleton ? <CheckCircle2 size={16} /> : <Circle size={16} />}
              </div>
              <div>
                <h3 className={`text-[13px] font-medium ${hasSkeleton ? 'text-text-main' : 'text-text-dim'}`}>1. Define Skeleton</h3>
                <p className="text-[11px] text-text-dim mt-1">Generate the initial m1ndmap structure.</p>
              </div>
            </div>
          </div>

          {/* Phase 2: Organs */}
          <div className="relative">
            <div className={`absolute left-3.5 top-8 bottom-[-24px] w-px ${isOrgansDone ? 'bg-accent/50' : 'bg-border-subtle'}`} />
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 border ${isOrgansDone ? 'bg-accent-dim border-accent/50 text-accent shadow-[0_0_8px_var(--color-accent)]' : (hasSkeleton ? 'bg-accent-dim border-accent/50 text-accent' : 'bg-bg border-border-subtle text-text-dim')}`}>
                {isOrgansDone ? <CheckCircle2 size={16} /> : (hasSkeleton ? <Activity size={14} /> : <Circle size={16} />)}
              </div>
              <div>
                <h3 className={`text-[13px] font-medium ${hasSkeleton ? 'text-text-main' : 'text-text-dim'}`}>2. Build Organs</h3>
                <p className="text-[11px] text-text-dim mt-1">Flesh out modules via deep research and LLM generation.</p>
                
                {hasSkeleton && (
                  <div className="mt-3 bg-[rgba(255,255,255,0.03)] rounded-[6px] border border-border-subtle p-3">
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-text-dim">Progress</span>
                      <span className="text-accent">{Math.round((completedGraphNodes / totalNodes) * 100)}%</span>
                    </div>
                    <div className="h-1 bg-border-subtle rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-accent shadow-[0_0_10px_var(--color-accent)] transition-all duration-500" 
                        style={{ width: `${(completedGraphNodes / totalNodes) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-text-dim mt-2 uppercase">
                      <span>{completedGraphNodes} done</span>
                      <span>{inProgressNodes} active</span>
                      <span>{totalNodes - completedGraphNodes - inProgressNodes} pending</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Phase 3: Autopilot */}
          <div className="relative">
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 border ${isOrgansDone ? 'bg-accent-dim border-accent/50 text-accent shadow-[0_0_8px_var(--color-accent)]' : 'bg-bg border-border-subtle text-text-dim'}`}>
                {isOrgansDone ? <Rocket size={14} /> : <Circle size={16} />}
              </div>
              <div>
                <h3 className={`text-[13px] font-medium ${isOrgansDone ? 'text-text-main' : 'text-text-dim'}`}>3. OMX Autopilot</h3>
                <p className="text-[11px] text-text-dim mt-1">Hand over to autonomous agents (Ralph/OMX) for final execution.</p>
                {isOrgansDone && (
                  <button className="mt-3 w-full py-2 bg-accent/10 border border-accent/40 text-accent text-[10px] font-bold rounded transition-colors flex items-center justify-center gap-2 hover:bg-accent/20 shadow-[0_0_12px_rgba(0,242,255,0.1)] cursor-pointer">
                    <Rocket size={14} /> LAUNCH FULL AUTONOMY
                  </button>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
      
      <div className="text-[10px] uppercase tracking-widest p-4 text-text-dim border-b border-border-subtle border-t mt-auto">
        Graph Stats
      </div>
      <div className="p-4 text-[11px] text-text-dim font-mono space-y-1">
        <div className="flex justify-between"><span>Nodes</span><span className="text-text-main">{totalNodes}</span></div>
        <div className="flex justify-between"><span>Done</span><span className="text-success">{completedGraphNodes}</span></div>
        <div className="flex justify-between"><span>Active</span><span className="text-warning">{inProgressNodes}</span></div>
      </div>
    </div>
  );
}
