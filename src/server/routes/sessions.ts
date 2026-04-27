import { Router } from 'express';
import { importCodebaseToSession } from '../codebase-import.js';
import { createEphemeralSession, resolveSessionPayload } from '../session-payload.js';
import {
  activateSessionQuery,
  analyzeBlueprintGaps,
  analyzeBlueprintImpact,
  analyzeSessionReadiness,
  runSessionAdvancedAction,
} from '../session-analysis.js';
import {
  createSession,
  deleteSession,
  listSessions,
  loadSession,
  saveSession,
} from '../session-store.js';
import { chatCompletionWithFallback } from '../provider-runtime.js';
import { guardLocalPath, isLocalPathAccessError } from '../local-path-guard.js';

export function createSessionRouter() {
  const router = Router();

  router.get('/api/sessions', async (_req, res) => {
    const sessions = await listSessions();
    res.json({ sessions });
  });

  router.post('/api/sessions', async (req, res) => {
    const { name, source, manifesto, architecture, graph, projectContext, importMeta } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: "Missing or invalid 'name' field." });
    }

    const session = await createSession({
      name,
      source: source || 'manual',
      manifesto: manifesto || '',
      architecture: architecture || '',
      graph: graph || { nodes: [], links: [] },
      projectContext: projectContext || '',
      importMeta,
    });

    res.status(201).json(session);
  });

  router.post('/api/sessions/import/codebase', async (req, res) => {
    const { path: codebasePath, model } = req.body;
    if (!codebasePath || typeof codebasePath !== 'string') {
      return res.status(400).json({ error: "Missing or invalid 'path' field." });
    }

    try {
      const guardedPath = await guardLocalPath(codebasePath, { kind: 'codebase', requireDirectory: true });
      const result = await importCodebaseToSession(
        guardedPath.realPath,
        (messages, config) => chatCompletionWithFallback(messages, config || {}, 'importCodebaseToSession').then((out) => out.content),
        model,
      );
      res.status(201).json(result);
    } catch (e: any) {
      console.error('[sessions] Failed to import codebase:', e.message);
      if (isLocalPathAccessError(e)) {
        return res.status(e.statusCode).json({ error: e.message, code: e.code });
      }
      res.status(500).json({ error: e.message || 'Failed to import codebase' });
    }
  });

  router.get('/api/sessions/:id', async (req, res) => {
    const session = await loadSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    res.json(session);
  });

  router.put('/api/sessions/:id', async (req, res) => {
    try {
      const session = await saveSession(req.params.id, req.body || {});
      res.json(session);
    } catch (e: any) {
      res.status(404).json({ error: e.message || 'Session not found.' });
    }
  });

  router.delete('/api/sessions/:id', async (req, res) => {
    await deleteSession(req.params.id);
    res.status(204).end();
  });

  router.post('/api/sessions/:id/readiness', async (req, res) => {
    const draft = req.body?.draft;
    const session = await resolveSessionPayload(req.params.id, draft);
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    const report = await analyzeSessionReadiness(session);
    res.json(report);
  });

  router.post('/api/sessions/:id/impact', async (req, res) => {
    const draft = req.body?.draft;
    const session = await resolveSessionPayload(req.params.id, draft);
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    if (!req.body?.nodeId) {
      return res.status(400).json({ error: "Missing 'nodeId' field." });
    }
    try {
      const report = await analyzeBlueprintImpact(session, req.body.nodeId);
      res.json(report);
    } catch (e: any) {
      res.status(400).json({ error: e.message || 'Failed to analyze impact.' });
    }
  });

  router.post('/api/sessions/:id/gaps', async (req, res) => {
    const draft = req.body?.draft;
    const session = await resolveSessionPayload(req.params.id, draft);
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    const report = await analyzeBlueprintGaps(session);
    res.json(report);
  });

  router.post('/api/sessions/:id/activate', async (req, res) => {
    const { query, top_k, draft } = req.body;
    if (!query) {
      return res.status(400).json({ error: "Missing 'query' field." });
    }
    const session = await resolveSessionPayload(req.params.id, draft);
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    const result = await activateSessionQuery(session, query, top_k || 12);
    res.json(result);
  });

  router.post('/api/sessions/:id/advanced', async (req, res) => {
    const { action, nodeId, draft } = req.body;
    if (!action) {
      return res.status(400).json({ error: "Missing 'action' field." });
    }
    const session = await resolveSessionPayload(req.params.id, draft);
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    const result = await runSessionAdvancedAction(session, action, nodeId);
    res.json(result);
  });

  return router;
}
