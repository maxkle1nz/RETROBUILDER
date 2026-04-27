import type { SessionDocument } from './session-store.js';
import { consolidatePresentationFrontendNodes } from './graph-composition.js';
import { deriveOmxOwnershipManifest, type OmxOwnershipManifest } from './omx-ownership.js';

export type OmxTaskStatus = 'pending' | 'leased' | 'building' | 'verifying' | 'verified' | 'merged' | 'failed' | 'aborted';
export type OmxWaveStatus = 'pending' | 'running' | 'verified' | 'failed' | 'merged';

export interface OmxExecutionTask {
  taskId: string;
  nodeId: string;
  waveId: string;
  label: string;
  type: string;
  priority: number;
  dependsOnTaskIds: string[];
  readSet: string[];
  writeSet: string[];
  sharedArtifacts: string[];
  verifyCommand: string;
  completionGate: {
    verify: true;
    ownership: true;
    artifacts: true;
  };
  estimatedCost: number;
  status: OmxTaskStatus;
}

export interface OmxExecutionWave {
  waveId: string;
  taskIds: string[];
  status: OmxWaveStatus;
}

export interface OmxExecutionGraph {
  ledgerVersion: 1;
  workerCount: number;
  tasks: OmxExecutionTask[];
  waves: OmxExecutionWave[];
  ownership: OmxOwnershipManifest;
}

interface GraphNodeShape {
  id: string;
  label: string;
  type?: string;
  priority?: number;
}

function sanitizeSegment(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'module';
}

function estimateTaskCost(node: GraphNodeShape) {
  switch ((node.type || 'module').toLowerCase()) {
    case 'frontend':
      return 6;
    case 'external':
      return 5;
    case 'shared':
      return 5;
    case 'backend':
      return 4;
    default:
      return 3;
  }
}

function inferSharedArtifacts(node: GraphNodeShape) {
  switch ((node.type || 'module').toLowerCase()) {
    case 'frontend':
      return ['app/**', 'components/**', 'package.json'];
    case 'external':
      return ['integrations/**'];
    case 'shared':
      return ['shared/**', 'package.json'];
    default:
      return [];
  }
}

function patternConflicts(left: string, right: string) {
  const normalize = (value: string) => value.replace(/\/\*\*$/, '');
  const a = normalize(left);
  const b = normalize(right);
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function tasksConflict(task: OmxExecutionTask, other: OmxExecutionTask) {
  const leftPatterns = [...task.writeSet];
  const rightPatterns = [...other.writeSet];
  return leftPatterns.some((left) => rightPatterns.some((right) => patternConflicts(left, right)));
}

export function compileExecutionGraph(session: SessionDocument, workerCount = 1): OmxExecutionGraph {
  const compositionGraph = consolidatePresentationFrontendNodes(session.graph);
  const nodes = [...compositionGraph.nodes] as GraphNodeShape[];
  const links = compositionGraph.links || [];
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const link of links) {
    adjacency.get(link.source)?.push(link.target);
    inDegree.set(link.target, (inDegree.get(link.target) || 0) + 1);
  }

  const taskByNodeId = new Map<string, OmxExecutionTask>();
  const waves: OmxExecutionWave[] = [];
  const queue = nodes
    .filter((node) => (inDegree.get(node.id) || 0) === 0)
    .sort((left, right) => (left.priority || Number.MAX_SAFE_INTEGER) - (right.priority || Number.MAX_SAFE_INTEGER));

  let waveIndex = 0;
  while (queue.length > 0) {
    waveIndex += 1;
    const currentWaveNodes = [...queue]
      .sort((left, right) => (left.priority || Number.MAX_SAFE_INTEGER) - (right.priority || Number.MAX_SAFE_INTEGER) || estimateTaskCost(right) - estimateTaskCost(left));
    queue.length = 0;

    const waveId = `wave-${waveIndex}`;
    const taskIds: string[] = [];
    const deferredNodes: GraphNodeShape[] = [];
    const waveTasks: OmxExecutionTask[] = [];

    for (const node of currentWaveNodes) {
      const slug = sanitizeSegment(node.id || node.label);
      const dependsOnTaskIds = links
        .filter((link) => link.target === node.id)
        .map((link) => `task:${link.source}`);

      const task: OmxExecutionTask = {
        taskId: `task:${node.id}`,
        nodeId: node.id,
        waveId,
        label: node.label,
        type: node.type || 'module',
        priority: node.priority || waveIndex,
        dependsOnTaskIds,
        readSet: [
          '.omx/**',
          ...links
            .filter((link) => link.target === node.id)
            .map((link) => `modules/${sanitizeSegment(link.source)}/**`),
        ],
        writeSet: [`modules/${slug}/**`],
        sharedArtifacts: inferSharedArtifacts(node),
        verifyCommand: 'auto',
        completionGate: {
          verify: true,
          ownership: true,
          artifacts: true,
        },
        estimatedCost: estimateTaskCost(node),
        status: 'pending',
      };

      if (waveTasks.some((existing) => tasksConflict(existing, task))) {
        deferredNodes.push(node);
        continue;
      }

      taskByNodeId.set(node.id, task);
      taskIds.push(task.taskId);
      waveTasks.push(task);

      for (const child of adjacency.get(node.id) || []) {
        const nextDegree = (inDegree.get(child) || 1) - 1;
        inDegree.set(child, nextDegree);
        if (nextDegree === 0) {
          const childNode = nodes.find((entry) => entry.id === child);
          if (childNode) queue.push(childNode);
        }
      }
    }

    queue.push(...deferredNodes);
    waves.push({ waveId, taskIds, status: 'pending' });
  }

  const seen = new Set(taskByNodeId.keys());
  const remaining = nodes.filter((node) => !seen.has(node.id));
  if (remaining.length > 0) {
    waveIndex += 1;
    const waveId = `wave-${waveIndex}`;
    const taskIds: string[] = [];
    for (const node of remaining) {
      const slug = sanitizeSegment(node.id || node.label);
      const task: OmxExecutionTask = {
        taskId: `task:${node.id}`,
        nodeId: node.id,
        waveId,
        label: node.label,
        type: node.type || 'module',
        priority: node.priority || waveIndex,
        dependsOnTaskIds: [],
        readSet: ['.omx/**'],
        writeSet: [`modules/${slug}/**`],
        sharedArtifacts: [],
        verifyCommand: 'auto',
        completionGate: { verify: true, ownership: true, artifacts: true },
        estimatedCost: estimateTaskCost(node),
        status: 'pending',
      };
      taskByNodeId.set(node.id, task);
      taskIds.push(task.taskId);
    }
    waves.push({ waveId, taskIds, status: 'pending' });
  }

  const tasks = [...taskByNodeId.values()];
  const ownership = deriveOmxOwnershipManifest(tasks);
  return {
    ledgerVersion: 1,
    workerCount,
    tasks,
    waves,
    ownership,
  };
}

export function getTaskById(executionGraph: OmxExecutionGraph, taskId: string) {
  return executionGraph.tasks.find((task) => task.taskId === taskId) || null;
}

export function getTaskByNodeId(executionGraph: OmxExecutionGraph, nodeId: string) {
  return executionGraph.tasks.find((task) => task.nodeId === nodeId) || null;
}
