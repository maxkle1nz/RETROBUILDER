/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import GraphView from './components/GraphView';
import Sidebar from './components/Sidebar';
import Checklist from './components/Checklist';
import ChatFooter from './components/ChatFooter';
import ProposalModal from './components/ProposalModal';
import RightPanel from './components/RightPanel';
import { useGraphStore } from './store/useGraphStore';
import { BrainCircuit, PenTool } from 'lucide-react';
import { AnimatePresence } from 'motion/react';

export default function App() {
  const { appMode, setAppMode, isRightPanelOpen } = useGraphStore();

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden bg-bg text-text-main font-sans selection:bg-accent-dim">
      <header className="h-[60px] border-b border-border-subtle flex justify-between items-center px-6 bg-[rgba(16,18,24,0.8)] backdrop-blur-[10px] shrink-0 z-20">
        <div className="flex items-center gap-6">
          <div className="font-extrabold text-[1.2rem] tracking-[2px] text-accent">M1ND // SYSTEM</div>
          
          <div className="flex bg-black/50 rounded-md border border-border-subtle p-1">
            <button
              onClick={() => setAppMode('architect')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold tracking-wider transition-colors ${
                appMode === 'architect' ? 'bg-accent/20 text-accent' : 'text-text-dim hover:text-white'
              }`}
            >
              <PenTool size={14} />
              ARCHITECT
            </button>
            <button
              onClick={() => setAppMode('m1nd')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold tracking-wider transition-colors ${
                appMode === 'm1nd' ? 'bg-accent/20 text-accent' : 'text-text-dim hover:text-white'
              }`}
            >
              <BrainCircuit size={14} />
              M1ND
            </button>
          </div>
        </div>

        <div className="flex gap-5 text-[12px] text-text-dim items-center">
          <span>AUTOPILOT: <span className="text-accent">ACTIVE [RALPH]</span></span>
          <span>SYNC: 100%</span>
          <span>UPTIME: 14:22:04</span>
          <div className="text-[10px] px-1.5 py-0.5 rounded bg-[#222] text-white ml-1">BUILD v2.4.0</div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <Checklist />
        
        <div className="flex-1 relative bg-[radial-gradient(circle_at_center,#151a24_0%,#050608_100%)] flex items-center justify-center">
          <GraphView />
        </div>

        <AnimatePresence>
          {isRightPanelOpen && <RightPanel />}
        </AnimatePresence>
        <Sidebar />
      </div>
      
      <ChatFooter />
      <ProposalModal />
    </div>
  );
}

