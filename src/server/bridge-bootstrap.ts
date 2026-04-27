import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export type BridgeRuntimeProtocol = 'openai_compat' | 'standalone';
export type BridgeRuntimeSource = 'env' | 'path' | 'donor';

type BridgeRuntimeCandidate = {
  baseUrl: string;
  command: string;
  installed: boolean;
  protocol: BridgeRuntimeProtocol;
  source: BridgeRuntimeSource;
};

const LOCAL_THEBRIDGE_COMMANDS = [
  path.join(homedir(), '.local/src/thebridge-gpt55/target/release/thebridge'),
  path.join(homedir(), '.local/src/thebridge-gpt55/target/debug/thebridge'),
];

const launchPromises = new Map<BridgeRuntimeProtocol, Promise<boolean>>();
const launchedPids = new Map<BridgeRuntimeProtocol, number | null>();

function defaultBridgeBaseUrl() {
  return (process.env.THEBRIDGE_URL || 'http://127.0.0.1:7788/v1').replace(/\/v1$/, '');
}

function defaultBridgeCommand() {
  return process.env.THEBRIDGE_COMMAND?.trim() || 'thebridge';
}

function defaultDonorEntry() {
  const donorRoot = process.env.THEBRIDGE_DONOR_ROOT || path.join(homedir(), '.local/src/the-bridge');
  return path.join(donorRoot, 'cli.mjs');
}

function defaultStandalonePort() {
  return Number(process.env.THEBRIDGE_STANDALONE_PORT || process.env.CODEX_STANDALONE_PORT || 4317);
}

function defaultStandaloneBaseUrl() {
  return (process.env.THEBRIDGE_STANDALONE_URL || `http://127.0.0.1:${defaultStandalonePort()}`).replace(/\/+$/, '');
}

function bridgeAutoStartEnabled() {
  return process.env.THEBRIDGE_AUTO_START !== '0';
}

async function bridgeHealth(baseUrl: string) {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function commandExists(command: string) {
  if (command.includes('/')) {
    return await fileExists(command);
  }

  return await new Promise<boolean>((resolve) => {
    const child = spawn('zsh', ['-lc', `command -v ${quoteShell(command)}`], {
      stdio: ['ignore', 'ignore', 'ignore'],
      env: { ...process.env },
    });
    child.once('error', () => resolve(false));
    child.once('exit', (code) => resolve(code === 0));
  });
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function quoteShell(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function toShellCommand(command: string) {
  return command.includes('/') ? quoteShell(command) : command;
}

function toBridgeServeCommand(command: string) {
  return `${toShellCommand(command)} serve`;
}

async function resolveOpenAiCompatBridgeCommand() {
  const defaultCommand = defaultBridgeCommand();
  const candidates = process.env.THEBRIDGE_COMMAND?.trim()
    ? [defaultCommand]
    : [defaultCommand, ...LOCAL_THEBRIDGE_COMMANDS];

  for (const candidate of candidates) {
    if (await commandExists(candidate)) {
      return {
        command: toBridgeServeCommand(candidate),
        installed: true,
        source: process.env.THEBRIDGE_COMMAND ? 'env' as const : 'path' as const,
      };
    }
  }

  return {
    command: toBridgeServeCommand(defaultCommand),
    installed: false,
    source: process.env.THEBRIDGE_COMMAND ? 'env' as const : 'path' as const,
  };
}

async function resolveBridgeCandidates(): Promise<BridgeRuntimeCandidate[]> {
  const openAiCompat = await resolveOpenAiCompatBridgeCommand();
  const donorEntry = defaultDonorEntry();
  const standalonePort = defaultStandalonePort();
  const donorInstalled = (await commandExists('node')) && (await fileExists(donorEntry));

  return [
    {
      baseUrl: defaultBridgeBaseUrl(),
      command: openAiCompat.command,
      installed: openAiCompat.installed,
      protocol: 'openai_compat',
      source: openAiCompat.source,
    },
    {
      baseUrl: defaultStandaloneBaseUrl(),
      command: `CODEX_STANDALONE_PORT=${standalonePort} node ${quoteShell(donorEntry)} serve`,
      installed: donorInstalled,
      protocol: 'standalone',
      source: 'donor',
    },
  ];
}

async function waitForBridge(baseUrl: string, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await bridgeHealth(baseUrl)) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function launchBridge(candidate: BridgeRuntimeCandidate) {
  const child = spawn('zsh', ['-lc', candidate.command], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  });
  child.unref();
  launchedPids.set(candidate.protocol, child.pid || null);
  return waitForBridge(candidate.baseUrl);
}

async function resolveInspectableRuntime() {
  const candidates = await resolveBridgeCandidates();

  for (const candidate of candidates) {
    if (await bridgeHealth(candidate.baseUrl)) {
      return { candidate, healthy: true };
    }
  }

  const fallbackCandidate = candidates.find((candidate) => candidate.installed) || candidates[0];
  return { candidate: fallbackCandidate, healthy: false };
}

export async function inspectBridgeRuntime() {
  const { candidate, healthy } = await resolveInspectableRuntime();

  return {
    baseUrl: candidate.baseUrl,
    command: candidate.command,
    healthy,
    installed: candidate.installed,
    autoStart: bridgeAutoStartEnabled(),
    launchedPid: launchedPids.get(candidate.protocol) || null,
    protocol: candidate.protocol,
    source: candidate.source,
  };
}

export async function ensureBridgeRuntime() {
  const candidates = await resolveBridgeCandidates();

  for (const candidate of candidates) {
    if (await bridgeHealth(candidate.baseUrl)) {
      return {
        ok: true,
        baseUrl: candidate.baseUrl,
        command: candidate.command,
        installed: candidate.installed,
        autoStart: bridgeAutoStartEnabled(),
        autoStarted: false,
        protocol: candidate.protocol,
        source: candidate.source,
      };
    }
  }

  const candidate = candidates.find((item) => item.installed) || candidates[0];
  if (!candidate.installed) {
    return {
      ok: false,
      baseUrl: candidate.baseUrl,
      command: candidate.command,
      installed: false,
      autoStart: bridgeAutoStartEnabled(),
      autoStarted: false,
      protocol: candidate.protocol,
      source: candidate.source,
    };
  }

  if (!bridgeAutoStartEnabled()) {
    return {
      ok: false,
      baseUrl: candidate.baseUrl,
      command: candidate.command,
      installed: true,
      autoStart: false,
      autoStarted: false,
      protocol: candidate.protocol,
      source: candidate.source,
    };
  }

  if (!launchPromises.has(candidate.protocol)) {
    launchPromises.set(
      candidate.protocol,
      launchBridge(candidate).finally(() => {
        launchPromises.delete(candidate.protocol);
      }),
    );
  }

  const started = await launchPromises.get(candidate.protocol)!;
  return {
    ok: started,
    baseUrl: candidate.baseUrl,
    command: candidate.command,
    installed: true,
    autoStart: bridgeAutoStartEnabled(),
    autoStarted: started,
    protocol: candidate.protocol,
    source: candidate.source,
  };
}
