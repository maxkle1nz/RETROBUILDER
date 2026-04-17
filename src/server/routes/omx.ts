import { Router } from 'express';
import { createEphemeralSession, resolveSessionPayload } from '../session-payload.js';
import { analyzeSessionReadiness } from '../session-analysis.js';
import { loadSession, type SessionDocument } from '../session-store.js';
import { computeTopology } from '../session-topology.js';
import { runOMXSimulation } from '../omx-runner.js';

export function createOmxRouter() {
  const router = Router();

  router.get('/api/omx/stream/:sessionId', async (req, res) => {
    const { sessionId } = req.params;

    const session = await loadSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const keepAlive = setInterval(() => {
      if (!res.writableEnded) res.write(':ping\n\n');
    }, 15000);

    req.on('close', () => clearInterval(keepAlive));

    try {
      await runOMXSimulation(session.graph as any, res, req);
    } catch (err) {
      console.error('[OMX] Simulation error:', err);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'node_error', nodeId: 'system', error: String(err), retrying: false })}\n\n`);
        res.end();
      }
    } finally {
      clearInterval(keepAlive);
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

        const topology = computeTopology(sourceSession.graph);
        const nodes = [...sourceSession.graph.nodes];
        const links = sourceSession.graph.links || [];
        const computedPriorities = new Map(topology.buildOrder.map((entry) => [entry.id, entry.priority]));

        for (const n of nodes) {
          if (!n.priority) {
            n.priority = computedPriorities.get(n.id) || 1;
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
