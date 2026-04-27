import { Router } from 'express';
import {
  analyzeArchitectureWorkflow,
  applyProposalWorkflow,
  generateGraphStructureWorkflow,
  generateProposalWorkflow,
  performDeepResearchWorkflow,
} from '../ai-workflows.js';
import { runKompletusPipeline } from '../kompletus-pipeline.js';
import { getActiveProvider } from '../provider-runtime.js';
import { createProvider } from '../providers/index.js';

export function createAiRouter() {
  const router = Router();

  router.post('/api/ai/warmup', (req, res) => {
    const { model, provider: providerName, authProfile } = req.body;
    const provider = providerName ? createProvider(providerName) : getActiveProvider();
    if (provider.warmModel) {
      provider.warmModel(model, authProfile ? { authProfile, model } : { model }).catch(() => {});
      res.json({ status: 'warming', provider: provider.name, authProfile: authProfile || null, model: model || provider.defaultModel });
    } else {
      res.json({ status: 'not_needed', provider: provider.name });
    }
  });

  router.post('/api/ai/generateGraphStructure', async (req, res) => {
    const { prompt, currentGraph, currentManifesto, model } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: "Missing or invalid 'prompt' field." });
    }
    try {
      const result = await generateGraphStructureWorkflow({ prompt, currentGraph, currentManifesto, model });
      res.json(result);
    } catch (e: any) {
      console.error('[SSOT] Failed to generate graph structure:', e.message);
      res.status(e.statusCode || 500).json({
        error: e.message || 'Failed to generate graph structure',
        code: e.code || 'GRAPH_GENERATION_FAILED',
      });
    }
  });

  router.post('/api/ai/generateProposal', async (req, res) => {
    const { prompt, currentGraph, manifesto, model } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: "Missing or invalid 'prompt' field." });
    }
    try {
      const result = await generateProposalWorkflow({ prompt, currentGraph, manifesto, model });
      res.json(result);
    } catch (e: any) {
      console.error('[SSOT] Failed to generate proposal:', e.message);
      res.status(500).json({ error: e.message || 'Failed to generate proposal' });
    }
  });

  router.post('/api/ai/applyProposal', async (req, res) => {
    const { prompt, manifesto, currentGraph, proposal, model } = req.body;
    if (!prompt || !proposal) {
      return res.status(400).json({ error: "Missing 'prompt' or 'proposal' field." });
    }
    try {
      const result = await applyProposalWorkflow({ prompt, currentGraph, manifesto, proposal, model });
      res.json(result);
    } catch (e: any) {
      console.error('[SSOT] Failed to apply proposal:', e.message);
      res.status(500).json({ error: e.message || 'Failed to apply proposal' });
    }
  });

  router.post('/api/ai/analyzeArchitecture', async (req, res) => {
    const { graph, manifesto, model } = req.body;
    if (!graph || !graph.nodes) {
      return res.status(400).json({ error: "Missing or invalid 'graph' field." });
    }
    try {
      const result = await analyzeArchitectureWorkflow({ graph, manifesto, model });
      res.json(result);
    } catch (e: any) {
      console.error('[SSOT] Failed to analyze architecture:', e.message);
      res.status(500).json({ error: e.message || 'Failed to analyze architecture' });
    }
  });

  router.post('/api/ai/performDeepResearch', async (req, res) => {
    const { node, projectContext, model } = req.body;
    if (!node || !node.label) {
      return res.status(400).json({ error: "Missing or invalid 'node' field." });
    }
    try {
      const result = await performDeepResearchWorkflow({ node, projectContext, model });
      res.json(result);
    } catch (e: any) {
      console.error('[SSOT] Failed to perform deep research:', e.message);
      res.status(500).json({ error: e.message || 'Failed to perform deep research' });
    }
  });

  router.post('/api/ai/kompletus', async (req, res) => {
    const { prompt, model } = req.body;
    if (!prompt?.trim()) {
      return res.status(400).json({ error: "Missing 'prompt' field." });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    function sendEvent(event: string, data: unknown) {
      try {
        const payload = JSON.stringify(data);
        if (event === 'result') {
          console.log(`[KOMPLETUS] Sending result event: ${(payload.length / 1024).toFixed(1)}KB`);
        }
        res.write(`event: ${event}\ndata: ${payload}\n\n`);
      } catch (serErr: any) {
        console.error(`[KOMPLETUS] Failed to serialize ${event} event:`, serErr.message);
        res.write(`event: error\ndata: ${JSON.stringify({ error: `Serialization failed: ${serErr.message}` })}\n\n`);
      }
    }

    try {
      const result = await runKompletusPipeline(
        prompt,
        (evt) => {
          sendEvent('progress', evt);
        },
        { model, maxIterations: 2 },
      );

      const trimmedResult = {
        ...result,
        research: Object.fromEntries(
          Object.entries(result.research).map(([id, r]) => [
            id,
            {
              ...r,
              report: typeof r.report === 'string' && r.report.length > 4000
                ? r.report.substring(0, 4000) + '\n\n... [truncated for transport]'
                : r.report,
            },
          ]),
        ),
      };

      sendEvent('result', trimmedResult);
      sendEvent('done', { success: true });
    } catch (e: any) {
      console.error('[KOMPLETUS] Pipeline failed:', e.message);
      sendEvent('error', { error: e.message });
    } finally {
      res.end();
    }
  });

  return router;
}
