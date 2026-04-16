import { createProvider, getProviderNames, PROVIDER_FACTORIES, type AIProvider, type ChatMessage } from './providers/index.js';

export type CompletionConfigLike = {
  model?: string;
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
};

export type ProviderProbe = {
  status: 'ready' | 'offline' | 'blocked' | 'missing_config';
  error?: string;
};

let activeProvider: AIProvider | null = null;

export function getActiveProvider() {
  if (!activeProvider) {
    activeProvider = createProvider();
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
  return getActiveProvider().name;
}

function fallbackProviderOrder(activeProviderName: string): string[] {
  const ordered = [activeProviderName, 'bridge', 'openai', 'xai'];
  return [...new Set(ordered.filter(Boolean))];
}

export async function chatCompletionWithFallback(
  messages: ChatMessage[],
  config: CompletionConfigLike,
  purpose: string,
): Promise<{ content: string; providerName: string; providerLabel: string; fallbackUsed: boolean }> {
  const attempted: string[] = [];
  const current = getActiveProvider();

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
          return { status: 'missing_config', error: '[OpenAI] OPENAI_API_KEY environment variable is required.' };
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
        const res = await fetch(`${baseUrl}/health`, { signal: timeout });
        if (res.ok) return { status: 'ready' };
        const body = await res.text();
        return { status: 'offline', error: `[BRIDGE] ${res.status} ${body}`.slice(0, 300) };
      }
      default:
        return { status: 'offline', error: 'Unknown provider.' };
    }
  } catch (error: any) {
    return {
      status: providerName === 'bridge' ? 'offline' : 'blocked',
      error: `[${providerName}] ${error.message || 'Probe failed'}`,
    };
  }
}

export async function collectProviderStates() {
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
        active: p.name === activeProvider.name,
        status: probe.status,
        error: probe.error,
      });
    } catch (e: any) {
      providers.push({
        name,
        label: name,
        defaultModel: null,
        active: false,
        status: probe.status,
        error: probe.error || e.message,
      });
    }
  }

  return providers;
}
