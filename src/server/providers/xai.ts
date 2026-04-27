/**
 * xAI Grok 4.20 Provider
 * 
 * Uses the OpenAI-compatible API at https://api.x.ai/v1
 * Requires XAI_API_KEY environment variable.
 */

import OpenAI from 'openai';
import type { AIProvider, ChatMessage, CompletionConfig, ModelInfo } from './index.js';

const XAI_BASE_URL = 'https://api.x.ai/v1';
const XAI_DEFAULT_MODEL = process.env.XAI_MODEL || 'grok-4.20-non-reasoning';

export function createXAIProvider(): AIProvider {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      '[xAI] XAI_API_KEY environment variable is required. ' +
      'Set it in .env.local or export it in your shell.'
    );
  }

  const client = new OpenAI({
    apiKey,
    baseURL: XAI_BASE_URL,
  });

  return {
    name: 'xai',
    label: 'xAI Grok',
    defaultModel: XAI_DEFAULT_MODEL,

    async chatCompletion(
      messages: ChatMessage[],
      config?: CompletionConfig
    ): Promise<string> {
      const model = config?.model || XAI_DEFAULT_MODEL;

      const requestBody: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
        model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        max_tokens: config?.maxTokens || 16384,
        temperature: config?.temperature ?? 0.7,
      };

      // xAI supports JSON mode via response_format
      if (config?.jsonMode) {
        requestBody.response_format = { type: 'json_object' };
      }

      const response = await client.chat.completions.create(requestBody);
      const content = response.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error(`[xAI] Empty response from model ${model}`);
      }

      return content;
    },

    async listModels(_config?: CompletionConfig): Promise<ModelInfo[]> {
      try {
        const response = await client.models.list();
        const models: ModelInfo[] = [];
        for await (const model of response) {
          models.push({
            id: model.id,
            name: model.id,
            provider: 'xai',
          });
        }
        return models;
      } catch (error) {
        console.warn('[xAI] Failed to list models, returning defaults:', error);
        // Fallback — known xAI models
        return [
          { id: 'grok-4.20-non-reasoning', name: 'Grok 4.20', provider: 'xai' },
          { id: 'grok-4.20-reasoning', name: 'Grok 4.20 Reasoning', provider: 'xai' },
          { id: 'grok-4.1-fast-non-reasoning', name: 'Grok 4.1 Fast', provider: 'xai' },
          { id: 'grok-4.1-fast-reasoning', name: 'Grok 4.1 Fast Reasoning', provider: 'xai' },
        ];
      }
    },
  };
}
