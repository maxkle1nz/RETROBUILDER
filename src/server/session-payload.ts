import {
  loadSession,
  type SessionDocument,
} from './session-store.js';

export function createEphemeralSession(input: {
  id?: string;
  name?: string;
  source?: SessionDocument['source'];
  graph: { nodes: any[]; links: any[] };
  manifesto?: string;
  architecture?: string;
  projectContext?: string;
  importMeta?: SessionDocument['importMeta'];
}): SessionDocument {
  const now = new Date().toISOString();
  return {
    id: input.id || 'ephemeral-session',
    name: input.name || 'Ephemeral Session',
    source: input.source || 'manual',
    createdAt: now,
    updatedAt: now,
    archived: false,
    manifesto: input.manifesto || '',
    architecture: input.architecture || '',
    graph: input.graph || { nodes: [], links: [] },
    projectContext: input.projectContext || '',
    importMeta: input.importMeta,
  };
}

export async function resolveSessionPayload(
  sessionId: string,
  draft?: Partial<SessionDocument> & { graph?: { nodes: any[]; links: any[] } },
): Promise<SessionDocument | null> {
  if (draft) {
    return createEphemeralSession({
      id: sessionId,
      name: draft.name || 'Draft Session',
      source: draft.source || 'manual',
      graph: draft.graph || { nodes: [], links: [] },
      manifesto: draft.manifesto || '',
      architecture: draft.architecture || '',
      projectContext: draft.projectContext || '',
      importMeta: draft.importMeta,
    });
  }

  return loadSession(sessionId);
}
