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
const BRIDGE_DEFAULT_MODEL = process.env.THEBRIDGE_MODEL || 'github-copilot/gpt-5.4';

export function createBridgeProvider(): AIProvider {
  const client = new OpenAI({
    apiKey: process.env.THEBRIDGE_HTTP_TOKEN || 'bridge-local',
    baseURL: BRIDGE_DEFAULT_URL,
  });

  return {
    name: 'bridge',
    label: 'THE BRIDGE (Local)',
    defaultModel: BRIDGE_DEFAULT_MODEL,

    async chatCompletion(
      messages: ChatMessage[],
      config?: CompletionConfig
    ): Promise<string> {
      const model = config?.model || BRIDGE_DEFAULT_MODEL;

      const requestBody: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
        model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        max_tokens: config?.maxTokens || 16384,
        temperature: config?.temperature ?? 0.7,
      };

      // THE BRIDGE may or may not support JSON mode depending on
      // the underlying provider. We try it and fall back gracefully.
      if (config?.jsonMode) {
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
          { id: 'github-copilot/gpt-4o', name: 'Copilot › gpt-4o', provider: 'bridge' },
          { id: 'github-copilot/gpt-5.4', name: 'Copilot › gpt-5.4', provider: 'bridge' },
          { id: 'openai-codex/gpt-5.4', name: 'Codex › gpt-5.4', provider: 'bridge' },
          { id: 'openai-codex/gpt-5.4-mini', name: 'Codex › gpt-5.4-mini', provider: 'bridge' },
          { id: 'thebridge/default', name: 'Bridge › auto (default)', provider: 'bridge' },
        ];
      }
    },
  };
}
