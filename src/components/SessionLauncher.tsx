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
import { Archive, ArchiveRestore, DatabaseZap, FolderOpen, Pencil, Plus, Rocket, Trash2, Upload, X } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';

type LauncherTab = 'new' | 'open' | 'import';
type SessionFilter = 'all' | 'active' | 'manual' | 'imports' | 'drafts' | 'archived';

const DRAFT_SESSION_PATTERN = /\b(test|teste|tmp|temp|draft|rascunho|scratch|wip|playground|sample|demo|junk|throwaway|sandbox)\b/i;

function isTrivialSession(session: SessionSummary) {
  return session.nodeCount <= 1 && session.linkCount <= 0;
}

function isDraftSession(session: SessionSummary) {
  if (session.source === 'imported_codebase') return false;
  return DRAFT_SESSION_PATTERN.test(session.name) || isTrivialSession(session);
}

function getSessionCategory(session: SessionSummary) {
  if (session.archived) return 'archived' as const;
  if (session.source === 'imported_codebase') return 'imports' as const;
  if (isDraftSession(session)) return 'drafts' as const;
  return 'manual' as const;
}

function matchesSessionSearch(session: SessionSummary, query: string) {
  if (!query) return true;
  const summary = session.importMeta?.summary ?? '';
  const haystack = [session.name, session.id, session.source, summary].join(' ').toLowerCase();
  return haystack.includes(query);
}

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
  const [searchQuery, setSearchQuery] = useState('');
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>('all');
  const [showTrivial, setShowTrivial] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!showSessionLauncher) return;
    refreshSessions();
  }, [showSessionLauncher]);

  const sortedSessions = useMemo(
    () => [...availableSessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [availableSessions],
  );

  const sessionView = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const decorated = sortedSessions.map((session) => {
      const category = getSessionCategory(session);
      const isActive = session.id === activeSessionId;
      const matchesSearch = matchesSessionSearch(session, query);
      const matchesFilter =
        sessionFilter === 'all'
          ? true
          : sessionFilter === 'active'
            ? isActive
            : sessionFilter === 'manual'
              ? category === 'manual'
              : sessionFilter === 'imports'
                ? category === 'imports'
                : sessionFilter === 'drafts'
                  ? category === 'drafts'
                  : category === 'archived';
      const hiddenByDefault =
        (!showTrivial && sessionFilter !== 'drafts' && (category === 'drafts' || isTrivialSession(session))) ||
        (!showArchived && sessionFilter !== 'archived' && category === 'archived');

      return {
        session,
        category,
        isActive,
        hiddenByDefault,
        matchesSearch,
        matchesFilter,
      };
    });

    const matching = decorated.filter((item) => item.matchesSearch && item.matchesFilter);
    const visible = matching.filter((item) => !item.hiddenByDefault);
    const groups = [
      {
        key: 'continue',
        title: 'Continue work',
        description: 'Pin the current active session to the top so it never gets lost in the noise.',
        items: visible.filter((item) => item.isActive),
      },
      {
        key: 'manual',
        title: 'Manual blueprints',
        description: 'Intentional sessions created directly in RETROBUILDER.',
        items: visible.filter((item) => item.category === 'manual' && !item.isActive),
      },
      {
        key: 'imports',
        title: 'Imported codebases',
        description: 'Reverse-engineered repos and codebase snapshots.',
        items: visible.filter((item) => item.category === 'imports' && !item.isActive),
      },
      {
        key: 'drafts',
        title: 'Drafts and tests',
        description: 'Scratch sessions, tiny experiments and noisy one-offs.',
        items: visible.filter((item) => item.category === 'drafts' && !item.isActive),
      },
      {
        key: 'archived',
        title: 'Archived',
        description: 'Hidden from the main flow, but kept around for reference.',
        items: visible.filter((item) => item.category === 'archived' && !item.isActive),
      },
    ].filter((group) => group.items.length > 0);

    return {
      groups,
      counts: {
        total: decorated.length,
        matching: matching.length,
        visible: visible.length,
        active: decorated.filter((item) => item.isActive).length,
        manual: decorated.filter((item) => item.category === 'manual').length,
        imports: decorated.filter((item) => item.category === 'imports').length,
        drafts: decorated.filter((item) => item.category === 'drafts').length,
        archived: decorated.filter((item) => item.category === 'archived').length,
        hiddenByDefault: matching.filter((item) => item.hiddenByDefault).length,
      },
    };
  }, [activeSessionId, searchQuery, sessionFilter, showArchived, showTrivial, sortedSessions]);

  const filterOptions: Array<{ id: SessionFilter; label: string; count: number }> = [
    { id: 'all', label: 'All', count: sessionView.counts.total },
    { id: 'active', label: 'Active', count: sessionView.counts.active },
    { id: 'manual', label: 'Manual', count: sessionView.counts.manual },
    { id: 'imports', label: 'Imports', count: sessionView.counts.imports },
    { id: 'drafts', label: 'Drafts/Test', count: sessionView.counts.drafts },
    { id: 'archived', label: 'Archived', count: sessionView.counts.archived },
  ];

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

  async function handleArchiveSession(session: SessionSummary, archived: boolean) {
    setLoading(true);
    try {
      const updated = await saveSession(session.id, { archived });
      await refreshSessions();
      if (activeSessionId === session.id && archived) {
        toast.success(`Archived: ${updated.name}`);
      } else {
        toast.success(`${archived ? 'Archived' : 'Restored'}: ${updated.name}`);
      }
    } catch (error) {
      console.error(error);
      toast.error(`Failed to ${archived ? 'archive' : 'restore'} session`);
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
        className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#090b10] border border-accent/30 rounded-md overflow-hidden shadow-[0_0_40px_rgba(0,242,255,0.08)]"
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

        <div className="flex-1 overflow-y-auto p-6" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
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
            <div className="space-y-4">
              {sortedSessions.length === 0 ? (
                <div className="text-sm text-text-dim">No saved sessions yet.</div>
              ) : (
                <>
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                    <div className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                        <div className="relative">
                          <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by name, summary or session id"
                            className="w-full bg-bg border border-border-subtle rounded px-4 py-3 pr-10 text-sm text-text-main outline-none focus:border-accent"
                          />
                          {searchQuery && (
                            <button
                              onClick={() => setSearchQuery('')}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-main transition-colors"
                              aria-label="Clear search"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                        <button
                          onClick={() => setShowTrivial((current) => !current)}
                          className={`px-4 py-3 rounded border text-[11px] font-bold uppercase tracking-widest transition-colors ${
                            showTrivial
                              ? 'border-accent text-accent bg-accent/10'
                              : 'border-border-subtle text-text-dim hover:text-text-main hover:border-accent/50'
                          }`}
                        >
                          {showTrivial
                            ? 'Hide noise'
                            : sessionView.counts.hiddenByDefault > 0
                              ? `Show hidden (${sessionView.counts.hiddenByDefault})`
                              : 'No hidden noise'}
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setShowArchived((current) => !current)}
                          className={`px-3 py-2 rounded border text-[10px] font-bold uppercase tracking-widest transition-colors ${
                            showArchived
                              ? 'border-[#8be9fd] bg-[#8be9fd]/10 text-[#8be9fd]'
                              : 'border-border-subtle text-text-dim hover:text-text-main hover:border-[#8be9fd]/40'
                          }`}
                        >
                          {showArchived
                            ? 'Hide archived'
                            : sessionView.counts.archived > 0
                              ? `Show archived (${sessionView.counts.archived})`
                              : 'No archived'}
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {filterOptions.map((option) => (
                          <button
                            key={option.id}
                            onClick={() => setSessionFilter(option.id)}
                            className={`px-3 py-2 rounded border text-[10px] font-bold uppercase tracking-widest transition-colors ${
                              sessionFilter === option.id
                                ? 'border-accent bg-accent/10 text-accent'
                                : 'border-border-subtle text-text-dim hover:text-text-main hover:border-accent/40'
                            }`}
                          >
                            {option.label} · {option.count}
                          </button>
                        ))}
                      </div>

                      {!showTrivial && sessionView.counts.hiddenByDefault > 0 && (
                        <div className="rounded border border-border-subtle bg-surface/40 px-4 py-3 text-[11px] text-text-dim">
                          Hiding {sessionView.counts.hiddenByDefault} tiny or draft-like sessions to keep the list focused.
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded border border-border-subtle bg-surface/60 p-3">
                        <div className="text-[9px] uppercase tracking-[0.24em] text-text-dim">Visible now</div>
                        <div className="mt-2 text-2xl font-bold text-text-main">{sessionView.counts.visible}</div>
                        <div className="text-[10px] text-text-dim mt-1">{sessionView.counts.matching} match current search/filter</div>
                      </div>
                      <div className="rounded border border-border-subtle bg-surface/60 p-3">
                        <div className="text-[9px] uppercase tracking-[0.24em] text-text-dim">Manual</div>
                        <div className="mt-2 text-2xl font-bold text-text-main">{sessionView.counts.manual}</div>
                        <div className="text-[10px] text-text-dim mt-1">Direct blueprint workspaces</div>
                      </div>
                      <div className="rounded border border-border-subtle bg-surface/60 p-3">
                        <div className="text-[9px] uppercase tracking-[0.24em] text-text-dim">Imports</div>
                        <div className="mt-2 text-2xl font-bold text-text-main">{sessionView.counts.imports}</div>
                        <div className="text-[10px] text-text-dim mt-1">Reverse-engineered codebases</div>
                      </div>
                      <div className="rounded border border-border-subtle bg-surface/60 p-3">
                        <div className="text-[9px] uppercase tracking-[0.24em] text-text-dim">Draft/Test</div>
                        <div className="mt-2 text-2xl font-bold text-text-main">{sessionView.counts.drafts}</div>
                        <div className="text-[10px] text-text-dim mt-1">Scratch or trivial sessions</div>
                      </div>
                    </div>
                  </div>

                  {sessionView.groups.length === 0 ? (
                    <div className="rounded border border-dashed border-border-subtle bg-surface/30 px-4 py-5 text-sm text-text-dim">
                      No sessions match this view.
                      {sessionView.counts.hiddenByDefault > 0 && !showTrivial && (
                        <button
                          onClick={() => setShowTrivial(true)}
                          className="ml-2 text-accent hover:text-white transition-colors"
                        >
                          Reveal hidden drafts/tests
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {sessionView.groups.map((group) => (
                        <div key={group.key} className="space-y-3">
                          <div className="flex items-end justify-between gap-4">
                            <div>
                              <div className="text-[10px] uppercase tracking-[0.24em] text-accent font-bold">{group.title}</div>
                              <div className="text-xs text-text-dim mt-1">{group.description}</div>
                            </div>
                            <div className="text-[10px] font-mono text-text-dim shrink-0">
                              {group.items.length} session{group.items.length === 1 ? '' : 's'}
                            </div>
                          </div>

                          <div className="space-y-3">
                            {group.items.map(({ session, category, isActive }) => {
                              const summary =
                                session.importMeta?.summary ??
                                (category === 'drafts'
                                  ? 'Small scratch session with very little graph state yet.'
                                  : category === 'imports'
                                    ? 'Imported codebase session ready for review.'
                                    : 'Manual blueprint session.');

                              return (
                                <div
                                  key={session.id}
                                  className={`border rounded p-4 flex items-center justify-between gap-4 ${
                                    isActive
                                      ? 'border-accent/50 bg-accent/5 shadow-[0_0_24px_rgba(0,242,255,0.05)]'
                                      : 'border-border-subtle bg-surface/60'
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-sm font-bold text-text-main truncate">{session.name}</span>
                                      {isActive && (
                                        <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded bg-accent/10 text-accent">
                                          Active
                                        </span>
                                      )}
                                    <span
                                      className={`text-[9px] uppercase tracking-widest px-2 py-0.5 rounded ${
                                        category === 'imports'
                                          ? 'bg-[#50fa7b]/10 text-[#50fa7b]'
                                          : category === 'archived'
                                            ? 'bg-[#8be9fd]/10 text-[#8be9fd]'
                                          : category === 'drafts'
                                            ? 'bg-[#ffb86c]/10 text-[#ffb86c]'
                                            : 'bg-accent/10 text-accent'
                                      }`}
                                    >
                                      {category === 'imports'
                                        ? 'Imported'
                                        : category === 'archived'
                                          ? 'Archived'
                                          : category === 'drafts'
                                            ? 'Draft/Test'
                                            : 'Manual'}
                                    </span>
                                  </div>
                                    <div className="text-[10px] text-text-dim mt-1 font-mono">
                                      {session.nodeCount} nodes · {session.linkCount} links · updated {new Date(session.updatedAt).toLocaleString()}
                                    </div>
                                    <div className="text-[11px] text-text-dim mt-2 line-clamp-2">{summary}</div>
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
                                      onClick={() => handleArchiveSession(session, !session.archived)}
                                      disabled={loading}
                                      className="p-2 border border-border-subtle rounded text-text-dim hover:text-[#8be9fd] hover:border-[#8be9fd] transition-colors disabled:opacity-50"
                                      title={session.archived ? 'Restore session' : 'Archive session'}
                                    >
                                      {session.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
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
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
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
