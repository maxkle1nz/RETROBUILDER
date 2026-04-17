import { Router } from 'express';
import { getM1ndBridge } from '../m1nd-bridge.js';

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

  router.post('/api/m1nd/ingest', async (req, res) => {
    const { path: codePath, adapter, mode } = req.body;
    if (!codePath) return res.status(400).json({ error: "Missing 'path'" });
    const result = await getM1ndBridge().ingest(codePath, adapter || 'code', mode || 'replace');
    res.json(result || { error: 'm1nd offline' });
  });

  router.post('/api/m1nd/document/resolve', async (req, res) => {
    const { path: docPath, node_id } = req.body;
    const result = await getM1ndBridge().documentResolve(docPath, node_id);
    res.json(result || { error: 'm1nd offline' });
  });

  router.post('/api/m1nd/document/bindings', async (req, res) => {
    const { path: docPath, node_id, top_k } = req.body;
    const result = await getM1ndBridge().documentBindings(docPath, node_id, top_k || 10);
    res.json(result || { error: 'm1nd offline' });
  });

  router.post('/api/m1nd/document/drift', async (req, res) => {
    const { path: docPath, node_id } = req.body;
    const result = await getM1ndBridge().documentDrift(docPath, node_id);
    res.json(result || { error: 'm1nd offline' });
  });

  return router;
}
