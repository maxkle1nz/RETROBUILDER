#!/usr/bin/env tsx
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ensureModulePackagingBaseline } from '../src/server/omx-module-packaging.ts';
import { runVerifyInOverlay } from '../src/server/omx-worker.ts';
import type { OmxExecutionTask } from '../src/server/omx-scheduler.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function run() {
  const localTempRoot = path.resolve('.tmp-contracts');
  await mkdir(localTempRoot, { recursive: true });
  const overlayPath = await mkdtemp(path.join(localTempRoot, 'omx-worker-verify-command-'));
  const task: OmxExecutionTask = {
    taskId: 'task:inventory-risk',
    nodeId: 'inventory-risk',
    waveId: 'wave-1',
    label: 'Inventory Risk',
    type: 'backend',
    priority: 1,
    dependsOnTaskIds: [],
    readSet: ['.omx/**'],
    writeSet: ['modules/inventory-risk/**'],
    sharedArtifacts: [],
    verifyCommand: 'auto',
    completionGate: { verify: true, ownership: true, artifacts: true },
    estimatedCost: 3,
    status: 'pending',
  };

  const moduleDir = path.join(overlayPath, 'modules', 'inventory-risk');

  try {
    await mkdir(path.join(moduleDir, 'src'), { recursive: true });
    await mkdir(path.join(moduleDir, 'scripts'), { recursive: true });
    await writeFile(path.join(moduleDir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { module: 'commonjs', target: 'ES2022', outDir: 'dist', rootDir: 'src' },
      include: ['src/**/*.ts'],
    }, null, 2), 'utf8');
    await writeFile(path.join(moduleDir, 'src', 'inventory-risk.ts'), 'export function inventoryRisk() { return "green"; }\n', 'utf8');
    await writeFile(
      path.join(moduleDir, 'src', 'inventory-risk.test.ts'),
      "const test = require('node:test');\nconst assert = require('node:assert/strict');\nconst { inventoryRisk } = require('./inventory-risk');\ntest('inventory risk', () => { assert.equal(inventoryRisk(), 'green'); });\n",
      'utf8',
    );
    await writeFile(path.join(moduleDir, 'package.json'), JSON.stringify({
      name: '@retrobuilder/inventory-risk',
      private: true,
      type: 'commonjs',
      scripts: { verify: 'node scripts/verify.cjs' },
    }, null, 2), 'utf8');
    await writeFile(
      path.join(moduleDir, 'scripts', 'verify.cjs'),
      [
        '#!/usr/bin/env node',
        "'use strict';",
        '',
        "const { spawnSync } = require('node:child_process');",
        "const path = require('node:path');",
        '',
        "const moduleRoot = path.join(__dirname, '..');",
        "const result = spawnSync(process.execPath, ['--test', 'src/index.test.js'], {",
        '  cwd: moduleRoot,',
        "  stdio: 'inherit',",
        '});',
        '',
        'process.exit(result.status ?? 1);',
        '',
      ].join('\n'),
      'utf8',
    );

    await ensureModulePackagingBaseline(moduleDir);
    const verifyReceipt = await runVerifyInOverlay(overlayPath, task);
    expect(verifyReceipt.passed, `Expected overlay verify to pass via npm script resolution: ${verifyReceipt.summary}`);
    expect(
      verifyReceipt.command === 'npm run verify --prefix modules/inventory-risk',
      `Expected overlay verify to prefer npm script execution. Got: ${verifyReceipt.command}`,
    );
    console.log('PASS omx worker verify command contract');
  } finally {
    await rm(overlayPath, { recursive: true, force: true }).catch(() => {});
  }
}

run().catch((error) => {
  console.error('FAIL omx worker verify command contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
