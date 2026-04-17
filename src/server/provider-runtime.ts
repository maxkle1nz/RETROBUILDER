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

function resolvePreferredProviderName() {
  const configured = process.env.AI_PROVIDER;
  if (configured && configured in PROVIDER_FACTORIES) {
    return configured;
  }
  return 'xai';
}

function createBootSafeProvider() {
  try {
    return createProvider();
  } catch (error: any) {
    const fallback = resolvePreferredProviderName();
    console.warn(
      `[SSOT] Failed to initialize configured provider "${process.env.AI_PROVIDER || 'unset'}": ${error.message}. Falling back to ${fallback}.`,
    );
    return createProvider(fallback);
  }
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
      error: `[${providerName}] ${error.message || 'Probe failed'}`,
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
      });
    } catch (e: any) {
      providers.push({
        name,
        label: name,
        defaultModel: null,
        active: name === currentName,
        status: probe.status,
        error: probe.error || e.message,
      });
    }
  }

  return providers;
}
