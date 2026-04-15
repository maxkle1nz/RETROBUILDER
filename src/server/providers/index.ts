/**
 * SSOT AI Provider Interface
 * 
 * Single Source of Truth for all AI provider integrations.
 * Each provider implements the same contract — swap backends
 * by changing AI_PROVIDER env var or at runtime via API.
 * 
 * Supported: xai, bridge
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionConfig {
  /** Override the default model for this provider */
  model?: string;
  /** Force JSON output when supported */
  jsonMode?: boolean;
  /** Max tokens to generate */
  maxTokens?: number;
  /** Temperature (0-2) */
  temperature?: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

export interface AIProvider {
  /** Provider identifier */
  readonly name: string;
  /** Human-readable label */
  readonly label: string;
  /** Default model for this provider */
  readonly defaultModel: string;
  /** Run a chat completion and return the text response */
  chatCompletion(messages: ChatMessage[], config?: CompletionConfig): Promise<string>;
  /** List available models for this provider */
  listModels(): Promise<ModelInfo[]>;
}

// ─── Provider Registry ───────────────────────────────────────────────

import { createXAIProvider } from './xai.js';
import { createBridgeProvider } from './bridge.js';

export const PROVIDER_FACTORIES: Record<string, () => AIProvider> = {
  xai: createXAIProvider,
  bridge: createBridgeProvider,
};

/**
 * Create an AI provider instance based on name.
 * Defaults to env var AI_PROVIDER, then falls back to 'xai'.
 */
export function createProvider(name?: string): AIProvider {
  const providerName = name || process.env.AI_PROVIDER || 'xai';
  const factory = PROVIDER_FACTORIES[providerName];

  if (!factory) {
    const available = Object.keys(PROVIDER_FACTORIES).join(', ');
    throw new Error(
      `Unknown AI provider: "${providerName}". Available: ${available}`
    );
  }

  const provider = factory();
  console.log(`[SSOT] AI Provider initialized: ${provider.label} (${provider.name})`);
  return provider;
}

/**
 * Get list of all registered provider names.
 */
export function getProviderNames(): string[] {
  return Object.keys(PROVIDER_FACTORIES);
}
