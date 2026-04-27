#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const ROOT = path.resolve(import.meta.dirname, '..');

function read(relPath: string) {
  return readFileSync(path.join(ROOT, relPath), 'utf8');
}

function test_node_inspector_uses_static_api_import_for_research() {
  const source = read('src/components/NodeInspector.tsx');

  expect(source.includes("import { performDeepResearch"), 'Expected NodeInspector to statically import performDeepResearch from api.ts.');
  expect(source.includes("type NodeData"), 'Expected NodeInspector to import NodeData as a type from api.ts.');
  expect(!source.includes("await import('../lib/api')"), 'Expected NodeInspector to stop dynamically importing api.ts for deep research.');
}

function test_vite_config_declares_manual_chunks_for_ui_shell_splitting() {
  const source = read('vite.config.ts');

  expect(source.includes('manualChunks(id)'), 'Expected Vite config to define manualChunks.');
  expect(source.includes("return 'xyflow'"), 'Expected Vite manualChunks to split XYFlow vendor code.');
  expect(source.includes('modulePreload'), 'Expected Vite config to customize module preload behavior.');
  expect(source.includes('resolveDependencies'), 'Expected Vite config to filter HTML modulepreload dependencies.');
}

function test_app_uses_runtime_lazy_loading_for_heavy_surfaces() {
  const source = read('src/App.tsx');

  expect(source.includes("const BuildView = React.lazy(() => import('./components/BuildView'))"), 'Expected App shell to defer-load BuildView with React.lazy.');
  expect(source.includes("const BuildConsole = React.lazy(() => import('./components/BuildConsole'))"), 'Expected App shell to defer-load BuildConsole with React.lazy.');
  expect(source.includes("const RightPanel = React.lazy(() => import('./components/RightPanel'))"), 'Expected App shell to defer-load RightPanel with React.lazy.');
  expect(source.includes("const KompletusReport = React.lazy(() => import('./components/KompletusReport'))"), 'Expected App shell to defer-load KompletusReport with React.lazy.');
  expect(source.includes("const NodeInspector = React.lazy(() => import('./components/NodeInspector'))"), 'Expected App shell to defer-load NodeInspector with React.lazy.');
  expect(source.includes('React.Suspense'), 'Expected App shell to mount lazy surfaces inside Suspense boundaries.');
  expect(source.includes('showKompletusReport && ('), 'Expected App shell to conditionally mount KompletusReport.');
  expect(source.includes('showSessionLauncher && ('), 'Expected App shell to conditionally mount SessionLauncher.');
  expect(source.includes('(terminalOpen || isBuilding) && ('), 'Expected App shell to defer BuildConsole until it is needed.');
  expect(source.includes('<BuildView />'), 'Expected App shell to render BuildView through the lazy component.');
}

function run() {
  const tests = [
    test_node_inspector_uses_static_api_import_for_research,
    test_vite_config_declares_manual_chunks_for_ui_shell_splitting,
    test_app_uses_runtime_lazy_loading_for_heavy_surfaces,
  ];

  let passed = 0;
  for (const test of tests) {
    try {
      test();
      console.log(`PASS ${test.name}`);
      passed += 1;
    } catch (error) {
      console.error(`FAIL ${test.name}`);
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  console.log(`\n${passed}/${tests.length} tests passed`);
}

run();
