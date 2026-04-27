import path from 'node:path';
import { access, readFile } from 'node:fs/promises';
import type { ChatMessage, CompletionConfig } from './providers/index.js';
import {
  createSession,
  saveSession,
  type SessionDocument,
  type SessionGraphData,
} from './session-store.js';
import { getM1ndBridge } from './m1nd-bridge.js';
import { validateAIResponse, SystemStateSchema } from './validation.js';
import { analyzeSessionReadiness } from './session-analysis.js';
import { guardLocalPath } from './local-path-guard.js';

export interface CodebaseImportReport {
  session: SessionDocument;
  readiness: Awaited<ReturnType<typeof analyzeSessionReadiness>>;
  importMeta: NonNullable<SessionDocument['importMeta']>;
}

async function readOptionalFile(filePath: string) {
  try {
    await access(filePath);
    return await readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function extractTopFiles(metrics: any) {
  return (metrics?.entries || [])
    .filter((entry: any) => entry?.type === 'file' && typeof entry.label === 'string')
    .filter((entry: any) => !entry.label.includes('node_modules'))
    .slice(0, 8)
    .map((entry: any) => ({
      label: entry.label,
      loc: entry.loc,
      outDegree: entry.out_degree,
    }));
}

async function buildCodebaseSummary(codebasePath: string) {
  const bridge = getM1ndBridge();
  if (!bridge.isConnected) {
    throw new Error('m1nd must be online to import a codebase.');
  }

  const { ingestResult, metrics, panoramic, layers, excerpts } = await bridge.runExclusive(async () => {
    const ingestResult = await bridge.ingest(codebasePath, 'code', 'replace');
    const [metrics, panoramic, layers] = await Promise.all([
      bridge.metrics(undefined, 20),
      bridge.panoramic(10),
      bridge.layers(),
    ]);

    const excerpts: Array<{ file: string; content: string }> = [];
    const topFiles = extractTopFiles(metrics);
    for (const file of topFiles.slice(0, 4)) {
      try {
        const view = await bridge.view(file.label, 120);
        if (view?.content) {
          excerpts.push({ file: file.label, content: String(view.content).slice(0, 2400) });
        } else if (typeof view === 'string') {
          excerpts.push({ file: file.label, content: view.slice(0, 2400) });
        }
      } catch {
        // Best effort only.
      }
    }

    return { ingestResult, metrics, panoramic, layers, excerpts };
  });

  const readme = await readOptionalFile(path.join(codebasePath, 'README.md'));
  const packageJson = await readOptionalFile(path.join(codebasePath, 'package.json'));
  const topFiles = extractTopFiles(metrics);

  return {
    ingestResult,
    metrics,
    panoramic,
    layers,
    readme: readme.slice(0, 6000),
    packageJson: packageJson.slice(0, 4000),
    topFiles,
    excerpts,
  };
}

export async function importCodebaseToSession(
  codebasePath: string,
  completeChat: (messages: ChatMessage[], config?: CompletionConfig) => Promise<string>,
  model?: string,
): Promise<CodebaseImportReport> {
  const guardedPath = await guardLocalPath(codebasePath, { kind: 'codebase', requireDirectory: true });
  const resolvedPath = guardedPath.realPath;

  const summary = await buildCodebaseSummary(resolvedPath);
  const importedAt = new Date().toISOString();
  const repoName = path.basename(resolvedPath);

  const messages = [
    {
      role: 'system' as const,
      content: `You are reverse-engineering a real codebase into a RETROBUILDER blueprint.
Return ONLY valid JSON with:
- manifesto
- architecture
- graph { nodes, links }

Rules:
- Build a directed acyclic graph for materialization.
- Preserve the current system intent; do not invent unrelated modules.
- Nodes must include id, label, description, status, type, data_contract, decision_rationale, acceptance_criteria (2-5), error_handling, priority, group.
- Links must describe real or highly likely dependencies.
- Prefer a compact but complete blueprint that an autonomous builder could execute in phases.
- If the source code suggests missing infrastructure or implicit modules, include them explicitly.
- Keep labels human-readable and stable.
- Priorities should reflect build order from foundation to interface.`,
    },
    {
      role: 'user' as const,
      content: `Codebase path: ${resolvedPath}
Repository name: ${repoName}

## Structural Summary
${JSON.stringify(
  {
    ingest: summary.ingestResult,
    topFiles: summary.topFiles,
    riskModules: summary.panoramic?.modules?.slice?.(0, 8) || [],
    layers: summary.layers?.summary || summary.layers,
    metricsSummary: summary.metrics?.summary || {},
  },
  null,
  2,
)}

## README
${summary.readme || 'No README.md found.'}

## package.json
${summary.packageJson || 'No package.json found.'}

## Key File Excerpts
${summary.excerpts
  .map((entry) => `### ${entry.file}\n${entry.content}`)
  .join('\n\n') || 'No excerpts available.'}

Generate a RETROBUILDER blueprint for this codebase.`,
    },
  ];

  const raw = await completeChat(messages, { jsonMode: true, model });
  const systemState = validateAIResponse(raw, SystemStateSchema, 'importCodebaseToSession');
  const graph: SessionGraphData = {
    nodes: systemState.graph.nodes.map((node) => ({
      ...node,
      status: (node.status as 'pending' | 'in-progress' | 'completed') || 'pending',
      type: (node.type as SessionGraphData['nodes'][number]['type']) || 'backend',
    })),
    links: systemState.graph.links,
  };

  let session = await createSession({
    name: repoName,
    source: 'imported_codebase',
    manifesto: systemState.manifesto,
    architecture: systemState.architecture,
    graph,
    projectContext: `Imported from ${resolvedPath}`,
  });

  session = await saveSession(session.id, {
    importMeta: {
      sourcePath: resolvedPath,
      importedAt,
      confidence: summary.topFiles.length >= 3 ? 0.78 : 0.62,
      notes: [
        'Blueprint synthesized from real codebase structure.',
        'Review acceptance criteria and priorities before exporting to OMX Builder.',
      ],
      summary: `Imported ${summary.metrics?.summary?.total_files || summary.ingestResult?.files_parsed || 0} files from ${repoName}.`,
      sourceStats: {
        totalFiles: summary.metrics?.summary?.total_files || summary.ingestResult?.files_parsed,
        totalLoc: summary.metrics?.summary?.total_loc,
        topFiles: summary.topFiles.map((file) => file.label),
      },
    },
  });

  const readiness = await analyzeSessionReadiness(session);

  return {
    session,
    readiness,
    importMeta: session.importMeta!,
  };
}
