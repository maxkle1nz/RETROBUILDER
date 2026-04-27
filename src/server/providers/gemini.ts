/**
 * Google Gemini Provider — with Key Rotation
 *
 * Primary:  gemini-2.5-pro-preview-05-06 (text completions, JSON mode)
 * Image:   gemini-2.5-flash-preview-native-audio-dialog (image gen fallback)
 *
 * Supports comma-separated GEMINI_API_KEYS for round-robin rotation.
 * On 429/quota errors, rotates to the next key automatically.
 *
 * ENV:
 *   GEMINI_API_KEY       — single key (legacy)
 *   GEMINI_API_KEYS      — comma-separated list for rotation
 *   GEMINI_MODEL         — override default model
 */

import type { AIProvider, ChatMessage, CompletionConfig, ModelInfo } from './index.js';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3-pro-image-preview';

// ─── Key Rotation ─────────────────────────────────────────────────────

class KeyRotator {
  private keys: string[];
  private index: number = 0;
  private failCounts: Map<string, number> = new Map();

  constructor(keys: string[]) {
    this.keys = [...new Set(keys.filter(k => k.length > 10))];
    if (this.keys.length === 0) {
      throw new Error('[Gemini] No valid API keys found. Set GEMINI_API_KEY or GEMINI_API_KEYS.');
    }
    console.log(`[Gemini] Key rotator initialized with ${this.keys.length} key(s)`);
  }

  current(): string {
    return this.keys[this.index % this.keys.length];
  }

  rotate(reason?: string): string {
    const failed = this.current();
    this.failCounts.set(failed, (this.failCounts.get(failed) || 0) + 1);
    this.index = (this.index + 1) % this.keys.length;
    console.warn(`[Gemini] Rotated key (${reason || 'error'}). Now using key ${this.index + 1}/${this.keys.length}`);
    return this.current();
  }

  get count(): number {
    return this.keys.length;
  }
}

function loadKeys(): string[] {
  const multi = process.env.GEMINI_API_KEYS;
  if (multi) {
    return multi.split(',').map(k => k.trim());
  }
  const single = process.env.GEMINI_API_KEY;
  if (single) {
    return [single.trim()];
  }
  return [];
}

// ─── Provider ─────────────────────────────────────────────────────────

export function createGeminiProvider(): AIProvider {
  const rotator = new KeyRotator(loadKeys());

  async function geminiRequest(
    messages: ChatMessage[],
    config?: CompletionConfig,
    retriesLeft: number = rotator.count,
  ): Promise<string> {
    const model = config?.model || GEMINI_DEFAULT_MODEL;
    const apiKey = rotator.current();

    // Convert ChatMessage[] to Gemini format
    const systemParts = messages.filter(m => m.role === 'system').map(m => m.content);
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: config?.maxTokens || 16384,
        temperature: config?.temperature ?? 0.7,
      },
    };

    if (systemParts.length > 0) {
      body.systemInstruction = {
        parts: [{ text: systemParts.join('\n\n') }],
      };
    }

    if (config?.jsonMode) {
      (body.generationConfig as any).responseMimeType = 'application/json';
    }

    const url = `${GEMINI_BASE_URL}/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'unknown error');

      // Rotate on rate limit or quota error
      if ((res.status === 429 || res.status === 403) && retriesLeft > 1) {
        rotator.rotate(`HTTP ${res.status}`);
        return geminiRequest(messages, config, retriesLeft - 1);
      }

      throw new Error(`[Gemini] HTTP ${res.status}: ${errorText.substring(0, 300)}`);
    }

    const data = await res.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      const reason = data?.candidates?.[0]?.finishReason;
      if (reason === 'SAFETY') {
        throw new Error(`[Gemini] Response blocked by safety filter`);
      }
      throw new Error(`[Gemini] Empty response from model ${model} (finishReason: ${reason || 'unknown'})`);
    }

    return content;
  }

  return {
    name: 'gemini',
    label: 'Google Gemini',
    defaultModel: GEMINI_DEFAULT_MODEL,

    async chatCompletion(messages: ChatMessage[], config?: CompletionConfig): Promise<string> {
      return geminiRequest(messages, config);
    },

    async listModels(_config?: CompletionConfig): Promise<ModelInfo[]> {
      try {
        const apiKey = rotator.current();
        const res = await fetch(`${GEMINI_BASE_URL}/models?key=${apiKey}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        return (data.models || [])
          .filter((m: any) => m.name?.includes('gemini'))
          .slice(0, 20)
          .map((m: any) => ({
            id: m.name?.replace('models/', '') || m.name,
            name: m.displayName || m.name,
            provider: 'gemini',
          }));
      } catch (error) {
        console.warn('[Gemini] Failed to list models, returning defaults:', error);
        return [
          { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image Preview', provider: 'gemini' },
          { id: 'gemini-3.1-flash-image-preview', name: 'Gemini 3.1 Flash Image Preview', provider: 'gemini' },
          { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'gemini' },
        ];
      }
    },

    async warmModel(model?: string, _config?: CompletionConfig): Promise<void> {
      const apiKey = rotator.current();
      const m = model || GEMINI_DEFAULT_MODEL;
      try {
        const res = await fetch(`${GEMINI_BASE_URL}/models/${m}?key=${apiKey}`);
        if (res.ok) {
          console.log(`[Gemini] Warmed model ${m}`);
        }
      } catch { /* best effort */ }
    },
  };
}
