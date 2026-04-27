import { Router } from 'express';
import { spawn } from 'node:child_process';
import { lstat, realpath, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { createEphemeralSession, resolveSessionPayload } from '../session-payload.js';
import { analyzeSessionReadiness } from '../session-analysis.js';
import { attachOmxStream, getOmxStatus, readOmxEventHistory, recordOmxOperationalMessage, reassignOmxTaskOwnership, resumeOmxBuild, retryOmxTask, startOmxBuild, stopOmxBuild } from '../omx-runtime.js';
import { getRuntimeDirectory, loadSession, type SessionDocument } from '../session-store.js';
import { compileExecutionGraph } from '../omx-scheduler.js';
import { consolidatePresentationFrontendNodes } from '../graph-composition.js';

async function workspaceInsideRuntime(sessionId: string, workspacePath: string) {
  const runtimeDir = getRuntimeDirectory(sessionId);
  const runtimeRoot = await realpath(runtimeDir).catch(() => path.resolve(runtimeDir));
  const candidate = path.resolve(workspacePath);
  if (candidate !== runtimeRoot && !candidate.startsWith(`${runtimeRoot}${path.sep}`)) {
    return false;
  }

  const workspaceLinkStat = await lstat(workspacePath).catch(() => null);
  if (!workspaceLinkStat) {
    return true;
  }
  if (workspaceLinkStat.isSymbolicLink()) {
    return false;
  }

  const canonicalCandidate = await realpath(workspacePath).catch(() => candidate);
  return canonicalCandidate === runtimeRoot || canonicalCandidate.startsWith(`${runtimeRoot}${path.sep}`);
}

function openFolder(targetPath: string) {
  const command = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'cmd'
      : 'xdg-open';
  const args = process.platform === 'win32'
    ? ['/c', 'start', '', targetPath]
    : [targetPath];
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

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
      const message = error instanceof Error ? error.message : 'Failed to start OMX build.';
      const isCodexUnavailable = /Codex CLI is unavailable/i.test(message);
      const isDesignGateBlocked = /21st design gate blocked OMX build/i.test(message);
      const statusCode = isCodexUnavailable
        ? 503
        : isDesignGateBlocked
          ? 409
          : 500;
      const design = typeof error === 'object' && error && 'designSummary' in error
        ? (error as { designSummary?: unknown }).designSummary
        : undefined;

      if (isDesignGateBlocked) {
        const designSummary = design as {
          failingNodeIds?: string[];
          designScore?: number;
        } | undefined;
        const failingNodes = Array.isArray(designSummary?.failingNodeIds) && designSummary!.failingNodeIds.length > 0
          ? designSummary!.failingNodeIds.join(',')
          : 'unknown';
        const score = typeof designSummary?.designScore === 'number' ? designSummary.designScore : 'unknown';
        console.warn(`[OMX] Build blocked by 21st design gate. failingNodes=${failingNodes} score=${score}`);
      } else {
        console.error('[OMX] Failed to start real build:', error);
      }

      return res.status(statusCode).json(design ? { error: message, design } : { error: message });
    }
  });

  router.post('/api/omx/resume', async (req, res) => {
    const { sessionId, draft } = req.body || {};
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'Missing sessionId.' });
    }

    const session = await resolveSessionPayload(sessionId, draft);
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    try {
      const build = await resumeOmxBuild({
        session,
        source: draft ? 'session-draft' : 'persisted-session',
      });
      return res.status(202).json(build);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to resume OMX build.';
      const isCodexUnavailable = /Codex CLI is unavailable/i.test(message);
      const isDesignGateBlocked = /21st design gate blocked OMX build/i.test(message);
      const isNoResumableBuild = /No resumable OMX build found/i.test(message);
      const statusCode = isCodexUnavailable ? 503 : isDesignGateBlocked ? 409 : isNoResumableBuild ? 409 : 500;
      const design = typeof error === 'object' && error && 'designSummary' in error
        ? (error as { designSummary?: unknown }).designSummary
        : undefined;
      return res.status(statusCode).json(design ? { error: message, design } : { error: message });
    }
  });

  router.post('/api/omx/retry/:sessionId', async (req, res) => {
    const { draft, taskId } = req.body || {};
    if (!taskId || typeof taskId !== 'string') {
      return res.status(400).json({ error: 'Missing taskId.' });
    }

    const session = await resolveSessionPayload(req.params.sessionId, draft);
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    try {
      const build = await retryOmxTask({
        session,
        source: draft ? 'session-draft' : 'persisted-session',
        taskId,
      });
      return res.status(202).json(build);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to retry OMX task.';
      const isCodexUnavailable = /Codex CLI is unavailable/i.test(message);
      const isDesignGateBlocked = /21st design gate blocked OMX build/i.test(message);
      const isRetryConflict = /No retryable OMX task found|Cannot retry/i.test(message);
      const statusCode = isCodexUnavailable ? 503 : isDesignGateBlocked ? 409 : isRetryConflict ? 409 : 500;
      const design = typeof error === 'object' && error && 'designSummary' in error
        ? (error as { designSummary?: unknown }).designSummary
        : undefined;
      return res.status(statusCode).json(design ? { error: message, design } : { error: message });
    }
  });

  router.post('/api/omx/reassign/:sessionId', async (req, res) => {
    const { draft, taskId } = req.body || {};
    if (!taskId || typeof taskId !== 'string') {
      return res.status(400).json({ error: 'Missing taskId.' });
    }

    const session = await resolveSessionPayload(req.params.sessionId, draft);
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    try {
      const build = await reassignOmxTaskOwnership({
        session,
        source: draft ? 'session-draft' : 'persisted-session',
        taskId,
      });
      return res.status(202).json(build);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reassign OMX ownership.';
      const isCodexUnavailable = /Codex CLI is unavailable/i.test(message);
      const isDesignGateBlocked = /21st design gate blocked OMX build/i.test(message);
      const isReassignConflict = /No reassignable OMX task found|No shared-owner lanes can be reassigned|Cannot reassign/i.test(message);
      const statusCode = isCodexUnavailable ? 503 : isDesignGateBlocked ? 409 : isReassignConflict ? 409 : 500;
      const design = typeof error === 'object' && error && 'designSummary' in error
        ? (error as { designSummary?: unknown }).designSummary
        : undefined;
      return res.status(statusCode).json(design ? { error: message, design } : { error: message });
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

  router.get('/api/omx/history/:sessionId', async (req, res) => {
    const session = await loadSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    try {
      const buildId = typeof req.query.buildId === 'string' ? req.query.buildId : undefined;
      const events = await readOmxEventHistory(req.params.sessionId, buildId);
      return res.json({ events });
    } catch (error) {
      console.error('[OMX] Failed to read build history:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to read OMX history.' });
    }
  });

  router.post('/api/omx/open-project/:sessionId', async (req, res) => {
    const session = await loadSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    try {
      const status = await getOmxStatus(req.params.sessionId);
      const workspacePath = status.result?.documentation?.workspacePath || status.workspacePath;
      if (!workspacePath || !(await workspaceInsideRuntime(req.params.sessionId, workspacePath))) {
        return res.status(409).json({ error: 'No safe generated workspace is available for this session.' });
      }

      const workspaceStat = await stat(workspacePath).catch(() => null);
      if (!workspaceStat?.isDirectory()) {
        return res.status(404).json({ error: 'Generated workspace folder was not found.' });
      }

      await openFolder(workspacePath);
      return res.status(202).json({ ok: true, workspacePath });
    } catch (error) {
      console.error('[OMX] Failed to open generated project:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to open generated project.' });
    }
  });

  router.post('/api/omx/operation/:sessionId', async (req, res) => {
    const session = await loadSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    const { role, action, message } = req.body || {};
    if ((role !== 'user' && role !== 'system') || typeof action !== 'string' || typeof message !== 'string') {
      return res.status(400).json({ error: 'Missing operational message payload.' });
    }

    try {
      await recordOmxOperationalMessage(req.params.sessionId, { role, action, message });
      return res.status(202).json({ ok: true });
    } catch (error) {
      console.error('[OMX] Failed to persist operational message:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to persist operational message.' });
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
            error: 'Blueprint is blocked and cannot be exported to OMX Builder yet.',
            readiness,
          });
        }

        const deliveryGraph = consolidatePresentationFrontendNodes(sourceSession.graph);
        const nodes = [...deliveryGraph.nodes];
        const executionGraph = compileExecutionGraph({ ...sourceSession, graph: deliveryGraph }, 1);
        const phases = new Map<string, typeof nodes>();
        for (const wave of executionGraph.waves) {
          const waveNodes = wave.taskIds
            .map((taskId) => executionGraph.tasks.find((task) => task.taskId === taskId))
            .filter(Boolean)
            .map((task) => nodes.find((node: any) => node.id === task!.nodeId))
            .filter(Boolean) as typeof nodes;
          phases.set(wave.waveId, waveNodes);
        }

        const planLines: string[] = [
          '# OMX Execution Plan',
          '',
          '> Auto-generated from RETROBUILDER blueprint',
          `> Manifesto: ${(sourceSession.manifesto || 'Not specified').substring(0, 200)}`,
          '',
        ];

        const sortedPhases = executionGraph.waves.map((wave) => wave.waveId);
        const phaseNames = ['', 'Foundation', 'Core Services', 'Integration', 'Interface', 'Polish', 'Optimization'];

        for (const [index, waveId] of sortedPhases.entries()) {
          const phaseName = phaseNames[Math.min(index + 1, phaseNames.length - 1)] || `Wave ${index + 1}`;
          planLines.push(`## ${waveId}: ${phaseName}`);
          planLines.push('');

          for (const n of phases.get(waveId) || []) {
            planLines.push(`### ${n.label}`);
            planLines.push(`- **Type:** ${n.type}`);
            planLines.push(`- **Description:** ${n.description}`);
            if (n.data_contract) {
              planLines.push(`- **Data Contract:** ${n.data_contract}`);
            }
            if (n.decision_rationale) {
              planLines.push(`- **Rationale:** ${n.decision_rationale}`);
            }

            const task = executionGraph.tasks.find((entry) => entry.nodeId === n.id);
            const deps = (task?.dependsOnTaskIds || []).map((taskId) => {
              const upstream = executionGraph.tasks.find((entry) => entry.taskId === taskId);
              return upstream ? upstream.label : taskId;
            });
            if (deps.length > 0) {
              planLines.push(`- **Depends on:** ${deps.join(', ')}`);
            }
            if (task) {
              planLines.push(`- **Task:** ${task.taskId}`);
              planLines.push(`- **Write Set:** ${task.writeSet.join(', ')}`);
              planLines.push(`- **Verify:** ${task.verifyCommand}`);
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
          'Execute tasks in wave order. A later wave cannot start until the previous wave is verified and merged.',
          'Inside a wave, tasks are sorted by priority asc and estimated cost desc.',
          '',
          '## Verification Rules',
          '- Each module has explicit acceptance criteria',
          '- A task is COMPLETE only when verify passes and merge applies',
          '- Tasks may not write outside their write set',
          '- If verify or merge fails, the wave stops and becomes resumable',
          '',
          '## Module Summary',
        ];

        for (const task of executionGraph.tasks) {
          agentsLines.push(`- **${task.label}** (${task.waveId}, P${task.priority}, ${task.type}): node ${task.nodeId}`);
        }

        const plan = planLines.join('\n');
        const agents = agentsLines.join('\n');

        res.json({
          plan,
          agents,
          readiness,
          stats: {
            totalNodes: nodes.length,
            totalPhases: executionGraph.waves.length,
            totalAcceptanceCriteria: nodes.reduce((sum: number, n: any) => sum + (n.acceptance_criteria?.length || 0), 0),
            buildOrder: executionGraph.tasks.map((task) => ({ id: task.nodeId, label: task.label, priority: task.priority, waveId: task.waveId })),
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
