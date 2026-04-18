import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  GraphDataSchema,
  SessionDocumentSchema,
  SessionPatchSchema,
} from './validation.js';

export type SessionSource = 'manual' | 'imported_codebase';

export interface SessionNodeData {
  id: string;
  label: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
  type: 'frontend' | 'backend' | 'database' | 'external' | 'security';
  data_contract?: string;
  decision_rationale?: string;
  acceptance_criteria?: string[];
  error_handling?: string[];
  priority?: number;
  group: number;
}

export interface SessionLinkData {
  source: string;
  target: string;
  label?: string;
}

export interface SessionGraphData {
  nodes: SessionNodeData[];
  links: SessionLinkData[];
}

export interface CodebaseImportMeta {
  sourcePath: string;
  importedAt: string;
  confidence: number;
  notes: string[];
  summary?: string;
  sourceStats?: {
    totalFiles?: number;
    totalLoc?: number;
    topFiles?: string[];
  };
}

export interface SessionDocument {
  id: string;
  name: string;
  source: SessionSource;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  manifesto: string;
  architecture: string;
  graph: SessionGraphData;
  projectContext: string;
  importMeta?: CodebaseImportMeta;
}

export interface SessionSummary {
  id: string;
  name: string;
  source: SessionSource;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  nodeCount: number;
  linkCount: number;
  importMeta?: CodebaseImportMeta;
}

export interface SessionPatch {
  name?: string;
  source?: SessionSource;
  archived?: boolean;
  manifesto?: string;
  architecture?: string;
  graph?: SessionGraphData;
  projectContext?: string;
  importMeta?: CodebaseImportMeta;
}

const ROOT_DIR = path.join(process.cwd(), '.retrobuilder');
const SESSIONS_DIR = path.join(ROOT_DIR, 'sessions');
const RUNTIME_DIR = path.join(ROOT_DIR, 'runtime');
const sessionCleanupHooks = new Set<(sessionId: string) => Promise<void> | void>();

function normalizeGraphData(input: unknown): SessionGraphData {
  const parsed = GraphDataSchema.parse(input);
  return {
    nodes: parsed.nodes.map((node) => ({
      ...node,
      status: (node.status as SessionNodeData['status']) || 'pending',
      type: (node.type as SessionNodeData['type']) || 'backend',
    })),
    links: parsed.links,
  };
}

function sessionFilePath(id: string) {
  return path.join(SESSIONS_DIR, `${id}.json`);
}

function toSummary(session: SessionDocument): SessionSummary {
  return {
    id: session.id,
    name: session.name,
    source: session.source,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    archived: session.archived,
    nodeCount: session.graph.nodes.length,
    linkCount: session.graph.links.length,
    importMeta: session.importMeta,
  };
}

async function ensureDirectories() {
  await mkdir(SESSIONS_DIR, { recursive: true });
  await mkdir(RUNTIME_DIR, { recursive: true });
}

async function readSessionFile(filePath: string): Promise<SessionDocument> {
  const content = await readFile(filePath, 'utf8');
  return SessionDocumentSchema.parse(JSON.parse(content)) as SessionDocument;
}

export function registerSessionCleanupHook(handler: (sessionId: string) => Promise<void> | void) {
  sessionCleanupHooks.add(handler);
  return () => {
    sessionCleanupHooks.delete(handler);
  };
}

export async function ensureSessionStorage() {
  await ensureDirectories();
}

export async function listSessions(): Promise<SessionSummary[]> {
  await ensureDirectories();
  const entries = await readdir(SESSIONS_DIR, { withFileTypes: true });
  const sessions: SessionSummary[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    try {
      const session = await readSessionFile(path.join(SESSIONS_DIR, entry.name));
      sessions.push(toSummary(session));
    } catch (error) {
      console.warn(`[sessions] Failed to read ${entry.name}:`, error);
    }
  }

  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadSession(id: string): Promise<SessionDocument | null> {
  await ensureDirectories();
  try {
    await stat(sessionFilePath(id));
    return await readSessionFile(sessionFilePath(id));
  } catch {
    return null;
  }
}

export async function createSession(
  input: Partial<SessionDocument> & Pick<SessionDocument, 'name'>,
): Promise<SessionDocument> {
  await ensureDirectories();

  const now = new Date().toISOString();
  const graph = normalizeGraphData(input.graph || { nodes: [], links: [] });
  const session = SessionDocumentSchema.parse({
    id: randomUUID(),
    name: input.name.trim() || 'Untitled Blueprint',
    source: input.source || 'manual',
    createdAt: now,
    updatedAt: now,
    archived: input.archived || false,
    manifesto: input.manifesto || '',
    architecture: input.architecture || '',
    graph,
    projectContext: input.projectContext || '',
    importMeta: input.importMeta,
  }) as SessionDocument;

  await writeFile(sessionFilePath(session.id), JSON.stringify(session, null, 2));
  return session;
}

export async function saveSession(id: string, patch: SessionPatch): Promise<SessionDocument> {
  const current = await loadSession(id);
  if (!current) {
    throw new Error(`Session not found: ${id}`);
  }

  const parsedPatch = SessionPatchSchema.parse(patch) as SessionPatch;
  const graph = parsedPatch.graph ? normalizeGraphData(parsedPatch.graph) : current.graph;

  const updated = SessionDocumentSchema.parse({
    ...current,
    ...parsedPatch,
    id: current.id,
    source: parsedPatch.source || current.source,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
    graph,
    importMeta: parsedPatch.importMeta === undefined ? current.importMeta : parsedPatch.importMeta,
  }) as SessionDocument;

  await writeFile(sessionFilePath(id), JSON.stringify(updated, null, 2));
  return updated;
}

export async function deleteSession(id: string) {
  await ensureDirectories();
  for (const handler of Array.from(sessionCleanupHooks)) {
    await handler(id);
  }
  await rm(path.join(RUNTIME_DIR, id), { force: true, recursive: true, maxRetries: 5, retryDelay: 50 });
  await rm(sessionFilePath(id), { force: true });
  await rm(path.join(RUNTIME_DIR, id), { force: true, recursive: true, maxRetries: 5, retryDelay: 50 });
}

export function getRuntimeDirectory(sessionId: string) {
  return path.join(RUNTIME_DIR, sessionId);
}
