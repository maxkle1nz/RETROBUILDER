/**
 * THE BRIDGE Provider
 * 
 * Connects to a local THEBRIDGE server that exposes OpenAI-compatible
 * endpoints over locally-authenticated providers (Codex, Copilot).
 * 
 * Default: http://127.0.0.1:7788/v1
 * No API key needed — THEBRIDGE handles auth reuse from local credentials.
 * 
 * @see https://github.com/maxkle1nz/thebridge
 */

import OpenAI from 'openai';
import type { AIProvider, ChatMessage, CompletionConfig } from './index.js';

const BRIDGE_DEFAULT_URL = process.env.THEBRIDGE_URL || 'http://127.0.0.1:7788/v1';
const BRIDGE_DEFAULT_MODEL = process.env.THEBRIDGE_MODEL || 'github-copilot/gpt-5.4';

export function createBridgeProvider(): AIProvider {
  const client = new OpenAI({
    apiKey: process.env.THEBRIDGE_HTTP_TOKEN || 'bridge-local',
    baseURL: BRIDGE_DEFAULT_URL,
  });

  return {
    name: 'bridge',
    label: 'THE BRIDGE (Local)',

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
        max_tokens: config?.maxTokens || 8192,
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
  };
}
