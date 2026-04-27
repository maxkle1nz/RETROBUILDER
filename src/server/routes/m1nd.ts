import { Router, type Response } from 'express';
import { getM1ndBridge } from '../m1nd-bridge.js';
import { guardLocalPath, isLocalPathAccessError } from '../local-path-guard.js';

function sendPathGuardError(res: Response, error: unknown) {
  if (isLocalPathAccessError(error)) {
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return true;
  }
  return false;
}

export function createM1ndRouter() {
  const router = Router();

  router.get('/api/m1nd/health', async (_req, res) => {
    const m = getM1ndBridge();
    if (!m.isConnected) {
      return res.json({ connected: false, nodeCount: 0, edgeCount: 0, graphState: 'offline' });
    }
    const health = await m.health();
    res.json(health || { connected: false, nodeCount: 0, edgeCount: 0, graphState: 'error' });
  });

  router.post('/api/m1nd/activate', async (req, res) => {
    const { query, top_k } = req.body;
    if (!query) return res.status(400).json({ error: "Missing 'query'" });
    const result = await getM1ndBridge().activate(query, top_k || 20);
    res.json(result || { error: 'm1nd offline' });
  });

  router.post('/api/m1nd/impact', async (req, res) => {
    const { node_id, direction } = req.body;
    if (!node_id) return res.status(400).json({ error: "Missing 'node_id'" });
    const result = await getM1ndBridge().impact(node_id, direction || 'forward');
    res.json(result || { error: 'm1nd offline' });
  });

  router.post('/api/m1nd/predict', async (req, res) => {
    const { changed_node, top_k } = req.body;
    if (!changed_node) return res.status(400).json({ error: "Missing 'changed_node'" });
    const result = await getM1ndBridge().predict(changed_node, top_k || 10);
    res.json(result || { error: 'm1nd offline' });
  });

  router.post('/api/m1nd/hypothesize', async (req, res) => {
    const { claim } = req.body;
    if (!claim) return res.status(400).json({ error: "Missing 'claim'" });
    const result = await getM1ndBridge().hypothesize(claim);
    res.json(result || { error: 'm1nd offline' });
  });

  router.post('/api/m1nd/validate-plan', async (req, res) => {
    const { actions } = req.body;
    if (!actions || !Array.isArray(actions)) return res.status(400).json({ error: "Missing 'actions' array" });
    const result = await getM1ndBridge().validatePlan(actions);
    res.json(result || { error: 'm1nd offline' });
  });

  router.post('/api/m1nd/panoramic', async (req, res) => {
    const { top_n } = req.body;
    const result = await getM1ndBridge().panoramic(top_n || 30);
    res.json(result || { error: 'm1nd offline' });
  });

  router.post('/api/m1nd/diagram', async (req, res) => {
    const { center, depth, format } = req.body;
    const result = await getM1ndBridge().diagram(center, depth || 2, format || 'mermaid');
    res.json(result || { error: 'm1nd offline' });
  });

  router.post('/api/m1nd/layers', async (_req, res) => {
    const result = await getM1ndBridge().layers();
    res.json(result || { error: 'm1nd offline' });
  });

  router.post('/api/m1nd/metrics', async (req, res) => {
    const { scope, top_k } = req.body;
    const result = await getM1ndBridge().metrics(scope, top_k || 30);
    res.json(result || { error: 'm1nd offline' });
  });

  router.post('/api/m1nd/search', async (req, res) => {
    const { query, mode, top_k } = req.body;
    if (!query) return res.status(400).json({ error: "Missing 'query'" });
    const result = await getM1ndBridge().search(query, mode || 'semantic', top_k || 20);
    res.json(result || { error: 'm1nd offline' });
  });

  router.post('/api/m1nd/missing', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "Missing 'query'" });
    const result = await getM1ndBridge().missing(query);
    res.json(result || { error: 'm1nd offline' });
  });

  router.post('/api/m1nd/ingest', async (req, res) => {
    const { path: codePath, adapter, mode } = req.body;
    if (!codePath) return res.status(400).json({ error: "Missing 'path'" });
    try {
      const guardedPath = await guardLocalPath(codePath, { kind: 'codebase' });
      const result = await getM1ndBridge().ingest(guardedPath.realPath, adapter || 'code', mode || 'replace');
      res.json(result || { error: 'm1nd offline' });
    } catch (error) {
      if (!sendPathGuardError(res, error)) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'm1nd ingest failed' });
      }
    }
  });

  router.post('/api/m1nd/structural-context', async (req, res) => {
    const { file_path, symbol } = req.body;
    if (!file_path) return res.status(400).json({ error: "Missing 'file_path'" });
    try {
      const guardedPath = await guardLocalPath(file_path, { kind: 'file' });
      const result = await getM1ndBridge().surgicalContext(guardedPath.realPath, symbol);
      res.json(result || { error: 'm1nd offline' });
    } catch (error) {
      if (!sendPathGuardError(res, error)) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'm1nd structural context failed' });
      }
    }
  });

  router.post('/api/m1nd/document/resolve', async (req, res) => {
    const { path: docPath, node_id } = req.body;
    try {
      const guardedPath = docPath ? await guardLocalPath(docPath, { kind: 'document' }) : null;
      const result = await getM1ndBridge().documentResolve(guardedPath?.realPath, node_id);
      res.json(result || { error: 'm1nd offline' });
    } catch (error) {
      if (!sendPathGuardError(res, error)) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'm1nd document resolve failed' });
      }
    }
  });

  router.post('/api/m1nd/document/bindings', async (req, res) => {
    const { path: docPath, node_id, top_k } = req.body;
    try {
      const guardedPath = docPath ? await guardLocalPath(docPath, { kind: 'document' }) : null;
      const result = await getM1ndBridge().documentBindings(guardedPath?.realPath, node_id, top_k || 10);
      res.json(result || { error: 'm1nd offline' });
    } catch (error) {
      if (!sendPathGuardError(res, error)) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'm1nd document bindings failed' });
      }
    }
  });

  router.post('/api/m1nd/document/drift', async (req, res) => {
    const { path: docPath, node_id } = req.body;
    try {
      const guardedPath = docPath ? await guardLocalPath(docPath, { kind: 'document' }) : null;
      const result = await getM1ndBridge().documentDrift(guardedPath?.realPath, node_id);
      res.json(result || { error: 'm1nd offline' });
    } catch (error) {
      if (!sendPathGuardError(res, error)) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'm1nd document drift failed' });
      }
    }
  });

  return router;
}
