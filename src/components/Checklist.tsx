import React from 'react';
import { useGraphStore } from '../store/useGraphStore';
import { CheckCircle2, Circle, BrainCircuit, Activity, Rocket } from 'lucide-react';

export default function Checklist() {
  const { graphData } = useGraphStore();
  
  const totalNodes = graphData.nodes.length;
  const completedNodes = graphData.nodes.filter(n => n.status === 'completed').length;
  const inProgressNodes = graphData.nodes.filter(n => n.status === 'in-progress').length;

  const hasSkeleton = totalNodes > 0;
  const isOrgansDone = totalNodes > 0 && completedNodes === totalNodes;
  
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
                      <span className="text-accent">{Math.round((completedNodes / totalNodes) * 100)}%</span>
                    </div>
                    <div className="h-1 bg-border-subtle rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-accent shadow-[0_0_10px_var(--color-accent)] transition-all duration-500" 
                        style={{ width: `${(completedNodes / totalNodes) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-text-dim mt-2 uppercase">
                      <span>{completedNodes} done</span>
                      <span>{inProgressNodes} active</span>
                      <span>{totalNodes - completedNodes - inProgressNodes} pending</span>
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
        <div className="flex justify-between"><span>Done</span><span className="text-success">{completedNodes}</span></div>
        <div className="flex justify-between"><span>Active</span><span className="text-warning">{inProgressNodes}</span></div>
      </div>
    </div>
  );
}
