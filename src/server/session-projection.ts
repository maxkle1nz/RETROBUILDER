import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { getM1ndBridge } from './m1nd-bridge.js';
import { getRuntimeDirectory, type SessionDocument } from './session-store.js';

const preparedSessions = new Map<string, string>();
const runtimeArtifactFingerprints = new Map<string, string>();
let lastProjectedSessionId: string | null = null;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'node';
}

async function writeRuntimeArtifacts(session: SessionDocument, fingerprint: string) {
  const runtimeDir = getRuntimeDirectory(session.id);
  if (runtimeArtifactFingerprints.get(session.id) === fingerprint) {
    return runtimeDir;
  }
  const nodesDir = path.join(runtimeDir, 'nodes');
  await mkdir(nodesDir, { recursive: true });

  const blueprint = {
    session: {
      id: session.id,
      name: session.name,
      source: session.source,
      updatedAt: session.updatedAt,
    },
    nodes: session.graph.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      type: n.type,
      status: n.status,
      priority: n.priority,
      description: n.description,
      data_contract: n.data_contract,
      decision_rationale: n.decision_rationale,
      acceptance_criteria: n.acceptance_criteria,
      error_handling: n.error_handling,
    })),
    links: session.graph.links,
  };

  await writeFile(path.join(runtimeDir, 'blueprint.json'), JSON.stringify(blueprint, null, 2));
  await writeFile(path.join(runtimeDir, 'manifesto.md'), session.manifesto || '# Manifesto\n');
  await writeFile(path.join(runtimeDir, 'architecture.md'), session.architecture || '# Architecture\n');

  const graphIndex = [
    `# ${session.name}`,
    '',
    `Source: ${session.source}`,
    `Updated: ${session.updatedAt}`,
    '',
    '## Modules',
    ...session.graph.nodes.map((node) => `- ${node.label} (${node.type})`),
  ].join('\n');
  await writeFile(path.join(runtimeDir, 'session.md'), graphIndex);

  const topologyLines: string[] = [
    `# ${session.name} — Blueprint Topology`,
    '',
    `> ${session.graph.nodes.length} modules, ${session.graph.links.length} dependencies`,
    '',
  ];

  for (const node of session.graph.nodes) {
    const deps = session.graph.links
      .filter((l) => l.target === node.id)
      .map((l) => {
        const src = session.graph.nodes.find((n) => n.id === l.source);
        return src ? `[${src.label}](#${src.id})` : l.source;
      });
    const drives = session.graph.links
      .filter((l) => l.source === node.id)
      .map((l) => {
        const tgt = session.graph.nodes.find((n) => n.id === l.target);
        return tgt ? `[${tgt.label}](#${tgt.id})` : l.target;
      });

    topologyLines.push(
      `## ${node.label} {#${node.id}}`,
      `Type: ${node.type}`,
      `Depends: ${deps.length ? deps.join(', ') : 'None'}`,
      `Drives: ${drives.length ? drives.join(', ') : 'None'}`,
      '',
    );
  }

  await writeFile(path.join(runtimeDir, 'topology.md'), topologyLines.join('\n'));

  for (const node of session.graph.nodes) {
    const dependsOn = session.graph.links
      .filter((link) => link.target === node.id)
      .map((link) => session.graph.nodes.find((candidate) => candidate.id === link.source)?.label || link.source);
    const fanOut = session.graph.links
      .filter((link) => link.source === node.id)
      .map((link) => session.graph.nodes.find((candidate) => candidate.id === link.target)?.label || link.target);

    const doc = [
      `# ${node.label}`,
      '',
      `- id: ${node.id}`,
      `- type: ${node.type}`,
      `- status: ${node.status}`,
      `- priority: ${node.priority ?? 'unassigned'}`,
      '',
      '## Description',
      node.description || 'No description provided.',
      '',
      '## Data Contract',
      node.data_contract || 'Missing data contract.',
      '',
      '## Decision Rationale',
      node.decision_rationale || 'No rationale recorded.',
      '',
      '## Acceptance Criteria',
      ...(node.acceptance_criteria?.length
        ? node.acceptance_criteria.map((criterion) => `- ${criterion}`)
        : ['- Missing acceptance criteria']),
      '',
      '## Error Handling',
      ...(node.error_handling?.length
        ? node.error_handling.map((item) => `- ${item}`)
        : ['- Missing error handling notes']),
      '',
      '## Depends On',
      ...(dependsOn.length ? dependsOn.map((item) => `- ${item}`) : ['- None']),
      '',
      '## Drives',
      ...(fanOut.length ? fanOut.map((item) => `- ${item}`) : ['- None']),
    ].join('\n');

    await writeFile(path.join(nodesDir, `${slugify(node.label)}-${node.id}.md`), doc);
  }

  runtimeArtifactFingerprints.set(session.id, fingerprint);
  return runtimeDir;
}

function projectionFingerprint(session: SessionDocument) {
  return crypto
    .createHash('sha1')
    .update(
      JSON.stringify({
        id: session.id,
        name: session.name,
        source: session.source,
        manifesto: session.manifesto,
        architecture: session.architecture,
        projectContext: session.projectContext,
        importMeta: session.importMeta || null,
        graph: session.graph,
      }),
    )
    .digest('hex');
}

async function ensureProjectionUnlocked(session: SessionDocument) {
  const bridge = getM1ndBridge();
  const fingerprint = projectionFingerprint(session);
  const runtimeDir = await writeRuntimeArtifacts(session, fingerprint);

  if (!bridge.isConnected) {
    return { prepared: false, runtimeDir };
  }

  if (preparedSessions.get(session.id) === fingerprint && lastProjectedSessionId === session.id) {
    return { prepared: true, runtimeDir, preparedAt: session.updatedAt };
  }

  try {
    const topoPath = path.join(runtimeDir, 'topology.md');
    await bridge.ingest(topoPath, 'auto', 'replace');
    preparedSessions.set(session.id, fingerprint);
    lastProjectedSessionId = session.id;
    return { prepared: true, runtimeDir, preparedAt: session.updatedAt };
  } catch (error) {
    console.warn('[session-projection] Failed to project session into m1nd:', error);
    return { prepared: false, runtimeDir };
  }
}

export async function withProjectedSession<T>(
  session: SessionDocument,
  work: (projection: { prepared: boolean; runtimeDir: string; preparedAt?: string }, bridge: ReturnType<typeof getM1ndBridge>) => Promise<T>,
) {
  const bridge = getM1ndBridge();
  return bridge.runExclusive(async () => {
    const projection = await ensureProjectionUnlocked(session);
    return work(projection, bridge);
  });
}

export async function ensureProjection(session: SessionDocument) {
  return withProjectedSession(session, async (projection) => projection);
}
