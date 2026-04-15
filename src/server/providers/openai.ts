/**
 * OpenAI Provider
 * 
 * Direct connection to the OpenAI API at https://api.openai.com/v1
 * Requires OPENAI_API_KEY environment variable.
 * 
 * Models: GPT-4.1, GPT-4.1-mini, GPT-4.1-nano, o3, o4-mini, etc.
 */

import OpenAI from 'openai';
import type { AIProvider, ChatMessage, CompletionConfig, ModelInfo } from './index.js';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const OPENAI_DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1';

export function createOpenAIProvider(): AIProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      '[OpenAI] OPENAI_API_KEY environment variable is required. ' +
      'Set it in .env.local or export it in your shell.'
    );
  }

  const client = new OpenAI({
    apiKey,
    baseURL: OPENAI_BASE_URL,
  });

  return {
    name: 'openai',
    label: 'OpenAI',
    defaultModel: OPENAI_DEFAULT_MODEL,

    async chatCompletion(
      messages: ChatMessage[],
      config?: CompletionConfig
    ): Promise<string> {
      const model = config?.model || OPENAI_DEFAULT_MODEL;

      const requestBody: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
        model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        max_tokens: config?.maxTokens || 16384,
        temperature: config?.temperature ?? 0.7,
      };

      if (config?.jsonMode) {
        requestBody.response_format = { type: 'json_object' };
      }

      const response = await client.chat.completions.create(requestBody);
      const content = response.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error(`[OpenAI] Empty response from model ${model}`);
      }

      return content;
    },

    async listModels(): Promise<ModelInfo[]> {
      try {
        const response = await client.models.list();
        const models: ModelInfo[] = [];
        // Filter to chat-capable models only
        const chatPrefixes = ['gpt-', 'o1', 'o3', 'o4', 'chatgpt-'];
        for await (const model of response) {
          const isChatModel = chatPrefixes.some(p => model.id.startsWith(p));
          if (isChatModel) {
            models.push({
              id: model.id,
              name: model.id,
              provider: 'openai',
            });
          }
        }
        // Sort: newest/best first
        models.sort((a, b) => a.id.localeCompare(b.id));
        return models;
      } catch (error) {
        console.warn('[OpenAI] Failed to list models, returning defaults:', error);
        return [
          { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai' },
          { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', provider: 'openai' },
          { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', provider: 'openai' },
          { id: 'o3', name: 'o3', provider: 'openai' },
          { id: 'o4-mini', name: 'o4-mini', provider: 'openai' },
        ];
      }
    },
  };
}
