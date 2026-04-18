import { Router } from 'express';
import { createEphemeralSession, resolveSessionPayload } from '../session-payload.js';
import { analyzeSessionReadiness } from '../session-analysis.js';
import { attachOmxStream, getOmxStatus, startOmxBuild, stopOmxBuild } from '../omx-runtime.js';
import { loadSession, type SessionDocument } from '../session-store.js';

export function createOmxRouter() {
  const router = Router();

  router.post('/api/omx/build', async (req, res) => {
    const { sessionId, draft } = req.body || {};
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'Missing sessionId.' });
    }

    const session = await resolveSessionPayload(sessionId, draft);
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    try {
      const build = await startOmxBuild({
        session,
        source: draft ? 'session-draft' : 'persisted-session',
      });
      return res.status(202).json(build);
    } catch (error) {
      console.error('[OMX] Failed to start real build:', error);
      const message = error instanceof Error ? error.message : 'Failed to start OMX build.';
      const statusCode = /Codex CLI is unavailable/i.test(message) ? 503 : 500;
      return res.status(statusCode).json({ error: message });
    }
  });

  router.get('/api/omx/status/:sessionId', async (req, res) => {
    const session = await loadSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    try {
      const status = await getOmxStatus(req.params.sessionId);
      return res.json(status);
    } catch (error) {
      console.error('[OMX] Failed to fetch build status:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch OMX status.' });
    }
  });

  router.post('/api/omx/stop/:sessionId', async (req, res) => {
    const session = await loadSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    try {
      const stopped = await stopOmxBuild(req.params.sessionId);
      if (!stopped) {
        const status = await getOmxStatus(req.params.sessionId);
        return res.status(409).json({
          sessionId: req.params.sessionId,
          status: status.status,
          error: 'No active build to stop.',
        });
      }
      return res.status(202).json(stopped);
    } catch (error) {
      console.error('[OMX] Failed to stop build:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to stop OMX build.' });
    }
  });

  router.get('/api/omx/stream/:sessionId', async (req, res) => {
    const session = await loadSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    try {
      const attached = await attachOmxStream(req.params.sessionId, req, res);
      if (!attached) {
        return res.status(409).json({ error: 'No active OMX build. Start a build before attaching to the stream.' });
      }
      return;
    } catch (error) {
      console.error('[OMX] Stream attachment error:', error);
      if (!res.headersSent) {
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to attach OMX stream.' });
      }
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'node_error', nodeId: 'system', error: String(error), retrying: false })}\n\n`);
        res.end();
      }
      return;
    }
  });

  router.post('/api/export/omx', (req, res) => {
    const { graph, manifesto, architecture, sessionId, draft } = req.body;

    const run = async () => {
      try {
        let sourceSession: SessionDocument;
        if (sessionId) {
          const loaded = await resolveSessionPayload(sessionId, draft);
          if (!loaded) {
            return res.status(404).json({ error: 'Session not found.' });
          }
          sourceSession = loaded;
        } else {
          if (!graph || !graph.nodes) {
            return res.status(400).json({ error: "Missing 'graph' field." });
          }
          sourceSession = createEphemeralSession({ graph, manifesto, architecture });
        }

        const readiness = await analyzeSessionReadiness(sourceSession);
        if (!readiness.exportAllowed) {
          return res.status(409).json({
            error: 'Blueprint is blocked and cannot be exported to Ralph yet.',
            readiness,
          });
        }

        const nodes = [...sourceSession.graph.nodes];
        const links = sourceSession.graph.links || [];

        const inDegree = new Map<string, number>();
        const dependents = new Map<string, string[]>();
        for (const n of nodes) {
          inDegree.set(n.id, 0);
          dependents.set(n.id, []);
        }
        for (const l of links) {
          inDegree.set(l.target, (inDegree.get(l.target) || 0) + 1);
          if (!dependents.has(l.source)) dependents.set(l.source, []);
          dependents.get(l.source)!.push(l.target);
        }

        const queue: string[] = [];
        const order = new Map<string, number>();
        for (const [id, deg] of inDegree) {
          if (deg === 0) queue.push(id);
        }

        let level = 1;
        while (queue.length > 0) {
          const batch = [...queue];
          queue.length = 0;
          for (const id of batch) {
            order.set(id, level);
            for (const dep of dependents.get(id) || []) {
              const newDeg = (inDegree.get(dep) || 1) - 1;
              inDegree.set(dep, newDeg);
              if (newDeg === 0) queue.push(dep);
            }
          }
          level++;
        }

        for (const n of nodes) {
          if (!n.priority) {
            n.priority = order.get(n.id) || 1;
          }
        }

        const phases = new Map<number, typeof nodes>();
        for (const n of nodes) {
          const p = n.priority || 1;
          if (!phases.has(p)) phases.set(p, []);
          phases.get(p)!.push(n);
        }

        const planLines: string[] = [
          '# OMX Execution Plan',
          '',
          '> Auto-generated from RETROBUILDER blueprint',
          `> Manifesto: ${(sourceSession.manifesto || 'Not specified').substring(0, 200)}`,
          '',
        ];

        const sortedPhases = [...phases.keys()].sort((a, b) => a - b);
        const phaseNames = ['', 'Foundation', 'Core Services', 'Integration', 'Interface', 'Polish', 'Optimization'];

        for (const p of sortedPhases) {
          const phaseName = phaseNames[Math.min(p, phaseNames.length - 1)] || `Phase ${p}`;
          planLines.push(`## Phase ${p}: ${phaseName} (priority ${p})`);
          planLines.push('');

          for (const n of phases.get(p)!) {
            planLines.push(`### ${n.label}`);
            planLines.push(`- **Type:** ${n.type}`);
            planLines.push(`- **Description:** ${n.description}`);
            if (n.data_contract) {
              planLines.push(`- **Data Contract:** ${n.data_contract}`);
            }
            if (n.decision_rationale) {
              planLines.push(`- **Rationale:** ${n.decision_rationale}`);
            }

            const deps = links.filter((l: any) => l.target === n.id).map((l: any) => {
              const src = nodes.find((nn: any) => nn.id === l.source);
              return src ? src.label : l.source;
            });
            if (deps.length > 0) {
              planLines.push(`- **Depends on:** ${deps.join(', ')}`);
            }

            if (n.acceptance_criteria && n.acceptance_criteria.length > 0) {
              planLines.push(`- **Acceptance Criteria:**`);
              for (const ac of n.acceptance_criteria) {
                planLines.push(`  - [ ] ${ac}`);
              }
            }

            if (n.error_handling && n.error_handling.length > 0) {
              planLines.push(`- **Error Handling:**`);
              for (const eh of n.error_handling) {
                planLines.push(`  - ${eh}`);
              }
            }

            planLines.push('');
          }
        }

        const agentsLines: string[] = [
          '# AGENTS.md',
          '',
          '> Auto-generated from RETROBUILDER blueprint',
          '',
          '## Project Overview',
          sourceSession.manifesto || 'No manifesto provided.',
          '',
          '## Architecture',
          sourceSession.architecture || 'No architecture specified.',
          '',
          '## Build Order',
          'Execute modules in priority order. Lower numbers are built first.',
          'Do NOT start a higher-priority module until all its dependencies are verified.',
          '',
          '## Verification Rules',
          '- Each module has explicit acceptance criteria',
          '- A module is COMPLETE only when ALL acceptance criteria pass',
          '- Run tests after each module completion',
          '- If a criterion fails, fix and re-verify before proceeding',
          '',
          '## Module Summary',
        ];

        for (const n of nodes.sort((a: any, b: any) => (a.priority || 0) - (b.priority || 0))) {
          agentsLines.push(`- **${n.label}** (P${n.priority || '?'}, ${n.type}): ${n.description.substring(0, 100)}`);
        }

        const plan = planLines.join('\n');
        const agents = agentsLines.join('\n');

        res.json({
          plan,
          agents,
          readiness,
          stats: {
            totalNodes: nodes.length,
            totalPhases: sortedPhases.length,
            totalAcceptanceCriteria: nodes.reduce((sum: number, n: any) => sum + (n.acceptance_criteria?.length || 0), 0),
            buildOrder: nodes
              .sort((a: any, b: any) => (a.priority || 0) - (b.priority || 0))
              .map((n: any) => ({ id: n.id, label: n.label, priority: n.priority })),
          },
        });
      } catch (e: any) {
        console.error('[SSOT] Failed to export OMX plan:', e.message);
        res.status(500).json({ error: e.message || 'Failed to export OMX plan' });
      }
    };

    run();
  });

  return router;
}
