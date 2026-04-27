/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import GraphView from './components/GraphView';
import Checklist from './components/Checklist';
import ChatFooter from './components/ChatFooter';
import ErrorBoundary from './components/ErrorBoundary';
import RetroBuilderLogo from './components/RetroBuilderLogo';
import { useGraphStore } from './store/useGraphStore';
import { useBuildStore } from './store/useBuildStore';
import { fetchEnvConfig, listSessions, loadSession, registerModelGetter, saveSession } from './lib/api';
import { BrainCircuit, FolderOpen, KeyRound, PenTool, PanelRightClose, PanelRightOpen, PanelLeftClose, PanelLeftOpen, Save, Hammer, TerminalSquare } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Toaster, toast } from 'sonner';

const Sidebar = React.lazy(() => import('./components/Sidebar'));
const SessionLauncher = React.lazy(() => import('./components/SessionLauncher'));
const EnvConfigModal = React.lazy(() => import('./components/EnvConfigModal'));
const SpotlightSearch = React.lazy(() => import('./components/SpotlightSearch'));
const BuildView = React.lazy(() => import('./components/BuildView'));
const BuildConsole = React.lazy(() => import('./components/BuildConsole'));
const RightPanel = React.lazy(() => import('./components/RightPanel'));
const KompletusReport = React.lazy(() => import('./components/KompletusReport'));
const NodeInspector = React.lazy(() => import('./components/NodeInspector'));
const APP_VERSION_LABEL = `v${__APP_VERSION__}`;

function LiveUptime() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return <span>{h}:{m}:{s}</span>;
}

export default function App() {
  const {
    appMode,
    setAppMode,
    isRightPanelOpen,
    showSessionLauncher,
    showEnvConfigModal,
    showKompletusReport,
    inspectorNodeId,
    graphData,
    activeSessionId,
    activeSessionName,
    activeSessionSource,
    sessionSaveState,
    manifesto,
    architecture,
    projectContext,
    setActiveProvider,
    setAvailableSessions,
    hydrateSession,
    clearSession,
    openSessionLauncher,
    closeSessionLauncher,
    openEnvConfigModal,
    setSessionSaveState,
  } = useGraphStore();
  const [leftCollapsed, setLeftCollapsed]   = useState(true);
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [showSpotlight, setShowSpotlight]   = useState(false);
  const [terminalOpen, setTerminalOpen]     = useState(false);
  const previousSessionIdRef = useRef<string | null | undefined>(undefined);
  const terminalWasAutoOpenedRef = useRef(false);

  // Auto-open terminal when OMX build starts
  const isBuilding = useBuildStore((s) => s.isBuilding);
  const buildStatus = useBuildStore((s) => s.buildStatus);
  useEffect(() => {
    if (isBuilding) {
      terminalWasAutoOpenedRef.current = true;
      setTerminalOpen(true);
      return;
    }

    if (terminalWasAutoOpenedRef.current && ['succeeded', 'failed', 'stopped'].includes(buildStatus)) {
      terminalWasAutoOpenedRef.current = false;
      setTerminalOpen(false);
    }
  }, [isBuilding, buildStatus]);

  const totalNodes = graphData.nodes.length;
  const completedNodes = graphData.nodes.filter(n => n.status === 'completed').length;
  const syncPct = totalNodes > 0 ? Math.round((completedNodes / totalNodes) * 100) : 0;

  useEffect(() => {
    if (previousSessionIdRef.current === undefined) {
      previousSessionIdRef.current = activeSessionId;
      return;
    }

    if (previousSessionIdRef.current === activeSessionId) return;

    useGraphStore.temporal.getState().clear();
    const buildStore = useBuildStore.getState();
    buildStore.resetBuild();
    buildStore.initNodeStates(graphData.nodes.map((node) => node.id));
    previousSessionIdRef.current = activeSessionId;
  }, [activeSessionId, graphData.nodes]);

  // Register model getter so all API calls include user's model selection
  useEffect(() => {
    registerModelGetter(() => useGraphStore.getState().activeModel);
  }, []);

  const persistActiveSession = useCallback(async () => {
    if (!activeSessionId) return;

    await saveSession(activeSessionId, {
      name: useGraphStore.getState().activeSessionName || 'Untitled Blueprint',
      manifesto,
      architecture,
      graph: graphData,
      projectContext,
      importMeta: useGraphStore.getState().importMeta || undefined,
    });
  }, [activeSessionId, manifesto, architecture, graphData, projectContext]);

  const refreshSessions = useCallback(async () => {
    try {
      const sessions = await listSessions();
      setAvailableSessions(sessions);
      return sessions;
    } catch (error) {
      console.error(error);
      toast.error('Failed to refresh sessions');
      return null;
    }
  }, [setAvailableSessions]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapSessions() {
      const sessions = await refreshSessions();
      const remembered = useGraphStore.getState().activeSessionId;
      if (!remembered) return;

      const rememberedExists = sessions?.some((session) => session.id === remembered) ?? true;
      if (!rememberedExists) {
        if (!cancelled) {
          clearSession();
        }
        return;
      }

      try {
        const session = await loadSession(remembered);
        if (!cancelled) {
          hydrateSession(session);
          closeSessionLauncher();
        }
      } catch {
        if (!cancelled) {
          openSessionLauncher();
        }
      }
    }

    bootstrapSessions();
    return () => { cancelled = true; };
  }, [refreshSessions, hydrateSession, clearSession, closeSessionLauncher, openSessionLauncher]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapEnvOnboarding() {
      try {
        const envState = await fetchEnvConfig();
        if (cancelled) return;
        useGraphStore.getState().setAvailableProviders(envState.providers);
        if (envState.config.AI_PROVIDER) {
          setActiveProvider(envState.config.AI_PROVIDER);
        }
        useGraphStore.getState().setActiveAuthProfile(envState.config.THEBRIDGE_AUTH_PROFILE || null);
        if (envState.onboardingRequired) {
          openEnvConfigModal();
        }
      } catch (error) {
        console.error(error);
      }
    }

    bootstrapEnvOnboarding();
    return () => { cancelled = true; };
  }, [openEnvConfigModal, setActiveProvider]);

  useEffect(() => {
    if (!activeSessionId || sessionSaveState !== 'dirty') return;

    const timer = window.setTimeout(async () => {
      try {
        setSessionSaveState('saving');
        await persistActiveSession();
        setSessionSaveState('saved');
        await refreshSessions();
      } catch (error) {
        console.error(error);
        setSessionSaveState('error');
      }
    }, 800);

    return () => window.clearTimeout(timer);
  }, [
    activeSessionId,
    sessionSaveState,
    manifesto,
    architecture,
    graphData,
    projectContext,
    setSessionSaveState,
    refreshSessions,
    persistActiveSession,
  ]);

  useEffect(() => {
    if (appMode === 'm1nd') {
      useGraphStore.getState().openRightPanel();
    }
  }, [appMode]);

  useEffect(() => {
    if (appMode === 'm1nd') {
      setLeftCollapsed(true);
      setRightCollapsed(true);
    }
    if (appMode === 'builder') {
      setRightCollapsed(true);
    }
  }, [appMode]);

  const handleManualSave = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      setSessionSaveState('saving');
      await persistActiveSession();
      setSessionSaveState('saved');
      await refreshSessions();
      toast.success('Session saved');
    } catch (error) {
      console.error(error);
      setSessionSaveState('error');
      toast.error('Failed to save session');
    }
  }, [activeSessionId, refreshSessions, setSessionSaveState, persistActiveSession]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // ⌘+Z — undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useGraphStore.temporal.getState().undo();
        toast.info('Undo', { duration: 1500 });
      }
      // ⌘+Shift+Z — redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        useGraphStore.temporal.getState().redo();
        toast.info('Redo', { duration: 1500 });
      }
      // Esc — close panels
      if (e.key === 'Escape') {
        useGraphStore.getState().closeRightPanel();
        useGraphStore.getState().setSelectedNode(null);
        setShowSpotlight(false);
      }
      // ⌘+K — Spotlight Search
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowSpotlight((prev) => !prev);
      }
      // ⌘+1 — Architect mode
      if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault();
        setAppMode('architect');
      }
      // ⌘+2 — M1ND mode
      if ((e.metaKey || e.ctrlKey) && e.key === '2') {
        e.preventDefault();
        setAppMode('m1nd');
      }
      // ⌘+3 — Builder mode
      if ((e.metaKey || e.ctrlKey) && e.key === '3') {
        e.preventDefault();
        setAppMode('builder');
      }
      // ⌘+S — save active session
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleManualSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setAppMode, handleManualSave]);

  const isM1nd = appMode === 'm1nd';
  const isBuilder = appMode === 'builder';

  return (
    <ErrorBoundary fallbackMessage="RETROBUILDER encountered a critical error. Click Recover to reset the view.">
      <div 
        className="w-screen h-screen flex flex-col overflow-hidden bg-bg text-text-main font-sans selection:bg-accent-dim"
        data-mode={appMode}
      >
        <Toaster 
          position="top-right" 
          theme="dark"
          toastOptions={{
            style: {
              background: '#101218',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#e0e6ed',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
            },
          }}
        />

        <header className={`min-h-[60px] border-b flex flex-col items-stretch gap-2 px-3 py-2 backdrop-blur-[10px] shrink-0 z-20 transition-colors duration-500 xl:h-[60px] xl:flex-row xl:items-center xl:justify-between xl:gap-3 xl:px-6 xl:py-0 ${
          isBuilder
            ? 'bg-[rgba(8,16,12,0.9)] border-[#50fa7b]/20'
            : isM1nd 
              ? 'bg-[rgba(20,12,28,0.85)] border-[#b026ff]/20' 
              : 'bg-[rgba(16,18,24,0.8)] border-border-subtle'
          }`}>
          <div className="flex min-w-0 w-full items-center gap-2 overflow-x-auto pb-1 custom-scrollbar xl:w-auto xl:overflow-visible xl:pb-0 2xl:gap-6">
            <RetroBuilderLogo mode={appMode} />

            <button
              onClick={() => openSessionLauncher()}
              aria-label={`Open session launcher. Current session: ${activeSessionName || 'Choose a session'}`}
              className="flex shrink-0 items-center gap-2 px-2 py-1.5 rounded border border-border-subtle bg-black/40 text-text-dim hover:text-white hover:border-accent transition-colors xl:px-3"
            >
              <FolderOpen size={14} />
              <span className="hidden text-[10px] font-bold uppercase tracking-[0.22em] md:inline xl:hidden">Session</span>
              <div className="hidden text-left xl:block">
                <div className="text-[9px] uppercase tracking-[0.25em]">Session</div>
                <div className="text-[11px] font-mono max-w-[220px] truncate">
                  {activeSessionName || 'Choose a session'}
                </div>
              </div>
              {activeSessionSource === 'imported_codebase' && (
                <span className="text-[8px] uppercase tracking-widest px-2 py-0.5 rounded bg-[#50fa7b]/10 text-[#50fa7b]">
                  Imported
                </span>
              )}
            </button>

            <button
              onClick={() => openEnvConfigModal()}
              aria-label="Open project keys and provider config"
              className="flex shrink-0 items-center gap-2 px-2 py-1.5 rounded border border-border-subtle bg-black/40 text-text-dim hover:text-white hover:border-accent transition-colors xl:px-3"
            >
              <KeyRound size={14} />
              <span className="hidden text-[10px] font-bold uppercase tracking-[0.22em] md:inline xl:hidden">Keys</span>
              <div className="hidden text-left xl:block">
                <div className="text-[9px] uppercase tracking-[0.25em]">Keys</div>
                <div className="text-[11px] font-mono max-w-[180px] truncate">Project env</div>
              </div>
            </button>
            
            <div className="flex shrink-0 bg-black/50 rounded-md border border-border-subtle p-1" role="group" aria-label="Workspace mode">
              <button
                onClick={() => setAppMode('architect')}
                aria-pressed={appMode === 'architect'}
                aria-label="Switch to Architect mode"
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs font-bold tracking-wider transition-all duration-300 lg:px-3 ${
                  appMode === 'architect' ? 'bg-accent/20 text-accent' : 'text-text-dim hover:text-white'
              }`}
              >
                <PenTool size={14} />
                <span className="hidden lg:inline">ARCHITECT</span>
              </button>
              <button
                onClick={() => setAppMode('m1nd')}
                aria-pressed={appMode === 'm1nd'}
                aria-label="Switch to M1ND mode"
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs font-bold tracking-wider transition-all duration-300 lg:px-3 ${
                  appMode === 'm1nd' ? 'bg-[#b026ff]/20 text-[#b026ff]' : 'text-text-dim hover:text-white'
              }`}
              >
                <BrainCircuit size={14} />
                <span className="hidden lg:inline">M1ND</span>
              </button>
              <button
                onClick={() => setAppMode('builder')}
                aria-pressed={appMode === 'builder'}
                aria-label="Switch to BU1LDER mode"
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs font-bold tracking-wider transition-all duration-300 lg:px-3 ${
                  appMode === 'builder' ? 'bg-[#50fa7b]/20 text-[#50fa7b]' : 'text-text-dim hover:text-white'
              }`}
              >
                <Hammer size={14} />
                <span className="hidden lg:inline">BU1LDER</span>
              </button>
            </div>
          </div>

          <div className="flex w-full items-center justify-between gap-2 overflow-x-auto pb-1 text-[11px] text-text-dim font-mono custom-scrollbar xl:w-auto xl:justify-end xl:overflow-visible xl:pb-0">
            {/* Terminal toggle */}
            <button
              onClick={() => setTerminalOpen((v) => !v)}
              aria-label="Toggle OMX Terminal"
              aria-pressed={terminalOpen}
              className={`flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded border transition-colors ${
                terminalOpen
                  ? 'border-accent/50 text-accent bg-accent/10'
                  : 'border-border-subtle bg-black/40 hover:border-accent hover:text-white'
              }`}
              title="Toggle OMX Terminal (⌘T)"
            >
              <TerminalSquare size={12} />
              {isBuilding && <span className="w-1.5 h-1.5 rounded-full bg-[#ffcb6b] animate-pulse" />}
            </button>
            <button
              onClick={handleManualSave}
              disabled={!activeSessionId || sessionSaveState === 'saving'}
              aria-label="Save active session"
              className="flex shrink-0 items-center gap-2 px-3 py-1.5 rounded border border-border-subtle bg-black/40 hover:border-accent hover:text-white transition-colors disabled:opacity-50"
            >
              <Save size={12} />
              <span className="hidden md:inline">
                {sessionSaveState === 'saving'
                  ? 'SAVING'
                  : sessionSaveState === 'dirty'
                    ? 'UNSAVED'
                    : sessionSaveState === 'error'
                      ? 'ERROR'
                      : 'SAVED'}
              </span>
            </button>
            <details className="relative group">
              <summary className="list-none cursor-pointer flex shrink-0 items-center gap-2 px-3 py-1.5 rounded border border-border-subtle bg-black/40 hover:border-accent hover:text-white transition-colors">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  sessionSaveState === 'error'
                    ? 'bg-[#ff003c]'
                    : sessionSaveState === 'dirty'
                      ? 'bg-[#ffcb6b]'
                      : isBuilder
                        ? 'bg-[#50fa7b]'
                        : isM1nd
                          ? 'bg-[#b026ff]'
                        : 'bg-accent'
                }`} />
                <span className="hidden md:inline">STATUS</span>
                <span className={isBuilder ? 'text-[#50fa7b]' : isM1nd ? 'text-[#b026ff]' : 'text-accent'}>
                  {syncPct}%
                </span>
              </summary>
              <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-border-subtle bg-[#080a10]/95 p-3 shadow-[0_16px_40px_rgba(0,0,0,0.45)] backdrop-blur z-50">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px] uppercase tracking-wider">
                  <span className="text-text-dim">Sync</span>
                  <span className={isBuilder ? 'text-[#50fa7b]' : isM1nd ? 'text-[#b026ff]' : 'text-accent'}>{syncPct}%</span>
                  <span className="text-text-dim">Nodes</span>
                  <span className="text-text-main">{totalNodes}</span>
                  <span className="text-text-dim">Uptime</span>
                  <span className="text-text-main"><LiveUptime /></span>
                  <span className="text-text-dim">Version</span>
                  <span className="text-text-main">{APP_VERSION_LABEL}</span>
                </div>
              </div>
            </details>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          <AnimatePresence>
            {!leftCollapsed && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 220, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden shrink-0"
              >
                <Checklist />
              </motion.div>
            )}
          </AnimatePresence>
          
          <div className={`min-w-0 flex-1 relative flex items-center justify-center transition-colors duration-500 ${
            isM1nd
              ? 'bg-[radial-gradient(circle_at_center,#1a0f24_0%,#050608_100%)]'
              : 'bg-[radial-gradient(circle_at_center,#151a24_0%,#050608_100%)]'
          }`}>
            {/* Panel collapse toggles */}
            <div className="absolute left-0 top-1/2 z-50 -translate-y-1/2">
              <button
                onClick={() => setLeftCollapsed(!leftCollapsed)}
                aria-label={leftCollapsed ? 'Show Checklist' : 'Hide Checklist'}
                aria-expanded={!leftCollapsed}
                className={`flex h-12 w-7 items-center justify-center rounded-r-xl border border-l-0 bg-surface/90 shadow-[0_12px_30px_rgba(0,0,0,0.25)] backdrop-blur transition-colors ${
                  leftCollapsed
                    ? 'border-border-subtle text-text-dim hover:text-accent'
                    : 'border-accent/40 text-accent'
                }`}
                title={leftCollapsed ? 'Show Checklist' : 'Hide Checklist'}
              >
                {leftCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
              </button>
            </div>
            <div className="absolute right-0 top-1/2 z-50 -translate-y-1/2">
              <button
                onClick={() => setRightCollapsed(!rightCollapsed)}
                aria-label={rightCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}
                aria-expanded={!rightCollapsed}
                className={`flex h-12 w-7 items-center justify-center rounded-l-xl border border-r-0 bg-surface/90 shadow-[0_12px_30px_rgba(0,0,0,0.25)] backdrop-blur transition-colors ${
                  rightCollapsed
                    ? 'border-border-subtle text-text-dim hover:text-accent'
                    : 'border-accent/40 text-accent'
                }`}
                title={rightCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}
              >
                {rightCollapsed ? <PanelRightOpen size={15} /> : <PanelRightClose size={15} />}
              </button>
            </div>

            {!isBuilder && <div className="absolute inset-0 grid-pulse pointer-events-none" />}
            <ErrorBoundary fallbackMessage="Graph rendering failed. This may be caused by malformed AI output.">
              {isBuilder ? (
                <React.Suspense fallback={null}>
                  <BuildView />
                </React.Suspense>
              ) : (
                <GraphView />
              )}
            </ErrorBoundary>
          </div>

          <AnimatePresence>
            {isRightPanelOpen && (
              <React.Suspense fallback={null}>
                <RightPanel />
              </React.Suspense>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {!rightCollapsed && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 320, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden shrink-0"
              >
                <React.Suspense fallback={null}>
                  <Sidebar />
                </React.Suspense>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {(terminalOpen || isBuilding) && (
          <React.Suspense fallback={null}>
            <BuildConsole drawerMode open={terminalOpen} onClose={() => setTerminalOpen(false)} />
          </React.Suspense>
        )}
        <ChatFooter />
        {showSessionLauncher && (
          <React.Suspense fallback={null}>
            <SessionLauncher />
          </React.Suspense>
        )}
        {showEnvConfigModal && (
          <React.Suspense fallback={null}>
            <EnvConfigModal />
          </React.Suspense>
        )}
        {showKompletusReport && (
          <React.Suspense fallback={null}>
            <KompletusReport />
          </React.Suspense>
        )}
        {inspectorNodeId && (
          <React.Suspense fallback={null}>
            <NodeInspector />
          </React.Suspense>
        )}

        {/* Spotlight Search (portalled over everything) */}
        <AnimatePresence>
          {showSpotlight && (
            <React.Suspense fallback={null}>
              <SpotlightSearch onClose={() => setShowSpotlight(false)} />
            </React.Suspense>
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}
