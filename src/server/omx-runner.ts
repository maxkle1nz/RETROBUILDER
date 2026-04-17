import type { Request, Response } from 'express';

interface GraphNode {
  id: string;
  label: string;
  type?: string;
  description?: string;
  dependencies?: string[];
  researchContext?: string;
  constructionNotes?: string;
  acceptance_criteria?: string[];
  data_contract?: string;
}

interface SessionGraph {
  nodes: GraphNode[];
  links: Array<{ source: string; target: string }>;
}

/** Emit a structured SSE event to the response */
function emit(res: Response, data: object) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  // Force flush if available (for Express with compression middleware)
  if (typeof (res as any).flush === 'function') (res as any).flush();
}

/** Topological sort (Kahn's algorithm) — returns nodes in build order */
function topoSort(nodes: GraphNode[], links: Array<{ source: string; target: string }>): GraphNode[] {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const l of links) {
    adj.get(l.source)?.push(l.target);
    inDegree.set(l.target, (inDegree.get(l.target) ?? 0) + 1);
  }

  const queue = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0);
  const sorted: GraphNode[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);
    for (const child of adj.get(node.id) ?? []) {
      const deg = (inDegree.get(child) ?? 1) - 1;
      inDegree.set(child, deg);
      if (deg === 0) queue.push(nodes.find((n) => n.id === child)!);
    }
  }

  // Append any remaining (cycles handled gracefully)
  const sortedIds = new Set(sorted.map((n) => n.id));
  for (const n of nodes) if (!sortedIds.has(n.id)) sorted.push(n);

  return sorted;
}

/** Simulate an OMX build from the session graph, emitting SSE events */
export async function runOMXSimulation(
  graph: SessionGraph,
  res: Response,
  _req: Request,
): Promise<void> {
  const { nodes, links } = graph;
  const ordered = topoSort(nodes, links);
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const l of links) adj.get(l.source)?.push(l.target);

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Build start
  emit(res, { type: 'build_start', sessionId: 'sim', totalNodes: ordered.length });
  await delay(600);

  let totalFiles = 0;
  let totalLines = 0;
  const startTime = Date.now();

  for (const node of ordered) {
    if (res.writableEnded) break;

    const phases: Array<'scaffold' | 'implement' | 'test' | 'integrate'> = ['scaffold', 'implement', 'test', 'integrate'];
    const isGrounded = !!(node.researchContext || node.constructionNotes);
    emit(res, {
      type: 'node_start',
      nodeId: node.id,
      phase: phases[0],
      grounded: isGrounded,
      ...(isGrounded && {
        enrichment: {
          hasResearch: !!node.researchContext,
          hasNotes: !!node.constructionNotes,
          acceptanceCriteria: node.acceptance_criteria?.length ?? 0,
        },
      }),
    });

    for (let phaseIdx = 0; phaseIdx < phases.length; phaseIdx++) {
      const phase = phases[phaseIdx];
      const totalPct = phaseIdx * 25;

      // Simulate file writing within phase
      const filesInPhase = Math.floor(Math.random() * 3) + 1;
      for (let f = 0; f < filesInPhase; f++) {
        if (res.writableEnded) break;
        const fileName = generateFileName(node.id, phase, f);
        const phasePct = totalPct + Math.round(((f + 1) / filesInPhase) * 25);
        emit(res, { type: 'node_progress', nodeId: node.id, phase, pct: phasePct, currentFile: fileName });
        await delay(Math.random() * 300 + 150);
      }
    }

    if (res.writableEnded) break;

    // Complete the node
    const filesWritten = Math.floor(Math.random() * 8) + 2;
    const linesWritten = Math.floor(Math.random() * 400) + 80;
    totalFiles += filesWritten;
    totalLines += linesWritten;

    emit(res, { type: 'node_complete', nodeId: node.id, filesWritten, linesWritten });

    // Activate edges to children
    for (const childId of adj.get(node.id) ?? []) {
      emit(res, { type: 'edge_activated', source: node.id, target: childId });
    }

    await delay(Math.random() * 400 + 200);
  }

  if (!res.writableEnded) {
    emit(res, {
      type: 'build_complete',
      totalFiles,
      totalLines,
      elapsedMs: Date.now() - startTime,
    });
    // Signal SSE close
    res.write('event: done\ndata: {}\n\n');
    res.end();
  }
}

/** Generate realistic-looking file names for simulation */
function generateFileName(nodeId: string, phase: string, index: number): string {
  const slug = nodeId.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const phase_files: Record<string, string[]> = {
    scaffold:  [`src/${slug}/index.ts`, `src/${slug}/types.ts`, `src/${slug}/README.md`],
    implement: [`src/${slug}/service.ts`, `src/${slug}/handler.ts`, `src/${slug}/repository.ts`, `src/${slug}/utils.ts`],
    test:      [`tests/${slug}/unit.test.ts`, `tests/${slug}/integration.test.ts`],
    integrate: [`src/${slug}/index.ts`, `docker/${slug}.yml`],
  };
  const options = phase_files[phase] ?? [`src/${slug}/module-${index}.ts`];
  return options[index % options.length];
}
