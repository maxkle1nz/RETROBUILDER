#!/usr/bin/env tsx
import { breakCycles, enforceDAGInvariants } from '../src/server/graph-integrity.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function test_breaks_dense_graph_requiring_more_than_ten_edge_removals() {
  const nodes = Array.from({ length: 6 }, (_, index) => ({
    id: `n${index + 1}`,
    label: `Node ${index + 1}`,
    priority: index + 1,
  }));
  const links = nodes.flatMap((source) =>
    nodes
      .filter((target) => target.id !== source.id)
      .map((target) => ({ source: source.id, target: target.id })),
  );

  const repaired = breakCycles(nodes, links);
  const report = enforceDAGInvariants(nodes, repaired.links, { autoRepair: true });

  expect(repaired.removed.length > 10, 'Expected dense graph repair to remove more than ten edges.');
  expect(report.stats.cycleCount === 0, `Expected all cycles to be removed; remaining: ${report.stats.cycleCount}`);
}

function run() {
  test_breaks_dense_graph_requiring_more_than_ten_edge_removals();
  console.log('PASS graph integrity cycle breaking contract');
}

run();
