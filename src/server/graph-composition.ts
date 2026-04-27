import { type GraphData, type NodeData } from '../lib/api.js';

export function hasPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function defaultGroupForNodeType(type: unknown) {
  switch (type) {
    case 'frontend':
      return 1;
    case 'security':
      return 2;
    case 'database':
      return 3;
    case 'backend':
      return 4;
    case 'external':
      return 5;
    default:
      return 6;
  }
}

const PRESENTATION_FRONTEND_TERMS = [
  'hero',
  'cta',
  'call to action',
  'pricing',
  'feature',
  'card',
  'grid',
  'how it works',
  'problem',
  'solution',
  'section',
  'landing content',
  'content ssot',
  'visual system',
  'testimonial',
  'faq',
  'header',
  'footer',
  'navigation',
  'gallery',
  'title screen',
  'beat lab',
  'career map',
];

function normalizedNodeText(node: Pick<NodeData, 'id' | 'label' | 'description' | 'type'>) {
  return `${node.id || ''} ${node.label || ''} ${node.description || ''} ${node.type || ''}`
    .toLowerCase()
    .replace(/[-_]+/g, ' ');
}

function isPresentationFrontendNode(node: NodeData) {
  if ((node.type || '').toLowerCase() !== 'frontend') return false;
  const text = normalizedNodeText(node);
  const hasPresentationTerm = PRESENTATION_FRONTEND_TERMS.some((term) => text.includes(term));
  if (!hasPresentationTerm) return false;
  const isWholeApp = /\b(app|application|console|dashboard|portal|crm|admin|backoffice)\b/.test(text);
  return !isWholeApp || /\b(section|hero|cta|pricing|card|grid|screen)\b/.test(text);
}

function uniqueSegment(base: string, usedIds: Set<string>) {
  const root = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'product-web-app';
  let candidate = root;
  let index = 2;
  while (usedIds.has(candidate)) {
    candidate = `${root}-${index}`;
    index += 1;
  }
  return candidate;
}

function compactList(values: Array<string | undefined>, limit: number) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].slice(0, limit);
}

export function consolidatePresentationFrontendNodes(graph: GraphData): GraphData {
  const presentationNodes = graph.nodes.filter(isPresentationFrontendNode);
  if (presentationNodes.length < 2) return graph;

  const presentationIds = new Set(presentationNodes.map((node) => node.id));
  const explicitAppNode = graph.nodes.find((node) => (
    (node.type || '').toLowerCase() === 'frontend'
    && !presentationIds.has(node.id)
    && /\b(app|application|console|dashboard|portal|crm|admin|backoffice|website|site)\b/.test(normalizedNodeText(node))
  ));
  const usedIds = new Set(graph.nodes.map((node) => node.id).filter((id) => !presentationIds.has(id)));
  const mergedId = explicitAppNode?.id || uniqueSegment('product-web-app', usedIds);
  const mergedSources = explicitAppNode ? [explicitAppNode, ...presentationNodes] : presentationNodes;
  const sourceNames = compactList(mergedSources.map((node) => node.label || node.id), 16);
  const minPriority = Math.min(...mergedSources.map((node) => hasPositiveNumber((node as any).priority) ? Math.trunc((node as any).priority) : Number.MAX_SAFE_INTEGER));
  const minGroup = Math.min(...mergedSources.map((node) => hasPositiveNumber((node as any).group) ? Math.trunc((node as any).group) : defaultGroupForNodeType(node.type)));
  const mergedNode: NodeData = {
    ...(explicitAppNode || presentationNodes[0]),
    id: mergedId,
    label: explicitAppNode?.label || 'Integrated Product Web App',
    type: 'frontend',
    status: 'pending',
    description: [
      'Single cohesive user-facing product surface that owns the visual sections, screens, navigation, and primary conversion flow.',
      `Consolidates blueprint slices into one runnable app instead of shipping separate frontend modules for ${sourceNames.join(', ')}.`,
    ].join(' '),
    data_contract: 'Input: product state, content model, user actions, and service responses -> Output: one cohesive responsive frontend experience with primary actions and validation states',
    decision_rationale: 'Frontend sections are implementation details of one product surface; keeping them in one app prevents fragmented generated workspaces while preserving testable behavior.',
    acceptance_criteria: compactList([
      'The generated frontend renders all requested sections/screens as one coherent responsive product flow',
      'Primary user actions remain reachable from the main app entrypoint without opening per-section modules',
      'The app works at mobile width without horizontal overflow or detached controls',
      ...mergedSources.flatMap((node) => node.acceptance_criteria || []),
    ], 10),
    error_handling: compactList([
      ...mergedSources.flatMap((node) => node.error_handling || []),
      'If a section payload is unavailable, render a graceful fallback inside the same app shell',
      'If an action fails, keep the user on the same surface and show actionable retry guidance',
    ], 8),
    priority: Number.isFinite(minPriority) ? minPriority : 1,
    group: Number.isFinite(minGroup) ? minGroup : defaultGroupForNodeType('frontend'),
  };

  const nodes = [
    mergedNode,
    ...graph.nodes.filter((node) => node.id !== explicitAppNode?.id && !presentationIds.has(node.id)),
  ];
  const linkKeys = new Set<string>();
  const links = graph.links.flatMap((link) => {
    const source = presentationIds.has(link.source) || link.source === explicitAppNode?.id ? mergedId : link.source;
    const target = presentationIds.has(link.target) || link.target === explicitAppNode?.id ? mergedId : link.target;
    if (source === target) return [];
    const key = `${source}->${target}:${link.label || ''}`;
    if (linkKeys.has(key)) return [];
    linkKeys.add(key);
    return [{ ...link, source, target }];
  });

  return { nodes, links };
}

export function hardenGraphForDelivery(graph: GraphData): GraphData {
  const consolidatedGraph = consolidatePresentationFrontendNodes(graph);
  const priorityById = new Map(
    consolidatedGraph.nodes
      .filter((node) => hasPositiveNumber((node as any).priority))
      .map((node) => [node.id, Math.trunc((node as any).priority)]),
  );

  const hardenedNodes = consolidatedGraph.nodes.map((node, index) => {
    const inboundPriorities = consolidatedGraph.links
      .filter((link) => link.target === node.id)
      .map((link) => priorityById.get(link.source))
      .filter((priority): priority is number => hasPositiveNumber(priority));
    const inferredPriority = inboundPriorities.length > 0
      ? Math.max(...inboundPriorities) + 1
      : index + 1;

    return {
      ...node,
      priority: hasPositiveNumber((node as any).priority)
        ? Math.trunc((node as any).priority)
        : inferredPriority,
      group: hasPositiveNumber((node as any).group)
        ? Math.trunc((node as any).group)
        : defaultGroupForNodeType(node.type),
      data_contract: node.data_contract?.trim() || `Input: ${node.label} request payload → Output: ${node.label} response with status`,
      error_handling: node.error_handling && node.error_handling.length >= 2
        ? node.error_handling
        : [
            ...(node.error_handling || []),
            ...([
              `If ${node.label} operation fails, log error with context and return structured error response`,
              `On timeout or connection failure, retry up to 3 times with exponential backoff before failing gracefully`,
            ].slice(0, 2 - (node.error_handling?.length || 0))),
          ],
      acceptance_criteria: node.acceptance_criteria && node.acceptance_criteria.length >= 2
        ? node.acceptance_criteria
        : [
            ...(node.acceptance_criteria || []),
            ...([
              `${node.label} responds to health check endpoint with 200 OK`,
              `${node.label} handles invalid input gracefully and returns 400 with descriptive error`,
            ].slice(0, 2 - (node.acceptance_criteria?.length || 0))),
          ],
    };
  });

  return { nodes: hardenedNodes, links: consolidatedGraph.links };
}
