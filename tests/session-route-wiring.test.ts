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

function test_sessions_router_uses_consolidated_session_analysis_export() {
  const source = read('src/server/routes/sessions.ts');

  expect(
    source.includes("runSessionAdvancedAction") && source.includes("../session-analysis.js"),
    'Expected sessions router to import runSessionAdvancedAction from ../session-analysis.js.',
  );
  expect(
    !source.includes("from '../session-advanced.js'"),
    'Expected sessions router to stop importing runSessionAdvancedAction from ../session-advanced.js.',
  );
}

function test_session_advanced_module_is_a_reexport_shim() {
  const source = read('src/server/session-advanced.ts');

  expect(
    source.includes("export { runSessionAdvancedAction } from './session-analysis.js';"),
    'Expected session-advanced.ts to re-export runSessionAdvancedAction from session-analysis.ts.',
  );
  expect(
    !source.includes('export async function runSessionAdvancedAction('),
    'Expected session-advanced.ts to stop carrying its own duplicate runSessionAdvancedAction implementation.',
  );
}

function run() {
  const tests = [
    test_sessions_router_uses_consolidated_session_analysis_export,
    test_session_advanced_module_is_a_reexport_shim,
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
