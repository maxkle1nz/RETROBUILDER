import { createProvider, getProviderNames, PROVIDER_FACTORIES, type AIProvider, type ChatMessage } from './providers/index.js';
import { ensureBridgeRuntime, inspectBridgeRuntime } from './bridge-bootstrap.js';
import { resolveAuthProfile } from './auth-profile-store.js';

export type CompletionConfigLike = {
  model?: string;
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
};

export type ProviderProbe = {
  status: 'ready' | 'offline' | 'blocked' | 'missing_config';
  error?: string;
  runtime?: {
    baseUrl?: string;
      command?: string;
      installed?: boolean;
      autoStart?: boolean;
      autoStarted?: boolean;
      healthy?: boolean;
      authProfile?: string | null;
    authProfileProvider?: string | null;
    protocol?: 'openai_compat' | 'standalone';
    source?: 'env' | 'path' | 'donor';
  };
};

let activeProvider: AIProvider | null = null;

const LOCAL_BOOT_PROVIDER = 'bridge';

function strictSelectedProviderModeEnabled() {
  return process.env.AI_STRICT_PROVIDER_MODE !== '0';
}

function configuredProviderName() {
  const configured = process.env.AI_PROVIDER?.trim();
  if (configured && configured in PROVIDER_FACTORIES) {
    return configured;
  }
  return null;
}

function hasProviderBootConfig(providerName: string) {
  switch (providerName) {
    case 'xai':
      return Boolean(process.env.XAI_API_KEY);
    case 'openai':
      return Boolean(process.env.OPENAI_API_KEY);
    case 'gemini':
      return Boolean(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY);
    case 'bridge':
      return true;
    default:
      return false;
  }
}

function resolvePreferredProviderName() {
  const configured = configuredProviderName();
  if (configured && hasProviderBootConfig(configured)) {
    return configured;
  }
  return LOCAL_BOOT_PROVIDER;
}

function bootProviderOrder() {
  const configured = configuredProviderName();
  return [...new Set([
    configured,
    resolvePreferredProviderName(),
    LOCAL_BOOT_PROVIDER,
    'gemini',
    'openai',
    'xai',
  ].filter(Boolean) as string[])];
}

function createBootSafeProvider() {
  const attempted: string[] = [];

  for (const providerName of bootProviderOrder()) {
    try {
      return createProvider(providerName);
    } catch (error: any) {
      attempted.push(`${providerName}: ${error.message || 'unavailable'}`);
    }
  }

  throw new Error(`[SSOT] Failed to initialize any AI provider — ${attempted.join(' | ')}`);
}

export function getActiveProvider() {
  if (!activeProvider) {
    activeProvider = createBootSafeProvider();
  }
  return activeProvider;
}

export async function setActiveProvider(providerName: string) {
  activeProvider = createProvider(providerName);
  if (activeProvider.warmModel) {
    activeProvider.warmModel().catch(() => {});
  }
  return activeProvider;
}

export function getActiveProviderName() {
  return activeProvider?.name || resolvePreferredProviderName();
}

function fallbackProviderOrder(activeProviderName: string): string[] {
  const ordered = [activeProviderName, 'gemini', 'bridge', 'openai', 'xai'];
  return [...new Set(ordered.filter(Boolean))];
}

function bridgeUnavailableMessage(baseUrl: string) {
  return `[BRIDGE] THE BRIDGE is not reachable at ${baseUrl}. Install/start THE BRIDGE and verify ${baseUrl}/health.`;
}

export async function chatCompletionWithFallback(
  messages: ChatMessage[],
  config: CompletionConfigLike,
  purpose: string,
): Promise<{ content: string; providerName: string; providerLabel: string; fallbackUsed: boolean }> {
  const attempted: string[] = [];
  const current = getActiveProvider();
  const strictSelectedProviderMode = strictSelectedProviderModeEnabled();

  if (strictSelectedProviderMode) {
    try {
      const content = await current.chatCompletion(messages, config);
      return {
        content,
        providerName: current.name,
        providerLabel: current.label,
        fallbackUsed: false,
      };
    } catch (error: any) {
      attempted.push(`${current.name}: ${error.message || 'request failed'}`);
      console.warn(`[SSOT] ${purpose} failed on selected provider ${current.name}: ${error.message}`);
      throw new Error(`[AI] ${purpose} failed on selected provider ${current.name} — ${attempted.join(' | ')}`);
    }
  }

  for (const providerName of fallbackProviderOrder(current.name)) {
    let candidate: AIProvider;
    try {
      candidate = providerName === current.name ? current : createProvider(providerName);
    } catch (error: any) {
      attempted.push(`${providerName}: unavailable (${error.message})`);
      continue;
    }

    try {
      const content = await candidate.chatCompletion(messages, config);
      return {
        content,
        providerName: candidate.name,
        providerLabel: candidate.label,
        fallbackUsed: candidate.name !== current.name,
      };
    } catch (error: any) {
      attempted.push(`${candidate.name}: ${error.message || 'request failed'}`);
      console.warn(`[SSOT] ${purpose} failed on ${candidate.name}: ${error.message}`);
    }
  }

  throw new Error(`[AI] ${purpose} failed across providers — ${attempted.join(' | ')}`);
}

export async function probeProviderHealth(providerName: string): Promise<ProviderProbe> {
  const timeout = AbortSignal.timeout(4000);

  try {
    switch (providerName) {
      case 'xai': {
        if (!process.env.XAI_API_KEY) {
          return { status: 'missing_config', error: '[xAI] XAI_API_KEY environment variable is required.' };
        }
        const res = await fetch('https://api.x.ai/v1/models', {
          headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}` },
          signal: timeout,
        });
        if (res.ok) return { status: 'ready' };
        const body = await res.text();
        return {
          status: res.status === 403 ? 'blocked' : 'offline',
          error: `[xAI] ${res.status} ${body}`.slice(0, 300),
        };
      }
      case 'openai': {
        if (!process.env.OPENAI_API_KEY) {
          return {
            status: 'missing_config',
            error:
              '[OpenAI] OPENAI_API_KEY environment variable is required. ' +
              'Direct OpenAI mode does not reuse local ChatGPT/Codex OAuth; use THE BRIDGE for OAuth-backed models.',
          };
        }
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          signal: timeout,
        });
        if (res.ok) return { status: 'ready' };
        const body = await res.text();
        return {
          status: res.status === 403 ? 'blocked' : 'offline',
          error: `[OpenAI] ${res.status} ${body}`.slice(0, 300),
        };
      }
      case 'bridge': {
        const baseUrl = (process.env.THEBRIDGE_URL || 'http://127.0.0.1:7788/v1').replace(/\/v1$/, '');
        const bridgeRuntime = await ensureBridgeRuntime();
        const authProfile = await resolveAuthProfile(process.env.THEBRIDGE_AUTH_PROFILE || null);
        if (bridgeRuntime.ok) {
          return {
            status: 'ready',
            runtime: {
              baseUrl: bridgeRuntime.baseUrl,
              command: bridgeRuntime.command,
              installed: bridgeRuntime.installed,
              autoStart: bridgeRuntime.autoStart,
              autoStarted: bridgeRuntime.autoStarted,
              healthy: true,
              authProfile: process.env.THEBRIDGE_AUTH_PROFILE || null,
              authProfileProvider: authProfile?.provider || null,
              protocol: bridgeRuntime.protocol,
              source: bridgeRuntime.source,
            },
          };
        }
        if (!bridgeRuntime.installed) {
          return {
            status: 'offline',
            error: `[BRIDGE] THE BRIDGE command is not installed (${bridgeRuntime.command}). Install it or point THEBRIDGE_COMMAND to a valid executable. Expected health at ${baseUrl}.`,
            runtime: {
              baseUrl: bridgeRuntime.baseUrl,
                command: bridgeRuntime.command,
                installed: false,
                autoStart: bridgeRuntime.autoStart,
                autoStarted: false,
                healthy: false,
              authProfile: process.env.THEBRIDGE_AUTH_PROFILE || null,
              authProfileProvider: authProfile?.provider || null,
              protocol: bridgeRuntime.protocol,
              source: bridgeRuntime.source,
            },
          };
        }
        const inspection = await inspectBridgeRuntime();
        return {
          status: 'offline',
          error: inspection.autoStart
            ? bridgeUnavailableMessage(baseUrl)
            : `${bridgeUnavailableMessage(baseUrl)} Auto-start is disabled; set THEBRIDGE_AUTO_START=1 to allow RETROBUILDER to launch ${inspection.command}.`,
          runtime: {
            baseUrl: inspection.baseUrl,
              command: inspection.command,
              installed: inspection.installed,
              autoStart: inspection.autoStart,
              autoStarted: false,
              healthy: inspection.healthy,
              authProfile: process.env.THEBRIDGE_AUTH_PROFILE || null,
              authProfileProvider: authProfile?.provider || null,
              protocol: inspection.protocol,
              source: inspection.source,
            },
        };
      }
      case 'gemini': {
        const geminiKey = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '').split(',')[0]?.trim();
        if (!geminiKey) {
          return { status: 'missing_config', error: '[Gemini] GEMINI_API_KEY or GEMINI_API_KEYS environment variable is required.' };
        }
        const model = process.env.GEMINI_MODEL || 'gemini-3-pro-image-preview';
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${geminiKey}`, {
          signal: timeout,
        });
        if (res.ok) return { status: 'ready' };
        const body = await res.text();
        return {
          status: res.status === 403 || res.status === 429 ? 'blocked' : 'offline',
          error: `[Gemini] ${res.status} ${body}`.slice(0, 300),
        };
      }
      default:
        return { status: 'offline', error: 'Unknown provider.' };
    }
  } catch (error: any) {
    return {
      status: providerName === 'bridge' ? 'offline' : 'blocked',
      error:
        providerName === 'bridge'
          ? bridgeUnavailableMessage((process.env.THEBRIDGE_URL || 'http://127.0.0.1:7788/v1').replace(/\/v1$/, ''))
          : `[${providerName}] ${error.message || 'Probe failed'}`,
    };
  }
}

export async function collectProviderStates() {
  const currentName = getActiveProviderName();
  const names = getProviderNames();
  const providers = [];

  for (const name of names) {
    const probe = await probeProviderHealth(name);
    try {
      const p = PROVIDER_FACTORIES[name]();
      providers.push({
        name: p.name,
        label: p.label,
        defaultModel: p.defaultModel,
        active: p.name === currentName,
        status: probe.status,
        error: probe.error,
        runtime: probe.runtime,
      });
    } catch (e: any) {
      providers.push({
        name,
        label: name,
        defaultModel: null,
        active: name === currentName,
        status: probe.status,
        error: probe.error || e.message,
        runtime: probe.runtime,
      });
    }
  }

  return providers;
}
