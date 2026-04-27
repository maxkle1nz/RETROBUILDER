#!/usr/bin/env tsx
import type { GraphData } from '../src/lib/api.ts';

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function installLocalStorage() {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      get length() {
        return storage.size;
      },
      clear() {
        storage.clear();
      },
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      key(index: number) {
        return [...storage.keys()][index] ?? null;
      },
      removeItem(key: string) {
        storage.delete(key);
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
    },
  });
}

function graph(label: string): GraphData {
  return {
    nodes: [{
      id: 'node-a',
      label,
      description: `${label} description`,
      type: 'frontend',
      status: 'pending',
      group: 1,
    }],
    links: [],
  };
}

async function run() {
  installLocalStorage();
  const { useGraphStore } = await import('../src/store/useGraphStore.ts');

  const temporal = useGraphStore.temporal.getState();
  temporal.pause();
  useGraphStore.setState({
    activeSessionId: 'history-session',
    activeSessionName: 'History Session',
    graphData: graph('Initial Node'),
    manifesto: 'initial manifesto',
    architecture: 'initial architecture',
    projectContext: 'initial context',
    appMode: 'architect',
    sessionSaveState: 'saved',
  });
  temporal.resume();
  temporal.clear();

  useGraphStore.getState().setGraphData(graph('Updated Node'));
  expect(useGraphStore.getState().graphData.nodes[0]?.label === 'Updated Node', 'Graph update did not apply.');
  expect(useGraphStore.temporal.getState().pastStates.length === 1, 'Graph update should create one undo entry.');

  useGraphStore.temporal.getState().undo();
  expect(useGraphStore.getState().graphData.nodes[0]?.label === 'Initial Node', 'Undo should restore the previous graph.');
  expect(useGraphStore.temporal.getState().futureStates.length === 1, 'Undo should create one redo entry.');

  useGraphStore.temporal.getState().redo();
  expect(useGraphStore.getState().graphData.nodes[0]?.label === 'Updated Node', 'Redo should restore the updated graph.');

  useGraphStore.temporal.getState().clear();
  useGraphStore.getState().setSessionName('Renamed Session');
  useGraphStore.getState().setAppMode('builder');
  expect(
    useGraphStore.temporal.getState().pastStates.length === 0,
    'Session metadata and view-mode changes should not pollute graph undo history.',
  );

  console.log('PASS undo/redo history tracks graph edits and ignores UI/session metadata');
  process.exit(0);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
