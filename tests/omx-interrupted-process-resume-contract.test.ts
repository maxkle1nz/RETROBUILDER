#!/usr/bin/env tsx
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile as writeFsFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { createSession, deleteSession, getRuntimeDirectory, type SessionDocument } from '../src/server/session-store.ts';

const require = createRequire(import.meta.url);
const TSX_CLI_PATH = require.resolve('tsx/cli');
const REPO_ROOT = process.cwd();
const ROUTER_MODULE_PATH = path.join(REPO_ROOT, 'src', 'server', 'routes', 'omx.ts');

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function safeJson(text: string) {
  try { return JSON.parse(text); } catch { return null; }
}

async function stopProcessesByPattern(pattern: string) {
  await new Promise<void>((resolve) => {
    const child = spawn('pkill', ['-f', pattern], { stdio: 'ignore' });
    child.once('error', () => resolve());
    child.once('exit', () => resolve());
  });
}

async function setupFakeCodex() {
  const fakeBinDir = await mkdtemp(path.join(tmpdir(), 'omx-interrupted-process-fake-codex-'));
  const fakeCodexPath = path.join(fakeBinDir, 'codex');

  await writeFsFile(
    fakeCodexPath,
    [
      '#!/bin/sh',
      'if [ "$1" = "--version" ]; then',
      '  echo "codex 0.0-test"',
      '  exit 0',
      'fi',
      'if [ "$1" = "exec" ]; then',
      '  args="$*"',
      '  if printf "%s" "$args" | grep -q "Artist Service"; then',
      '    sleep 0',
      '  elif printf "%s" "$args" | grep -q "Catalog Service"; then',
      '    sleep 10',
      '  elif printf "%s" "$args" | grep -q "Compliance Manager"; then',
      '    sleep 10',
      '  else',
      '    sleep 2',
      '  fi',
      '  echo "{\\"ok\\":true,\\"source\\":\\"fake-codex\\"}"',
      '  exit 0',
      'fi',
      'exit 0',
      '',
    ].join('\n'),
    'utf8',
  );
  await chmod(fakeCodexPath, 0o755);

  return {
    env: {
      ...process.env,
      PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH || ''}`,
      OMX_WORKER_COUNT: '2',
    },
    cleanup: async () => {
      await stopProcessesByPattern(fakeCodexPath);
      await rm(fakeBinDir, { force: true, recursive: true }).catch(() => {});
    },
  };
}

async function createServerScript() {
  const tempRoot = path.join(REPO_ROOT, '.retrobuilder', 'tmp-tests');
  await mkdir(tempRoot, { recursive: true });
  const scriptDir = await mkdtemp(path.join(tempRoot, 'omx-interrupted-process-server-'));
  const scriptPath = path.join(scriptDir, 'omx-router-server.ts');
  await writeFsFile(
    scriptPath,
    [
      "import express from 'express';",
      `import { createOmxRouter } from ${JSON.stringify(ROUTER_MODULE_PATH)};`,
      '',
      'const app = express();',
      'app.use(express.json());',
      'app.use(createOmxRouter());',
      '',
      "const server = app.listen(0, '127.0.0.1', () => {",
      '  const address = server.address();',
      "  if (!address || typeof address === 'string') throw new Error('No port');",
      "  process.stdout.write(`READY ${address.port}\\n`);",
      '});',
      '',
      'const shutdown = () => {',
      '  server.close(() => process.exit(0));',
      '};',
      "process.on('SIGTERM', shutdown);",
      "process.on('SIGINT', shutdown);",
      '',
    ].join('\n'),
    'utf8',
  );

  return {
    scriptPath,
    cleanup: async () => {
      await rm(scriptDir, { force: true, recursive: true }).catch(() => {});
    },
  };
}

async function startOmxServerProcess(scriptPath: string, env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, [TSX_CLI_PATH, scriptPath], {
    cwd: REPO_ROOT,
    detached: true,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  let ready = false;

  const baseUrl = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for OMX child server readiness. stdout=${stdout} stderr=${stderr}`));
    }, 10_000);

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      if (ready) return;
      clearTimeout(timeout);
      reject(new Error(`OMX child server exited before readiness. code=${code} signal=${signal} stdout=${stdout} stderr=${stderr}`));
    };

    child.once('exit', onExit);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    const consume = (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('READY ')) continue;
        ready = true;
        clearTimeout(timeout);
        child.off('exit', onExit);
        const port = Number(line.slice('READY '.length));
        resolve(`http://127.0.0.1:${port}`);
      }
    };

    child.stdout?.on('data', consume);
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
  });

  return {
    baseUrl,
    child,
    logs: () => ({ stdout, stderr }),
  };
}

async function stopServerProcess(server: { child: ChildProcess; logs: () => { stdout: string; stderr: string } } | null, signal: NodeJS.Signals) {
  if (!server) return;
  if (server.child.exitCode !== null || server.child.signalCode) return;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for OMX child server shutdown. stdout=${server.logs().stdout} stderr=${server.logs().stderr}`));
    }, 10_000);

    server.child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });

    let killed = false;
    if (server.child.pid) {
      try {
        process.kill(-server.child.pid, signal);
        killed = true;
      } catch {
        killed = server.child.kill(signal);
      }
    } else {
      killed = server.child.kill(signal);
    }
    if (!killed) {
      clearTimeout(timeout);
      resolve();
    }
  }).catch(async () => {
    if (server.child.exitCode === null && !server.child.signalCode) {
      if (server.child.pid) {
        try {
          process.kill(-server.child.pid, 'SIGKILL');
        } catch {
          server.child.kill('SIGKILL');
        }
      } else {
        server.child.kill('SIGKILL');
      }
    }
    await new Promise<void>((resolve) => {
      server.child.once('exit', () => resolve());
      setTimeout(() => resolve(), 2_000);
    });
  });
}

async function createParallelSession(): Promise<SessionDocument> {
  return createSession({
    name: `OMX Interrupted Process Resume ${Date.now()}`,
    source: 'manual',
    manifesto: 'Crash-style interruption should preserve resumable truth.',
    architecture: 'Same-wave tasks recover after leader process death.',
    projectContext: 'interrupted process resume contract',
    graph: {
      nodes: [
        { id: 'artist-service', label: 'Artist Service', type: 'backend', group: 1, status: 'pending', priority: 1, description: 'Artist logic', data_contract: 'x', acceptance_criteria: ['Stores artists.'], error_handling: ['Returns structured errors.'] },
        { id: 'catalog-service', label: 'Catalog Service', type: 'backend', group: 1, status: 'pending', priority: 1, description: 'Catalog logic', data_contract: 'y', acceptance_criteria: ['Searches catalog.'], error_handling: ['Returns structured errors.'] },
        { id: 'compliance-manager', label: 'Compliance Manager', type: 'backend', group: 1, status: 'pending', priority: 1, description: 'Compliance logic', data_contract: 'z', acceptance_criteria: ['Tracks consent.'], error_handling: ['Returns structured errors.'] },
      ],
      links: [],
    },
  });
}

async function pollStatus(
  baseUrl: string,
  sessionId: string,
  predicate: (status: any) => boolean,
  attempts = 20,
) {
  for (let i = 0; i < attempts; i += 1) {
    const response = await fetch(`${baseUrl}/api/omx/status/${sessionId}`);
    const text = await response.text();
    const data = safeJson(text);
    if (response.status === 200 && predicate(data)) return data;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Timed out waiting for OMX status predicate.');
}

async function readHistory(baseUrl: string, sessionId: string) {
  const response = await fetch(`${baseUrl}/api/omx/history/${sessionId}`);
  const text = await response.text();
  const data = safeJson(text) as { events?: Array<Record<string, unknown>> } | null;
  expect(response.status === 200, `Expected history read. Got ${response.status}: ${text}`);
  return data?.events || [];
}

async function pollHistory(
  baseUrl: string,
  sessionId: string,
  predicate: (events: Array<Record<string, unknown>>) => boolean,
  attempts = 20,
) {
  for (let i = 0; i < attempts; i += 1) {
    const events = await readHistory(baseUrl, sessionId);
    if (predicate(events)) return events;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Timed out waiting for OMX history predicate.');
}

async function run() {
  const session = await createParallelSession();
  const runtimeDir = getRuntimeDirectory(session.id);
  const fakeCodex = await setupFakeCodex();
  const serverScript = await createServerScript();
  let firstServer: Awaited<ReturnType<typeof startOmxServerProcess>> | null = null;
  let secondServer: Awaited<ReturnType<typeof startOmxServerProcess>> | null = null;

  try {
    firstServer = await startOmxServerProcess(serverScript.scriptPath, fakeCodex.env);

    const startRes = await fetch(`${firstServer.baseUrl}/api/omx/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.id }),
    });
    const startText = await startRes.text();
    const startData = safeJson(startText) as Record<string, unknown> | null;
    expect(startRes.status === 202, `Expected build start. Got ${startRes.status}: ${startText}`);
    expect((startData?.workerCount as number) === 2, `Expected workerCount=2. Got: ${startText}`);

    const activeStatus = await pollStatus(
      firstServer.baseUrl,
      session.id,
      (status) => typeof status?.completedNodes === 'number' && status.completedNodes >= 1 && Array.isArray(status?.activeTasks) && status.activeTasks.length >= 1,
      40,
    );
    expect(activeStatus.completedNodes === 1, `Expected one task to finish before crash. Got: ${JSON.stringify(activeStatus)}`);

    const preCrashHistory = await readHistory(firstServer.baseUrl, session.id);
    const preCrashCompletedTaskIds = new Set(
      preCrashHistory
        .filter((event) => event.type === 'task_completed' && typeof event.taskId === 'string')
        .map((event) => String(event.taskId)),
    );
    expect(preCrashCompletedTaskIds.size === 1, `Expected exactly one completed task before crash. Got: ${JSON.stringify([...preCrashCompletedTaskIds])}`);

    await stopServerProcess(firstServer, 'SIGKILL');
    firstServer = null;

    const persistedText = await readFile(path.join(runtimeDir, 'omx-status.json'), 'utf8');
    const persisted = safeJson(persistedText) as Record<string, unknown> | null;
    expect(Boolean(persisted), 'Expected persisted OMX status after process crash.');
    expect(
      persisted?.status === 'running' || persisted?.status === 'queued',
      `Expected crashed runtime to leave resumable running/queued status. Got: ${persistedText}`,
    );
    expect(persisted?.completedNodes === 1, `Expected persisted crash snapshot to preserve completed work. Got: ${persistedText}`);

    secondServer = await startOmxServerProcess(serverScript.scriptPath, fakeCodex.env);

    const interruptedStatus = await pollStatus(
      secondServer.baseUrl,
      session.id,
      (status) => status?.resumeAvailable === true && status?.resumeReason === 'interrupted',
      40,
    );
    expect(interruptedStatus.completedNodes === 1, `Expected interrupted status to preserve completed task count. Got: ${JSON.stringify(interruptedStatus)}`);

    const resumeRes = await fetch(`${secondServer.baseUrl}/api/omx/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.id }),
    });
    const resumeText = await resumeRes.text();
    const resumeData = safeJson(resumeText) as Record<string, unknown> | null;
    expect(resumeRes.status === 202, `Expected resume to be accepted after crash. Got ${resumeRes.status}: ${resumeText}`);
    expect(resumeData?.status === 'queued', `Expected resumed build to be queued. Got: ${resumeText}`);

    const resumedHistory = await pollHistory(
      secondServer.baseUrl,
      session.id,
      (events) => {
        const resumeIndex = events.findIndex((event) => event.type === 'resume_rehydrated');
        if (resumeIndex === -1) return false;
        return events.slice(resumeIndex + 1).some((event) => event.type === 'task_leased' && typeof event.taskId === 'string');
      },
      40,
    );

    const resumeIndex = resumedHistory.findIndex((event) => event.type === 'resume_rehydrated');
    expect(resumeIndex >= 0, 'Expected crash recovery history to include resume_rehydrated.');
    const postResumeLeasedTaskIds = resumedHistory
      .slice(resumeIndex + 1)
      .filter((event) => event.type === 'task_leased' && typeof event.taskId === 'string')
      .map((event) => String(event.taskId));
    expect(postResumeLeasedTaskIds.length >= 1, 'Expected unfinished tasks to be re-leased after crash recovery.');

    for (const taskId of preCrashCompletedTaskIds) {
      expect(
        !postResumeLeasedTaskIds.includes(taskId),
        `Expected completed task ${taskId} not to be re-leased after crash recovery.`,
      );
    }

    const retriedTaskIds = new Set(
      postResumeLeasedTaskIds.filter((taskId) => !preCrashCompletedTaskIds.has(taskId)),
    );
    expect(
      retriedTaskIds.size >= 1,
      `Expected unfinished tasks to resume after crash. Got: ${JSON.stringify(postResumeLeasedTaskIds)}`,
    );

    console.log('PASS omx interrupted process resume contract');
  } finally {
    await stopServerProcess(firstServer, 'SIGKILL');
    await stopServerProcess(secondServer, 'SIGKILL');
    await serverScript.cleanup();
    await fakeCodex.cleanup();
    await deleteSession(session.id).catch(() => {});
  }
}

run().catch((error) => {
  console.error('FAIL omx interrupted process resume contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
