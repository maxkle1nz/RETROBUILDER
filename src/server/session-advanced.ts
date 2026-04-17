import { getM1ndBridge } from './m1nd-bridge.js';
import { withProjectedSession } from './session-projection.js';
import { type SessionDocument } from './session-store.js';

export interface SessionAdvancedReport {
  action: 'health' | 'layers' | 'metrics' | 'diagram' | 'impact' | 'predict';
  data: any;
  projection: {
    prepared: boolean;
    runtimeDir: string;
    preparedAt?: string;
  };
}

function normalizeActivationLabel(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\s*\{#.*?\}\s*$/g, '')
    .replace(/^- \[(.*?)\]\(#.*?\)$/g, '$1')
    .replace(/^- \*\*ID\*\*: `(.+?)`$/g, '$1')
    .trim()
    .toLowerCase();
}

function scoreActivationCandidate(candidate: any): number {
  const nodeId = String(candidate?.node_id || candidate?.external_id || candidate?.id || '');
  const tags = Array.isArray(candidate?.tags) ? candidate.tags.map(String) : [];
  const type = String(candidate?.type || '').toLowerCase();
  let score = typeof candidate?.activation === 'number' ? candidate.activation : 0;

  if (nodeId.includes('::section::')) score += 100;
  if (type === 'module') score += 80;
  if (tags.some((tag) => tag.includes('universal:section'))) score += 60;
  if (nodeId.includes('::binding::')) score += 20;
  if (nodeId.includes('::link::')) score -= 40;
  if (type === 'reference') score -= 20;
  if (type === 'concept') score -= 30;

  return score;
}

async function resolveNodeId(
  nodeId: string,
  session: SessionDocument,
  bridge: ReturnType<typeof getM1ndBridge>,
): Promise<string> {
  const node = session.graph.nodes.find((n) => n.id === nodeId);
  if (!node) return nodeId;

  try {
    const result = await bridge.activate(node.label, 3);
    const candidates = result?.activated || result?.results || result?.seeds || [];
    if (candidates.length > 0) {
      const normalizedTarget = normalizeActivationLabel(node.label);
      const best = [...candidates].sort((a: any, b: any) => {
        const aLabel = normalizeActivationLabel(a?.label);
        const bLabel = normalizeActivationLabel(b?.label);
        const aPreferred = aLabel === normalizedTarget ? 1 : 0;
        const bPreferred = bLabel === normalizedTarget ? 1 : 0;
        const aScore = scoreActivationCandidate(a);
        const bScore = scoreActivationCandidate(b);
        return bPreferred - aPreferred || bScore - aScore;
      })[0];
      return best.node_id || best.external_id || best.id || nodeId;
    }
  } catch {
    // Activation failed — fall through to raw ID
  }
  return nodeId;
}

export async function runSessionAdvancedAction(
  session: SessionDocument,
  action: SessionAdvancedReport['action'],
  nodeId?: string,
): Promise<SessionAdvancedReport> {
  return withProjectedSession(session, async (projection, bridge) => {
    if (!projection.prepared || !bridge.isConnected) {
      return {
        action,
        data: { error: 'm1nd offline or projection unavailable' },
        projection,
      };
    }

    let data: any = null;
    switch (action) {
      case 'health':
        data = await bridge.health();
        break;
      case 'layers':
        data = await bridge.layers();
        break;
      case 'metrics':
        data = await bridge.metrics(undefined, 15);
        break;
      case 'diagram':
        data = nodeId
          ? await bridge.diagram(await resolveNodeId(nodeId, session, bridge), 2, 'mermaid')
          : await bridge.diagram(undefined, 2, 'mermaid');
        break;
      case 'impact':
        data = nodeId
          ? await bridge.impact(await resolveNodeId(nodeId, session, bridge))
          : { error: 'Select a node first.' };
        break;
      case 'predict':
        data = nodeId
          ? await bridge.predict(await resolveNodeId(nodeId, session, bridge))
          : { error: 'Select a node first.' };
        break;
      default:
        data = { error: 'Unsupported advanced action.' };
    }

    return { action, data, projection };
  });
}
