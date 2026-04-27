#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { ensureModulePackagingBaseline } from '../src/server/omx-module-packaging.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function run() {
  const moduleDir = await mkdtemp(path.join(tmpdir(), 'omx-module-packaging-'));
  const frontendRoot = await mkdtemp(path.join(tmpdir(), 'omx-frontend-root-'));
  const frontendDir = path.join(frontendRoot, 'main-frontend');
  const localTempRoot = path.resolve('.tmp-contracts');
  await mkdir(localTempRoot, { recursive: true });
  const legacyVerifyDir = await mkdtemp(path.join(localTempRoot, 'omx-legacy-verify-'));
  try {
    await mkdir(path.join(moduleDir, 'src'), { recursive: true });
    await writeFile(path.join(moduleDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { module: 'commonjs', target: 'ES2022', outDir: 'dist', rootDir: 'src' }, include: ['src/**/*.ts'] }, null, 2), 'utf8');
    await writeFile(path.join(moduleDir, 'src', 'main.ts'), 'export function main() { return 42; }\n', 'utf8');
    await writeFile(path.join(moduleDir, 'src', 'example.service.ts'), 'export function answer() { return 42; }\n', 'utf8');
    await writeFile(path.join(moduleDir, 'src', 'example.service.test.ts'), "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { answer } from './example.service';\ntest('answer', () => { assert.equal(answer(), 42); });\n", 'utf8');

    const result = await ensureModulePackagingBaseline(moduleDir);
    const pkg = JSON.parse(await readFile(path.join(moduleDir, 'package.json'), 'utf8'));
    const verifyScript = await readFile(path.join(moduleDir, 'scripts', 'verify.cjs'), 'utf8');

    expect(result.createdPackageJson === true, 'Expected packaging baseline to create package.json when missing.');
    expect(result.createdVerifyScript === true, 'Expected packaging baseline to create verify script when missing.');
    expect(pkg.scripts.verify === 'node scripts/verify.cjs', 'Expected generated package to expose verify script.');
    expect(pkg.scripts.build === 'tsc -p tsconfig.json', 'Expected generated package to expose build script when tsconfig exists.');
    expect(pkg.scripts.dev === 'tsx src/main.ts', 'Expected backend packaging baseline to expose dev script for runtime entrypoint.');
    expect(pkg.scripts.start === 'node dist/main.js', 'Expected backend packaging baseline to expose start script for compiled runtime entrypoint.');
    expect(verifyScript.includes("run('tsc'"), 'Expected verify script to build TypeScript modules.');
    expect(verifyScript.includes("'--import', 'tsx', '--test'"), 'Expected verify script to support src/*.test.ts execution.');
    expect(result.updatedVerifyScript === false, 'Expected fresh packaging baseline not to count as a verify-script refresh.');

    await mkdir(path.join(legacyVerifyDir, 'src'), { recursive: true });
    await mkdir(path.join(legacyVerifyDir, 'scripts'), { recursive: true });
    await writeFile(path.join(legacyVerifyDir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { module: 'commonjs', target: 'ES2022', outDir: 'dist', rootDir: 'src' },
      include: ['src/**/*.ts'],
    }, null, 2), 'utf8');
    await writeFile(path.join(legacyVerifyDir, 'src', 'inventory-risk.ts'), 'export function inventoryRisk() { return \"green\"; }\n', 'utf8');
    await writeFile(
      path.join(legacyVerifyDir, 'src', 'inventory-risk.test.ts'),
      "const test = require('node:test');\nconst assert = require('node:assert/strict');\nconst { inventoryRisk } = require('./inventory-risk');\ntest('inventory risk', () => { assert.equal(inventoryRisk(), 'green'); });\n",
      'utf8',
    );
    await writeFile(path.join(legacyVerifyDir, 'package.json'), JSON.stringify({
      name: '@retrobuilder/inventory-risk',
      private: true,
      type: 'commonjs',
      scripts: { verify: 'node scripts/verify.cjs' },
    }, null, 2), 'utf8');
    await writeFile(
      path.join(legacyVerifyDir, 'scripts', 'verify.cjs'),
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

    const legacyResult = await ensureModulePackagingBaseline(legacyVerifyDir);
    const refreshedVerifyScript = await readFile(path.join(legacyVerifyDir, 'scripts', 'verify.cjs'), 'utf8');
    expect(legacyResult.createdVerifyScript === false, 'Expected legacy verify refresh to reuse the existing verify path.');
    expect(legacyResult.updatedVerifyScript === true, 'Expected packaging baseline to refresh stale scaffold verify scripts.');
    expect(refreshedVerifyScript.includes("'--import', 'tsx', '--test'"), 'Expected refreshed verify script to discover renamed TypeScript tests.');
    const refreshedVerifyRun = spawnSync('npm', ['run', 'verify'], {
      cwd: legacyVerifyDir,
      encoding: 'utf8',
    });
    expect(refreshedVerifyRun.status === 0, `Expected refreshed verify script to pass. stderr: ${refreshedVerifyRun.stderr || ''}`);

    await mkdir(path.join(frontendDir, 'app'), { recursive: true });
    const frontendResult = await ensureModulePackagingBaseline(frontendDir);
    const frontendPkg = JSON.parse(await readFile(path.join(frontendDir, 'package.json'), 'utf8'));
    const nextConfig = await readFile(path.join(frontendDir, 'next.config.mjs'), 'utf8');
    const healthRoute = await readFile(path.join(frontendDir, 'app', 'api', 'health', 'route.ts'), 'utf8');
    const frontendVerify = await readFile(path.join(frontendDir, 'scripts', 'verify.cjs'), 'utf8');
    const appLayout = await readFile(path.join(frontendDir, 'app', 'layout.jsx'), 'utf8');
    const appPage = await readFile(path.join(frontendDir, 'app', 'page.jsx'), 'utf8');
    expect(frontendResult.createdPackageJson === true, 'Expected frontend packaging baseline to create package.json when missing.');
    expect(frontendResult.createdNextConfig === true, 'Expected frontend packaging baseline to create next.config.mjs when missing.');
    expect(frontendResult.createdHealthRoute === true, 'Expected frontend packaging baseline to create a health route when app/ exists.');
    expect(frontendResult.createdAppLayout === true, 'Expected frontend packaging baseline to create app/layout.jsx when app/ exists.');
    expect(frontendResult.createdAppPage === true, 'Expected frontend packaging baseline to create app/page.jsx when app/ exists.');
    expect(frontendPkg.type === 'module', 'Expected frontend packaging baseline to mark package as module.');
    expect(frontendPkg.scripts.dev === 'next dev', 'Expected frontend packaging baseline to create next dev script.');
    expect(frontendPkg.scripts.build === 'next build', 'Expected frontend packaging baseline to create next build script.');
    expect(frontendPkg.scripts.start === 'next start', 'Expected frontend packaging baseline to create next start script.');
    expect(frontendPkg.dependencies.next === '^15.0.0', 'Expected frontend packaging baseline to add next dependency.');
    expect(frontendPkg.dependencies.react === '^19.0.0', 'Expected frontend packaging baseline to add react dependency.');
    expect(frontendPkg.dependencies['react-dom'] === '^19.0.0', 'Expected frontend packaging baseline to add react-dom dependency.');
    expect(nextConfig.includes('reactStrictMode: true'), 'Expected frontend packaging baseline to create a minimal next.config.mjs.');
    expect(healthRoute.includes("Response.json({ status: 'ready' })"), 'Expected frontend packaging baseline to create a minimal health route.');
    expect(appLayout.includes('<html lang="en">'), 'Expected frontend packaging baseline to create a minimal app layout.');
    expect(appPage.includes('Generated workspace ready'), 'Expected frontend packaging baseline to create a minimal app page.');
    expect(frontendVerify.includes("const hasFrontendApp = existsSync(join(moduleRoot, 'app')) || existsSync(join(moduleRoot, 'pages'));"), 'Expected frontend verify script to detect app/pages frontends.');
    expect(frontendVerify.includes("run('npm', ['run', 'build']);"), 'Expected frontend verify script to execute npm run build for frontend modules.');
    console.log('PASS omx module packaging contract');
  } finally {
    await rm(moduleDir, { recursive: true, force: true }).catch(() => {});
    await rm(frontendRoot, { recursive: true, force: true }).catch(() => {});
    await rm(legacyVerifyDir, { recursive: true, force: true }).catch(() => {});
  }
}

run().catch((error) => {
  console.error('FAIL omx module packaging contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
