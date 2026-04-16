import React, { useEffect, useMemo, useState } from 'react';
import {
  createSession,
  deleteSession,
  importCodebase,
  listSessions,
  loadSession,
  saveSession,
  type SessionSummary,
} from '../lib/api';
import { useGraphStore } from '../store/useGraphStore';
import { DatabaseZap, FolderOpen, Pencil, Plus, Rocket, Trash2, Upload, X } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';

type LauncherTab = 'new' | 'open' | 'import';

export default function SessionLauncher() {
  const {
    showSessionLauncher,
    closeSessionLauncher,
    hydrateSession,
    availableSessions,
    setAvailableSessions,
    activeSessionId,
  } = useGraphStore();
  const [tab, setTab] = useState<LauncherTab>('new');
  const [newSessionName, setNewSessionName] = useState('');
  const [importPath, setImportPath] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!showSessionLauncher) return;
    refreshSessions();
  }, [showSessionLauncher]);

  const sortedSessions = useMemo(
    () => [...availableSessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [availableSessions],
  );

  async function refreshSessions() {
    try {
      const sessions = await listSessions();
      setAvailableSessions(sessions);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load sessions');
    }
  }

  async function handleCreateSession() {
    const name = newSessionName.trim() || `Blueprint ${new Date().toLocaleString()}`;
    setLoading(true);
    try {
      const session = await createSession({ name, source: 'manual' });
      hydrateSession(session);
      await refreshSessions();
      setNewSessionName('');
      closeSessionLauncher();
      toast.success(`Session created: ${session.name}`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to create session');
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenSession(sessionId: string) {
    setLoading(true);
    try {
      const session = await loadSession(sessionId);
      hydrateSession(session);
      closeSessionLauncher();
      toast.success(`Loaded: ${session.name}`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load session');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteSession(session: SessionSummary) {
    if (!window.confirm(`Delete session "${session.name}"?`)) return;
    setLoading(true);
    try {
      await deleteSession(session.id);
      await refreshSessions();
      if (activeSessionId === session.id) {
        useGraphStore.getState().clearSession();
      }
      toast.success(`Deleted: ${session.name}`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete session');
    } finally {
      setLoading(false);
    }
  }

  async function handleRenameSession(session: SessionSummary) {
    const nextName = window.prompt('Rename session', session.name)?.trim();
    if (!nextName || nextName === session.name) return;
    setLoading(true);
    try {
      const updated = await saveSession(session.id, { name: nextName });
      await refreshSessions();
      if (activeSessionId === session.id) {
        useGraphStore.getState().setSessionName(updated.name);
      }
      toast.success(`Renamed to: ${updated.name}`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to rename session');
    } finally {
      setLoading(false);
    }
  }

  async function handleImportCodebase() {
    if (!importPath.trim()) {
      toast.error('Enter a local path first');
      return;
    }

    setLoading(true);
    try {
      const result = await importCodebase(importPath.trim());
      hydrateSession(result.session);
      await refreshSessions();
      setImportPath('');
      closeSessionLauncher();
      toast.success(`Imported codebase: ${result.session.name}`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to import codebase');
    } finally {
      setLoading(false);
    }
  }

  if (!showSessionLauncher) return null;

  return (
    <div className="absolute inset-0 z-[120] bg-bg/85 backdrop-blur-md flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-4xl bg-[#090b10] border border-accent/30 rounded-md overflow-hidden shadow-[0_0_40px_rgba(0,242,255,0.08)]"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-accent font-bold">RETROBUILDER Sessions</div>
            <div className="text-sm text-text-dim mt-1">Start a fresh blueprint, reopen a saved session, or reverse-engineer a codebase into a blueprint draft.</div>
          </div>
          {activeSessionId && (
            <button onClick={closeSessionLauncher} className="text-text-dim hover:text-white transition-colors">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="flex border-b border-border-subtle">
          {([
            ['new', 'Novo blueprint'],
            ['open', 'Abrir sessão'],
            ['import', 'Importar codebase'],
          ] as Array<[LauncherTab, string]>).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 py-3 text-[11px] uppercase tracking-widest font-bold transition-colors border-b-2 ${
                tab === id ? 'border-accent text-accent' : 'border-transparent text-text-dim hover:text-text-main'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === 'new' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
                <input
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  placeholder="Ex.: Checkout Architecture, Billing Revamp, Search MVP"
                  className="bg-bg border border-border-subtle rounded px-4 py-3 text-sm text-text-main outline-none focus:border-accent"
                />
                <button
                  onClick={handleCreateSession}
                  disabled={loading}
                  className="px-4 py-3 bg-accent text-bg rounded font-bold uppercase tracking-widest text-[11px] hover:bg-white transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Plus size={14} /> Create session
                </button>
              </div>
              <div className="grid md:grid-cols-3 gap-3 text-[11px] text-text-dim">
                <div className="bg-surface/60 border border-border-subtle rounded p-4">
                  <Rocket size={16} className="text-accent mb-2" />
                  Start from a blank blueprint and iterate with KONSTRUKTOR/KREATOR.
                </div>
                <div className="bg-surface/60 border border-border-subtle rounded p-4">
                  <DatabaseZap size={16} className="text-[#50fa7b] mb-2" />
                  Session content lives on the backend, not in `localStorage`.
                </div>
                <div className="bg-surface/60 border border-border-subtle rounded p-4">
                  <FolderOpen size={16} className="text-[#8be9fd] mb-2" />
                  You can come back later without losing manifesto, architecture or graph.
                </div>
              </div>
            </div>
          )}

          {tab === 'open' && (
            <div className="space-y-3">
              {sortedSessions.length === 0 ? (
                <div className="text-sm text-text-dim">No saved sessions yet.</div>
              ) : (
                sortedSessions.map((session) => (
                  <div
                    key={session.id}
                    className="border border-border-subtle rounded p-4 bg-surface/60 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-text-main truncate">{session.name}</span>
                        <span className={`text-[9px] uppercase tracking-widest px-2 py-0.5 rounded ${
                          session.source === 'imported_codebase'
                            ? 'bg-[#50fa7b]/10 text-[#50fa7b]'
                            : 'bg-accent/10 text-accent'
                        }`}>
                          {session.source === 'imported_codebase' ? 'Imported' : 'Manual'}
                        </span>
                      </div>
                      <div className="text-[10px] text-text-dim mt-1 font-mono">
                        {session.nodeCount} nodes · {session.linkCount} links · updated {new Date(session.updatedAt).toLocaleString()}
                      </div>
                      {session.importMeta?.summary && (
                        <div className="text-[10px] text-text-dim mt-2">{session.importMeta.summary}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleRenameSession(session)}
                        disabled={loading}
                        className="p-2 border border-border-subtle rounded text-text-dim hover:text-accent hover:border-accent transition-colors disabled:opacity-50"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleOpenSession(session.id)}
                        disabled={loading}
                        className="px-3 py-2 bg-accent text-bg rounded text-[10px] font-bold uppercase tracking-widest hover:bg-white transition-colors disabled:opacity-50"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => handleDeleteSession(session)}
                        disabled={loading}
                        className="p-2 border border-border-subtle rounded text-text-dim hover:text-[#ff5c7a] hover:border-[#ff5c7a] transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'import' && (
            <div className="space-y-4">
              <div className="text-sm text-text-dim">
                Enter a local repository path. RETROBUILDER will ingest it with m1nd, reverse-engineer the structure, and open a new imported session.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
                <input
                  value={importPath}
                  onChange={(e) => setImportPath(e.target.value)}
                  placeholder="/Users/you/Projects/some-codebase"
                  className="bg-bg border border-border-subtle rounded px-4 py-3 text-sm text-text-main outline-none focus:border-accent font-mono"
                />
                <button
                  onClick={handleImportCodebase}
                  disabled={loading}
                  className="px-4 py-3 bg-[#50fa7b]/10 border border-[#50fa7b]/40 text-[#50fa7b] rounded font-bold uppercase tracking-widest text-[11px] hover:bg-[#50fa7b]/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Upload size={14} /> Import codebase
                </button>
              </div>
              <div className="grid md:grid-cols-2 gap-3 text-[11px] text-text-dim">
                <div className="bg-surface/60 border border-border-subtle rounded p-4">
                  The first import is local-path only. It synthesizes a draft blueprint, manifesto and architecture.
                </div>
                <div className="bg-surface/60 border border-border-subtle rounded p-4">
                  Review the imported session before exporting to Ralph. Imported sessions still go through readiness gates.
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
