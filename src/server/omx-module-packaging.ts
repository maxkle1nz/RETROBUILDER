import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

interface PackagingBaselineResult {
  createdPackageJson: boolean;
  createdVerifyScript: boolean;
  updatedVerifyScript: boolean;
  updatedPackageJson: boolean;
  createdNextConfig: boolean;
  createdHealthRoute: boolean;
  createdAppLayout: boolean;
  createdAppPage: boolean;
}

async function pathExists(targetPath: string) {
  try {
    await readFile(targetPath, 'utf8');
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(rootPath: string): Promise<string[]> {
  const entries = await readdir(rootPath, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const targetPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(targetPath));
    } else if (entry.isFile()) {
      files.push(targetPath);
    }
  }
  return files;
}

function inferModulePackageType(moduleDir: string) {
  if (isLikelyFrontendModule(moduleDir)) return 'module';
  return 'commonjs';
}

function isLikelyFrontendModule(moduleDir: string) {
  return (
    moduleDir.includes('main-frontend') ||
    existsSync(path.join(moduleDir, 'app')) ||
    existsSync(path.join(moduleDir, 'pages'))
  );
}

function detectRuntimeEntrypoint(moduleDir: string) {
  const candidates = [
    'src/main.ts',
    'src/index.ts',
    'src/server.ts',
    'src/app.ts',
    'src/main.js',
    'src/index.js',
    'src/server.js',
    'src/app.js',
  ];

  for (const candidate of candidates) {
    if (existsSync(path.join(moduleDir, candidate))) {
      return candidate;
    }
  }

  return null;
}

function toRuntimeStartPath(entrypoint: string) {
  if (entrypoint.startsWith('src/') && (entrypoint.endsWith('.ts') || entrypoint.endsWith('.tsx'))) {
    return entrypoint.replace(/^src\//, 'dist/').replace(/\.tsx?$/, '.js');
  }
  return entrypoint;
}

function buildPackageJson(moduleDir: string, existing: Record<string, unknown> | null) {
  const moduleName = path.basename(moduleDir);
  const scripts = { ...((existing?.scripts as Record<string, string> | undefined) || {}) };
  const dependencies = { ...((existing?.dependencies as Record<string, string> | undefined) || {}) };
  const peerDependencies = { ...((existing?.peerDependencies as Record<string, string> | undefined) || {}) };
  const packageJson = {
    name: (existing?.name as string | undefined) || `@retrobuilder/${moduleName}`,
    private: existing?.private ?? true,
    type: (existing?.type as string | undefined) || inferModulePackageType(moduleDir),
    scripts,
    dependencies,
  } as Record<string, unknown>;

  if (!scripts.verify) {
    scripts.verify = 'node scripts/verify.cjs';
  }
  if (!scripts.build && requireTsconfig(moduleDir)) {
    scripts.build = 'tsc -p tsconfig.json';
  }

  if (isLikelyFrontendModule(moduleDir)) {
    if (!scripts.dev) scripts.dev = 'next dev';
    if (!scripts.build) scripts.build = 'next build';
    if (!scripts.start) scripts.start = 'next start';

    dependencies.next = dependencies.next || peerDependencies.next || '^15.0.0';
    dependencies.react = dependencies.react || peerDependencies.react || '^19.0.0';
    dependencies['react-dom'] = dependencies['react-dom'] || peerDependencies['react-dom'] || '^19.0.0';
  } else {
    const runtimeEntrypoint = detectRuntimeEntrypoint(moduleDir);
    if (runtimeEntrypoint && !scripts.dev) {
      scripts.dev = `tsx ${runtimeEntrypoint}`;
    }
    if (runtimeEntrypoint && !scripts.start) {
      scripts.start = `node ${toRuntimeStartPath(runtimeEntrypoint)}`;
    }
  }

  return packageJson;
}

function requireTsconfig(moduleDir: string) {
  return existsSync(path.join(moduleDir, 'tsconfig.json'));
}

function nextConfigContent() {
  return `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
`;
}

function healthRoutePath(moduleDir: string) {
  return path.join(moduleDir, 'app', 'api', 'health', 'route.ts');
}

function healthRouteContent() {
  return `export async function GET() {
  return Response.json({ status: 'ready' });
}
`;
}

function appLayoutPath(moduleDir: string) {
  return path.join(moduleDir, 'app', 'layout.jsx');
}

function appLayoutContent() {
  return `export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;
}

function appPagePath(moduleDir: string) {
  return path.join(moduleDir, 'app', 'page.jsx');
}

function appPageContent() {
  return `export default function Page() {
  return (
    <main>
      <h1>Generated workspace ready</h1>
    </main>
  );
}
`;
}

async function collectTestFiles(moduleDir: string) {
  const srcDir = path.join(moduleDir, 'src');
  const distDir = path.join(moduleDir, 'dist');
  const srcFiles = await walkFiles(srcDir).catch(() => []);
  const distFiles = await walkFiles(distDir).catch(() => []);
  return {
    srcTsTests: srcFiles.filter((file) => file.endsWith('.test.ts')).map((file) => path.relative(moduleDir, file)),
    srcJsTests: srcFiles.filter((file) => file.endsWith('.test.js')).map((file) => path.relative(moduleDir, file)),
    distJsTests: distFiles.filter((file) => file.endsWith('.test.js')).map((file) => path.relative(moduleDir, file)),
  };
}

function buildVerifyScriptContent() {
  return `#!/usr/bin/env node

const { existsSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const moduleRoot = join(__dirname, '..');
const srcDir = join(moduleRoot, 'src');
const distDir = join(moduleRoot, 'dist');

function walk(dir) {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(target));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: moduleRoot,
    stdio: 'inherit',
    env: { ...process.env },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const hasFrontendApp = existsSync(join(moduleRoot, 'app')) || existsSync(join(moduleRoot, 'pages'));

if (existsSync(join(moduleRoot, 'tsconfig.json'))) {
  run('tsc', ['-p', 'tsconfig.json']);
}

if (hasFrontendApp && existsSync(join(moduleRoot, 'package.json'))) {
  run('npm', ['run', 'build']);
}

const distTests = walk(distDir).filter((file) => file.endsWith('.test.js')).map((file) => file.replace(moduleRoot + '/', ''));
const srcTsTests = walk(srcDir).filter((file) => file.endsWith('.test.ts')).map((file) => file.replace(moduleRoot + '/', ''));
const srcJsTests = walk(srcDir).filter((file) => file.endsWith('.test.js')).map((file) => file.replace(moduleRoot + '/', ''));

if (distTests.length > 0) {
  run('node', ['--test', ...distTests]);
} else if (srcTsTests.length > 0) {
  run('node', ['--import', 'tsx', '--test', ...srcTsTests]);
} else if (srcJsTests.length > 0) {
  run('node', ['--test', ...srcJsTests]);
}
`;
}

function shouldRefreshVerifyScript(existingContent: string | null) {
  return typeof existingContent === 'string' && existingContent.includes('src/index.test.js');
}

export async function ensureModulePackagingBaseline(moduleDir: string): Promise<PackagingBaselineResult> {
  const packageJsonPath = path.join(moduleDir, 'package.json');
  const verifyScriptPath = path.join(moduleDir, 'scripts', 'verify.cjs');
  const nextConfigPath = path.join(moduleDir, 'next.config.mjs');
  let createdPackageJson = false;
  let updatedPackageJson = false;
  let createdVerifyScript = false;
  let updatedVerifyScript = false;
  let createdNextConfig = false;
  let createdHealthRoute = false;
  let createdAppLayout = false;
  let createdAppPage = false;

  let existingPackage: Record<string, unknown> | null = null;
  if (await pathExists(packageJsonPath)) {
    existingPackage = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  }

  const nextPackage = buildPackageJson(moduleDir, existingPackage);
  const serialized = JSON.stringify(nextPackage, null, 2);
  const currentSerialized = existingPackage ? JSON.stringify(existingPackage, null, 2) : null;
  if (!existingPackage || currentSerialized !== serialized) {
    await mkdir(path.dirname(packageJsonPath), { recursive: true });
    await writeFile(packageJsonPath, serialized, 'utf8');
    createdPackageJson = !existingPackage;
    updatedPackageJson = Boolean(existingPackage);
  }

  const existingVerifyScript = await readFile(verifyScriptPath, 'utf8').catch(() => null);
  if (!existingVerifyScript || shouldRefreshVerifyScript(existingVerifyScript)) {
    await mkdir(path.dirname(verifyScriptPath), { recursive: true });
    await writeFile(verifyScriptPath, buildVerifyScriptContent(), 'utf8');
    createdVerifyScript = !existingVerifyScript;
    updatedVerifyScript = Boolean(existingVerifyScript);
  }

  if (isLikelyFrontendModule(moduleDir) && !(await pathExists(nextConfigPath))) {
    await writeFile(nextConfigPath, nextConfigContent(), 'utf8');
    createdNextConfig = true;
  }

  const healthRoute = healthRoutePath(moduleDir);
  if (isLikelyFrontendModule(moduleDir) && existsSync(path.join(moduleDir, 'app')) && !(await pathExists(healthRoute))) {
    await mkdir(path.dirname(healthRoute), { recursive: true });
    await writeFile(healthRoute, healthRouteContent(), 'utf8');
    createdHealthRoute = true;
  }

  const layoutPath = appLayoutPath(moduleDir);
  if (isLikelyFrontendModule(moduleDir) && existsSync(path.join(moduleDir, 'app')) && !(await pathExists(layoutPath))) {
    await mkdir(path.dirname(layoutPath), { recursive: true });
    await writeFile(layoutPath, appLayoutContent(), 'utf8');
    createdAppLayout = true;
  }

  const pagePath = appPagePath(moduleDir);
  if (isLikelyFrontendModule(moduleDir) && existsSync(path.join(moduleDir, 'app')) && !(await pathExists(pagePath))) {
    await mkdir(path.dirname(pagePath), { recursive: true });
    await writeFile(pagePath, appPageContent(), 'utf8');
    createdAppPage = true;
  }

  return {
    createdPackageJson,
    updatedPackageJson,
    createdVerifyScript,
    updatedVerifyScript,
    createdNextConfig,
    createdHealthRoute,
    createdAppLayout,
    createdAppPage,
  };
}
