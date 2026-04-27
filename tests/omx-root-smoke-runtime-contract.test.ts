#!/usr/bin/env tsx
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { buildOmxRootComposition } from '../src/server/omx-root-composition.ts';
import type { SessionDocument } from '../src/server/session-store.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function createSession(): SessionDocument {
  return {
    id: 'session-root-smoke',
    name: 'Root Smoke',
    source: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    manifesto: 'Generate a runnable root smoke wrapper.',
    architecture: 'Frontend workspace with root smoke command.',
    projectContext: 'test',
    graph: {
      nodes: [
        { id: 'main-frontend', label: 'Main Frontend', type: 'frontend', group: 1, status: 'pending', priority: 1 },
        { id: 'secondary-screen', label: 'Secondary Story Screen', type: 'frontend', group: 1, status: 'pending', priority: 2 },
      ],
      links: [],
    },
  } as SessionDocument;
}

async function writeGeneratedFiles(rootDir: string, session: SessionDocument) {
  const files = buildOmxRootComposition(session);
  for (const file of files) {
    const targetPath = path.join(rootDir, file.path);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, file.content, 'utf8');
  }
}

async function runSmoke(rootDir: string) {
  return await new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn('npm', ['run', 'smoke'], {
      cwd: rootDir,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function reservePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('No free port')));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function runRuntimePreview(rootDir: string) {
  const port = await reservePort();
  return await new Promise<{ rootHtml: string; secondaryHtml: string; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn('node', ['scripts/start-workspace.cjs'], {
      cwd: rootDir,
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (error?: Error, payload?: { rootHtml: string; secondaryHtml: string; stdout: string; stderr: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill('SIGTERM');
      if (error) {
        reject(error);
      } else {
        resolve(payload!);
      }
    };

    const timeout = setTimeout(() => {
      finish(new Error(`Timed out waiting for generated runtime. stdout=${stdout} stderr=${stderr}`));
    }, 10_000);

    child.stdout?.on('data', async (chunk) => {
      stdout += chunk.toString('utf8');
      if (!stdout.includes('Retrobuilder generated runtime listening')) return;
      try {
        const rootResponse = await fetch(`http://127.0.0.1:${port}/`);
        const secondaryResponse = await fetch(`http://127.0.0.1:${port}/secondary-screen`);
        finish(undefined, {
          rootHtml: await rootResponse.text(),
          secondaryHtml: await secondaryResponse.text(),
          stdout,
          stderr,
        });
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (!settled && code !== 0) {
        finish(new Error(`Generated runtime exited early with ${code}. stdout=${stdout} stderr=${stderr}`));
      }
    });
  });
}

async function run() {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'omx-root-smoke-'));
  try {
    await writeGeneratedFiles(rootDir, createSession());

    const moduleDir = path.join(rootDir, 'modules', 'main-frontend');
    const secondaryModuleDir = path.join(rootDir, 'modules', 'secondary-screen');
    await mkdir(path.join(moduleDir, 'src'), { recursive: true });
    await mkdir(path.join(secondaryModuleDir, 'src'), { recursive: true });
    const modulePackage = {
      name: '@retrobuilder/main-frontend',
      private: true,
      scripts: {
        test: 'node --test src/index.test.js',
      },
    };
    await writeFile(path.join(moduleDir, 'package.json'), JSON.stringify(modulePackage, null, 2), 'utf8');
    await writeFile(path.join(secondaryModuleDir, 'package.json'), JSON.stringify({
      ...modulePackage,
      name: '@retrobuilder/secondary-screen',
    }, null, 2), 'utf8');

    await writeFile(path.join(moduleDir, 'src', 'index.js'), [
      "exports.process = () => ({ status: 'ready', moduleId: 'main-frontend' });",
      "exports.renderApp = () => '<!doctype html><html><body><main data-screen=\"main\">Main Frontend</main></body></html>';",
      '',
    ].join('\n'), 'utf8');
    await writeFile(path.join(secondaryModuleDir, 'src', 'index.js'), [
      "exports.process = () => ({ status: 'ready', moduleId: 'secondary-screen' });",
      "exports.renderApp = () => '<!doctype html><html><body><main data-screen=\"secondary\">Secondary Story Screen</main></body></html>';",
      '',
    ].join('\n'), 'utf8');

    const smokeScript = await readFile(path.join(rootDir, 'scripts', 'smoke-workspace.cjs'), 'utf8');
    expect(smokeScript.includes('node", ["scripts/start-workspace.cjs"]'), 'Expected generated root smoke script to start the runtime directly so smoke shutdown does not orphan npm child processes.');

    const result = await runSmoke(rootDir);
    expect(result.code === 0, `Expected generated root smoke command to pass. stderr=${result.stderr} stdout=${result.stdout}`);
    expect(result.stdout.includes('ready') || result.stdout.includes('Runtime smoke passed'), `Expected root smoke output to show health readiness even without a module server. Got stdout=${result.stdout}`);
    const runtime = await runRuntimePreview(rootDir);
    expect(runtime.rootHtml.includes('data-retrobuilder-runtime-nav="true"'), 'Expected generated root page to include runtime channel navigation.');
    expect(runtime.rootHtml.includes('position:sticky;top:0'), 'Expected generated root page to keep runtime navigation in flow instead of fixed over generated content.');
    expect(runtime.rootHtml.includes('href="/secondary-screen"'), 'Expected generated root page to link to secondary runtime channel.');
    expect(runtime.rootHtml.includes('data-screen="main"'), 'Expected generated root page to preserve the primary module HTML.');
    expect(runtime.secondaryHtml.includes('data-retrobuilder-runtime-nav="true"'), 'Expected generated channel page to include runtime channel navigation.');
    expect(runtime.secondaryHtml.includes('position:sticky;top:0'), 'Expected generated channel page to keep runtime navigation in flow instead of fixed over generated content.');
    expect(runtime.secondaryHtml.includes('Secondary Story Screen'), 'Expected generated channel page to render the selected module.');
    expect(runtime.secondaryHtml.includes('aria-current="page" data-active="true"'), 'Expected generated channel page to mark the active runtime channel.');
    console.log('PASS omx root smoke runtime contract');
  } finally {
    await rm(rootDir, { recursive: true, force: true }).catch(() => {});
  }
}

run().catch((error) => {
  console.error('FAIL omx root smoke runtime contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
