/**
 * THE BRIDGE Provider
 * 
 * Connects to a local THEBRIDGE server that exposes OpenAI-compatible
 * endpoints over locally-authenticated providers (Codex, Copilot).
 * 
 * Default: http://127.0.0.1:7788/v1
 * No API key needed — THEBRIDGE handles auth reuse from local credentials.
 * 
 * Providers discovered:
 *   - openai-codex → local Codex auth
 *   - github-copilot → OpenClaw/Copilot token exchange
 * 
 * @see https://github.com/maxkle1nz/thebridge
 */

import OpenAI from 'openai';
import type { AIProvider, ChatMessage, CompletionConfig, ModelInfo } from './index.js';

const BRIDGE_DEFAULT_URL = process.env.THEBRIDGE_URL || 'http://127.0.0.1:7788/v1';
const BRIDGE_BASE_URL = BRIDGE_DEFAULT_URL.replace(/\/v1$/, '');
const BRIDGE_DEFAULT_MODEL = process.env.THEBRIDGE_MODEL || 'github-copilot/claude-opus-4.7';

export function createBridgeProvider(): AIProvider {
  const client = new OpenAI({
    apiKey: process.env.THEBRIDGE_HTTP_TOKEN || 'bridge-local',
    baseURL: BRIDGE_DEFAULT_URL,
  });

  // Background warmup: pre-fetches Copilot token + establishes HTTP keep-alive
  const warmup = async (model?: string) => {
    try {
      const targetModel = model || BRIDGE_DEFAULT_MODEL;
      // 1. Health check — establishes TCP+TLS connection
      await fetch(`${BRIDGE_BASE_URL}/health`, { signal: AbortSignal.timeout(5000) });
      // 2. Minimal completion — forces Copilot token exchange for this provider
      //    We send max_tokens=1 so it returns almost immediately.
      const warmBody: any = {
        model: targetModel,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
        stream: false,
      };
      await client.chat.completions.create(warmBody).catch(() => {});
      console.log(`[BRIDGE] ⚡ Warmed up: ${targetModel}`);
    } catch {
      // Warmup is best-effort — don't block anything
    }
  };

  return {
    name: 'bridge',
    label: 'THE BRIDGE (Local)',
    defaultModel: BRIDGE_DEFAULT_MODEL,

    // Expose warmup for switch-provider to call
    async warmModel(model?: string) {
      warmup(model);
    },

    async chatCompletion(
      messages: ChatMessage[],
      config?: CompletionConfig
    ): Promise<string> {
      const model = config?.model || BRIDGE_DEFAULT_MODEL;
      const modelLower = model.toLowerCase();

      // Claude and Gemini models on Copilot don't support response_format
      const isClaude = modelLower.includes('claude');
      const isGemini = modelLower.includes('gemini');
      // GPT-5.x and O-series need max_completion_tokens instead of max_tokens
      const isNewTokenParam = modelLower.includes('gpt-5') || modelLower.includes('gpt-4.1') 
        || modelLower.startsWith('o1') || modelLower.startsWith('o3') || modelLower.startsWith('o4');

      const tokenLimit = config?.maxTokens || 16384;

      const requestBody: any = {
        model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: config?.temperature ?? 0.7,
      };

      // Token parameter: GPT-5.x uses max_completion_tokens; all others use max_tokens
      if (isNewTokenParam) {
        requestBody.max_completion_tokens = tokenLimit;
      } else {
        requestBody.max_tokens = tokenLimit;
      }

      // JSON mode: only for models that support it (not Claude/Gemini on Copilot)
      const useJsonMode = config?.jsonMode && !isClaude && !isGemini;
      if (useJsonMode) {
        requestBody.response_format = { type: 'json_object' };
      }

      try {
        const response = await client.chat.completions.create(requestBody);
        const content = response.choices?.[0]?.message?.content;

        if (!content) {
          throw new Error(`[BRIDGE] Empty response from model ${model}`);
        }

        return content;
      } catch (error: any) {
        // If JSON mode failed, retry without it
        if (config?.jsonMode && error?.status === 400) {
          console.warn('[BRIDGE] JSON mode not supported by provider, retrying without it...');
          delete requestBody.response_format;
          const response = await client.chat.completions.create(requestBody);
          return response.choices?.[0]?.message?.content || '';
        }
        throw error;
      }
    },

    async listModels(): Promise<ModelInfo[]> {
      try {
        // First try the rich /api/providers endpoint for grouped models
        const res = await fetch(`${BRIDGE_BASE_URL}/api/providers`);
        if (res.ok) {
          const data = await res.json() as {
            providers: Array<{
              id: string;
              available: boolean;
              models: string[];
              defaultModel?: string;
            }>;
          };

          const models: ModelInfo[] = [];
          for (const p of data.providers) {
            if (!p.available) continue;
            for (const modelId of p.models) {
              // Human-friendly label: "Copilot › gpt-5.4"
              const providerLabel = p.id === 'github-copilot' ? 'Copilot'
                : p.id === 'openai-codex' ? 'Codex'
                : p.id;
              const shortName = modelId.replace(`${p.id}/`, '');
              models.push({
                id: modelId,
                name: `${providerLabel} › ${shortName}`,
                provider: 'bridge',
              });
            }
          }

          // Also add the "thebridge/default" auto-router
          models.push({
            id: 'thebridge/default',
            name: 'Bridge › auto (default)',
            provider: 'bridge',
          });

          return models;
        }
      } catch (err) {
        console.warn('[BRIDGE] /api/providers unavailable, trying /v1/models');
      }

      try {
        // Fallback: standard OpenAI-compatible /v1/models
        const response = await client.models.list();
        const models: ModelInfo[] = [];
        for await (const model of response) {
          models.push({
            id: model.id,
            name: model.id,
            provider: 'bridge',
          });
        }
        return models;
      } catch (error) {
        console.warn('[BRIDGE] Failed to list models, returning defaults:', error);
        // Static fallback — known bridge provider models
        return [
          { id: 'github-copilot/claude-opus-4.7', name: 'Copilot › Claude Opus 4.7', provider: 'bridge' },
          { id: 'github-copilot/claude-opus-4.6', name: 'Copilot › Claude Opus 4.6', provider: 'bridge' },
          { id: 'github-copilot/claude-sonnet-4.6', name: 'Copilot › Claude Sonnet 4.6', provider: 'bridge' },
          { id: 'github-copilot/claude-sonnet-4', name: 'Copilot › Claude Sonnet 4', provider: 'bridge' },
          { id: 'github-copilot/gemini-2.5-pro', name: 'Copilot › Gemini 2.5 Pro', provider: 'bridge' },
          { id: 'github-copilot/gpt-5.4', name: 'Copilot › gpt-5.4', provider: 'bridge' },
          { id: 'github-copilot/gpt-4o', name: 'Copilot › gpt-4o', provider: 'bridge' },
          { id: 'openai-codex/gpt-5.4', name: 'Codex › gpt-5.4', provider: 'bridge' },
          { id: 'openai-codex/gpt-5.4-mini', name: 'Codex › gpt-5.4-mini', provider: 'bridge' },
          { id: 'thebridge/default', name: 'Bridge › auto (default)', provider: 'bridge' },
        ];
      }
    },
  };
}
