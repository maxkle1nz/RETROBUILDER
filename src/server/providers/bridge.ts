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
import { spawn } from 'node:child_process';
import { access, copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AIProvider, ChatMessage, CompletionConfig, ModelInfo } from './index.js';
import { ensureBridgeRuntime } from '../bridge-bootstrap.js';
import { resolveAuthProfile, resolveRawAuthProfile } from '../auth-profile-store.js';

const BRIDGE_DEFAULT_URL = process.env.THEBRIDGE_URL || 'http://127.0.0.1:7788/v1';
const BRIDGE_BASE_URL = BRIDGE_DEFAULT_URL.replace(/\/v1$/, '');
const BRIDGE_DEFAULT_MODEL = process.env.THEBRIDGE_MODEL || 'gpt-5.5';
const GITHUB_COPILOT_DEFAULT_MODEL = process.env.THEBRIDGE_GITHUB_MODEL || 'github-copilot/gpt-5.4';
const parsedLocalCodexExecTimeoutMs = Number(process.env.RETROBUILDER_CODEX_EXEC_TIMEOUT_MS);
const LOCAL_CODEX_EXEC_TIMEOUT_MS = Number.isFinite(parsedLocalCodexExecTimeoutMs) && parsedLocalCodexExecTimeoutMs > 0
  ? parsedLocalCodexExecTimeoutMs
  : 180_000;

function getBridgeAuthProfile(config?: CompletionConfig) {
  const profile = config?.authProfile?.trim() || process.env.THEBRIDGE_AUTH_PROFILE?.trim();
  return profile && profile.length > 0 ? profile : null;
}

async function resolveBridgeAuthProfile(config?: CompletionConfig) {
  return await resolveAuthProfile(getBridgeAuthProfile(config));
}

function isBridgeConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as {
    message?: string;
    code?: string;
    cause?: { code?: string; message?: string };
  };
  const message = err.message || '';
  const code = err.code || err.cause?.code || '';
  return (
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'ECONNRESET' ||
    message.includes('Connection error') ||
    message.includes('fetch failed')
  );
}

function createBridgeRuntimeError(operation: string): Error {
  return new Error(
    `[BRIDGE] THE BRIDGE is not reachable at ${BRIDGE_DEFAULT_URL} while ${operation}. ` +
      `Install/start THE BRIDGE and verify ${BRIDGE_BASE_URL}/health before using bridge-backed models.`,
  );
}

async function requireBridgeRuntime(operation: string) {
  const runtime = await ensureBridgeRuntime();
  if (runtime.ok) return runtime;
  if (!runtime.installed) {
    throw new Error(
      `[BRIDGE] THE BRIDGE command is not installed (${runtime.command}). Install it or point THEBRIDGE_COMMAND to a valid executable before ${operation}. Expected health at ${runtime.baseUrl}.`,
    );
  }
  throw createBridgeRuntimeError(operation);
}

function normalizeBridgeError(error: unknown, operation: string): Error {
  if (isBridgeConnectionError(error)) {
    return createBridgeRuntimeError(operation);
  }
  return error instanceof Error ? error : new Error(String(error));
}

async function pathIsExecutable(path: string) {
  try {
    await access(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function findLocalCodexBinary() {
  const candidates = [
    process.env.CODEX_BINARY,
    process.env.CODEX_BIN,
    join(homedir(), '.local/bin/codex'),
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
    'codex',
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (candidate === 'codex' || await pathIsExecutable(candidate)) {
      return candidate;
    }
  }

  throw new Error('[BRIDGE] Codex CLI binary was not found for local JSON fallback.');
}

function escapeTomlString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function normalizeOpenAICodexModel(model: string) {
  const normalized = model.replace(/^openai-codex\//, '');
  return normalized === 'thebridge/default' ? BRIDGE_DEFAULT_MODEL : normalized;
}

export function resolveLocalCodexFallbackModel(model: string, config?: CompletionConfig) {
  const normalized = normalizeOpenAICodexModel(model);
  if (!config?.jsonMode) return normalized;

  const configured = process.env.RETROBUILDER_CODEX_JSON_FALLBACK_MODEL?.trim();
  if (configured) {
    return normalizeOpenAICodexModel(configured);
  }

  return normalized.endsWith('-mini') ? BRIDGE_DEFAULT_MODEL : normalized;
}

export function resolveLocalCodexFallbackReasoningEffort(config?: CompletionConfig) {
  const configured = process.env.RETROBUILDER_CODEX_JSON_REASONING_EFFORT?.trim();
  if (configured) return configured;
  return config?.jsonMode ? 'medium' : 'low';
}

export function localCodexJsonFallbackEnabled() {
  return process.env.RETROBUILDER_ENABLE_LOCAL_CODEX_FALLBACK === '1';
}

async function createIsolatedCodexHome(model: string) {
  const isolatedHome = await mkdtemp(join(tmpdir(), 'retrobuilder-codex-home-'));
  const sourceHome = process.env.CODEX_HOME || join(homedir(), '.codex');
  const sourceAuth = join(sourceHome, 'auth.json');

  try {
    await copyFile(sourceAuth, join(isolatedHome, 'auth.json'));
  } catch (error) {
    await rm(isolatedHome, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[BRIDGE] Local Codex JSON fallback could not read ${sourceAuth}: ${message}`);
  }

  await writeFile(
    join(isolatedHome, 'config.toml'),
    [
      `model = "${escapeTomlString(model)}"`,
      'approval_policy = "never"',
      'ask_for_approval = "never"',
      'sandbox_mode = "read-only"',
      '[features]',
      'plugins = false',
      'codex_hooks = false',
      'child_agents_md = false',
      'shell_tool = false',
      'shell_snapshot = false',
      '',
    ].join('\n'),
  );

  return isolatedHome;
}

function runProcessWithInput(
  command: string,
  args: string[],
  input: string,
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error(`codex exec request timed out after ${Math.round(options.timeoutMs / 1000)} seconds`));
    }, options.timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => finish(error));
    child.on('close', (code) => {
      if (code === 0) {
        finish();
        return;
      }
      const details = (stderr || stdout || `exit code ${code}`).trim();
      finish(new Error(details));
    });

    child.stdin.end(input);
  });
}

export function buildLocalCodexPrompt(messages: ChatMessage[], config?: CompletionConfig) {
  const renderedMessages = messages
    .map((message) => `[${message.role.toUpperCase()}]\n${message.content}`)
    .join('\n\n');
  const jsonInstructions = [
    'CRITICAL: Return only strict valid JSON. Do not wrap it in markdown fences and do not add commentary.',
    'Prefer a complete compact schema-valid JSON object over a long answer.',
    'If the schema asks for prose artifacts, keep strings concise and JSON-safe.',
    'Avoid raw code fences, comments, trailing commas, unescaped quotes, or literal newlines inside JSON strings.',
  ];

  return [
    'You are Retrobuilder\'s local Codex completion fallback for THE BRIDGE.',
    'Do not inspect files, run commands, or use tools. Answer only from the messages below.',
    config?.jsonMode
      ? jsonInstructions.join('\n')
      : 'Return the final assistant answer directly.',
    `MESSAGES:\n${renderedMessages}`,
  ].join('\n\n');
}

export function isBridgeFallbackSummary(content: string) {
  const lower = content.toLowerCase();
  return lower.includes('thebridge returned a resilient fallback summary')
    || lower.includes('codex exec request timed out');
}

function isOpenAICodexBridgeModel(model: string) {
  const lower = model.toLowerCase();
  if (lower.startsWith('github-copilot/')) return false;
  if (lower.includes('claude') || lower.includes('gemini')) return false;
  return lower.startsWith('openai-codex/')
    || lower.startsWith('thebridge/')
    || lower.startsWith('gpt-')
    || lower.startsWith('o');
}

export function shouldUseLocalCodexJsonFallback(model: string, config: CompletionConfig | undefined, content: string) {
  if (!localCodexJsonFallbackEnabled() || !config?.jsonMode || !isOpenAICodexBridgeModel(model)) return false;
  return isBridgeFallbackSummary(content) || !content.includes('{');
}

async function callLocalCodexCompletion(model: string, messages: ChatMessage[], config?: CompletionConfig) {
  if (!localCodexJsonFallbackEnabled()) {
    throw new Error('[BRIDGE] Local Codex JSON fallback is disabled. Set RETROBUILDER_ENABLE_LOCAL_CODEX_FALLBACK=1 to opt in.');
  }

  const codexModel = resolveLocalCodexFallbackModel(model, config);
  const reasoningEffort = resolveLocalCodexFallbackReasoningEffort(config);
  const codexBinary = await findLocalCodexBinary();
  const isolatedHome = await createIsolatedCodexHome(codexModel);
  const outputPath = join(tmpdir(), `retrobuilder-codex-${process.pid}-${Date.now()}.txt`);
  const prompt = buildLocalCodexPrompt(messages, config);

  try {
    await runProcessWithInput(
      codexBinary,
      [
        'exec',
        '--ephemeral',
        '--skip-git-repo-check',
        '-C',
        tmpdir(),
        '-m',
        codexModel,
        '-c',
        `model_reasoning_effort="${escapeTomlString(reasoningEffort)}"`,
        '-o',
        outputPath,
        '-',
      ],
      prompt,
      {
        cwd: tmpdir(),
        env: { ...process.env, CODEX_HOME: isolatedHome },
        timeoutMs: LOCAL_CODEX_EXEC_TIMEOUT_MS,
      },
    );

    const content = (await readFile(outputPath, 'utf8')).trim();
    if (!content) {
      throw new Error('[BRIDGE] Local Codex JSON fallback returned an empty response.');
    }
    return content;
  } finally {
    await rm(outputPath, { force: true }).catch(() => {});
    await rm(isolatedHome, { recursive: true, force: true }).catch(() => {});
  }
}

function toStandaloneBridgeInput(messages: ChatMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: [
      {
        type: 'input_text',
        text: message.content,
      },
    ],
  }));
}

function toStandaloneBridgeInstructions(messages: ChatMessage[]) {
  const systemMessages = messages.filter((message) => message.role === 'system').map((message) => message.content.trim()).filter(Boolean);
  return systemMessages.join('\n\n') || 'You are a helpful assistant.';
}

async function callStandaloneBridgeResponse(
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  config?: CompletionConfig,
) {
  const response = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      instructions: toStandaloneBridgeInstructions(messages),
      profileId: getBridgeAuthProfile(config),
      input: toStandaloneBridgeInput(messages.filter((message) => message.role !== 'system')),
      reasoningEffort: config?.temperature !== undefined && config.temperature <= 0.2 ? 'low' : undefined,
    }),
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => '');
    throw new Error(`[BRIDGE] Standalone bridge failed (${response.status}): ${payload || response.statusText}`);
  }

  const payload = await response.json() as { outputText?: string; payload?: { output_text?: string } };
  const content = payload.outputText || payload.payload?.output_text || '';
  if (!content.trim()) {
    throw new Error(`[BRIDGE] Empty response from standalone bridge model ${model}`);
  }
  return content;
}

async function assertStandaloneBridgeProfileSupport(config?: CompletionConfig) {
  const authProfile = await resolveBridgeAuthProfile(config);
  if (authProfile?.provider === 'github-copilot') {
    throw new Error(
      `[BRIDGE] Selected auth profile ${authProfile.id} uses github-copilot, but the active standalone donor bridge only supports openai-codex OAuth. ` +
      `Install a full THE BRIDGE runtime for GitHub-backed models or switch to an openai-codex auth profile.`,
    );
  }
  return authProfile;
}

async function standaloneBridgeModels(config?: CompletionConfig): Promise<ModelInfo[]> {
  const authProfile = await assertStandaloneBridgeProfileSupport(config);
  const configuredModel = BRIDGE_DEFAULT_MODEL;
  const profileId = getBridgeAuthProfile(config);
  const profileLabel = authProfile?.provider === 'openai-codex' || profileId?.startsWith('openai-codex')
    ? 'Codex OAuth'
    : 'Bridge OAuth';
  return [
    {
      id: configuredModel,
      name: `${profileLabel} › ${configuredModel} (configured)`,
      provider: 'bridge',
    },
  ];
}

async function listGithubCopilotDirectModels(config?: CompletionConfig): Promise<ModelInfo[]> {
  const profileId = getBridgeAuthProfile(config);
  const rawProfile = await resolveRawAuthProfile(profileId);
  if (!rawProfile?.token) {
    throw new Error(`[BRIDGE] Selected auth profile ${profileId || 'github-copilot'} has no usable GitHub Copilot token.`);
  }

  const res = await fetch('https://api.individual.githubcopilot.com/models', {
    headers: { Authorization: `Bearer ${rawProfile.token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`[BRIDGE] GitHub Copilot model inventory failed (${res.status}): ${text || res.statusText}`);
  }

  const payload = await res.json() as
    | Array<string | { id?: string; name?: string }>
    | { data?: Array<string | { id?: string; name?: string }> };
  const entries = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
  const modelIds = entries
    .map((entry) => (typeof entry === 'string' ? entry : entry.id || entry.name || ''))
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);

  const prioritize = (modelId: string) => {
    if (modelId === GITHUB_COPILOT_DEFAULT_MODEL.replace(/^github-copilot\//, '')) return 0;
    if (modelId === 'gpt-5.4') return 1;
    if (modelId === 'gpt-4o') return 2;
    if (modelId.startsWith('gpt-')) return 3;
    return 10;
  };

  return modelIds
    .sort((left, right) => {
      const priorityDelta = prioritize(left) - prioritize(right);
      return priorityDelta !== 0 ? priorityDelta : left.localeCompare(right);
    })
    .map((modelId) => ({
    id: `github-copilot/${modelId}`,
    name: `GitHub Copilot › ${modelId}`,
    provider: 'bridge',
  }));
}

function normalizeGithubCopilotModel(model: string) {
  return model.replace(/^github-copilot\//, '');
}

function githubCopilotHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Editor-Version': 'vscode/1.99.0',
    'Copilot-Integration-Id': 'vscode-chat',
  };
}

async function callGithubCopilotResponses(
  token: string,
  model: string,
  messages: ChatMessage[],
) {
  const response = await fetch('https://api.individual.githubcopilot.com/responses', {
    method: 'POST',
    headers: githubCopilotHeaders(token),
    body: JSON.stringify({
      model: normalizeGithubCopilotModel(model),
      instructions: toStandaloneBridgeInstructions(messages),
      input: toStandaloneBridgeInput(messages.filter((message) => message.role !== 'system')),
      stream: false,
      store: false,
    }),
    signal: AbortSignal.timeout(15000),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`[BRIDGE] GitHub Copilot responses failed (${response.status}): ${text || response.statusText}`);
  }

  const payload = JSON.parse(text) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  const direct = payload.output_text || '';
  if (direct.trim()) return direct;
  const fallback = Array.isArray(payload.output)
    ? payload.output.flatMap((item) => item.content || []).map((part) => part.text || '').join('')
    : '';
  if (!fallback.trim()) {
    throw new Error(`[BRIDGE] Empty GitHub Copilot responses payload for model ${model}`);
  }
  return fallback;
}

async function callGithubCopilotChatCompletions(
  token: string,
  model: string,
  messages: ChatMessage[],
  config?: CompletionConfig,
) {
  const response = await fetch('https://api.individual.githubcopilot.com/chat/completions', {
    method: 'POST',
    headers: githubCopilotHeaders(token),
    body: JSON.stringify({
      model: normalizeGithubCopilotModel(model),
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      max_tokens: config?.maxTokens || 16384,
      temperature: config?.temperature ?? 0.7,
    }),
    signal: AbortSignal.timeout(15000),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`[BRIDGE] GitHub Copilot chat completions failed (${response.status}): ${text || response.statusText}`);
  }

  const payload = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content || '';
  if (!content.trim()) {
    throw new Error(`[BRIDGE] Empty GitHub Copilot chat completion for model ${model}`);
  }
  return content;
}

async function callGithubCopilotDirectCompletion(
  model: string,
  messages: ChatMessage[],
  config?: CompletionConfig,
) {
  const profileId = getBridgeAuthProfile(config);
  const rawProfile = await resolveRawAuthProfile(profileId);
  if (!rawProfile?.token) {
    throw new Error(`[BRIDGE] Selected auth profile ${profileId || 'github-copilot'} has no usable GitHub Copilot token.`);
  }

  try {
    return await callGithubCopilotResponses(rawProfile.token, model, messages);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      !message.includes('unsupported_api_for_model') &&
      !message.includes('model_not_supported') &&
      !message.includes('Access to this endpoint is forbidden') &&
      !message.includes('Terms of Service')
    ) {
      throw error instanceof Error ? error : new Error(message);
    }
  }

  return await callGithubCopilotChatCompletions(rawProfile.token, model, messages, config);
}

export function createBridgeProvider(): AIProvider {
  const providerDefaultModel = (() => {
    const profileId = getBridgeAuthProfile();
    if (profileId?.startsWith('github-copilot')) {
      return GITHUB_COPILOT_DEFAULT_MODEL;
    }
    return BRIDGE_DEFAULT_MODEL;
  })();

  const client = new OpenAI({
    apiKey: process.env.THEBRIDGE_HTTP_TOKEN || 'bridge-local',
    baseURL: BRIDGE_DEFAULT_URL,
  });

  // Background warmup: pre-fetches Copilot token + establishes HTTP keep-alive
    const warmup = async (model?: string, config?: CompletionConfig) => {
      try {
        const targetModel = model || config?.model || providerDefaultModel;
        const profileId = getBridgeAuthProfile(config);
        if (targetModel.startsWith('github-copilot/')) {
          const rawProfile = await resolveRawAuthProfile(profileId);
          if (!rawProfile?.token) {
            console.warn(`[BRIDGE] Skipping Copilot warmup for ${targetModel}: no usable GitHub Copilot auth profile.`);
            return;
          }
        }
        const runtime = await ensureBridgeRuntime();
        if (runtime.ok && runtime.protocol === 'standalone') {
        await fetch(`${runtime.baseUrl}/auth/refresh`, {
          method: 'POST',
          signal: AbortSignal.timeout(5000),
        }).catch(() => {});
        console.log(`[BRIDGE] ⚡ Warmed up standalone donor: ${targetModel}`);
        return;
      }
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
      if (profileId) {
        warmBody.profileId = profileId;
      }
      await client.chat.completions.create(warmBody).catch(() => {});
      console.log(`[BRIDGE] ⚡ Warmed up: ${targetModel}`);
    } catch {
      // Warmup is best-effort — don't block anything
    }
  };

  return {
    name: 'bridge',
    label: 'THE BRIDGE (Local)',
    defaultModel: providerDefaultModel,

    // Expose warmup for switch-provider to call
    async warmModel(model?: string, config?: CompletionConfig) {
      await warmup(model || config?.model, config);
    },

    async chatCompletion(
      messages: ChatMessage[],
      config?: CompletionConfig
    ): Promise<string> {
      const authProfile = await resolveBridgeAuthProfile(config);
      const model = config?.model
        || (authProfile?.provider === 'github-copilot' ? GITHUB_COPILOT_DEFAULT_MODEL : BRIDGE_DEFAULT_MODEL);
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
      const profileId = getBridgeAuthProfile(config);
      if (profileId) {
        requestBody.profileId = profileId;
      }

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

      const maybeUseLocalCodexFallback = async (content: string) => {
        if (!shouldUseLocalCodexJsonFallback(model, config, content)) {
          return content;
        }
        console.warn(`[BRIDGE] THE BRIDGE returned non-JSON for ${model}; using local Codex JSON fallback.`);
        return await callLocalCodexCompletion(model, messages, config);
      };

      try {
        const runtime = await requireBridgeRuntime(`running chat completion for model ${model}`);
        if (runtime.protocol === 'standalone') {
          if (authProfile?.provider === 'github-copilot') {
            return await callGithubCopilotDirectCompletion(model, messages, config);
          }
          await assertStandaloneBridgeProfileSupport(config);
          return await maybeUseLocalCodexFallback(
            await callStandaloneBridgeResponse(runtime.baseUrl, model, messages, config),
          );
        }
        const response = await client.chat.completions.create(requestBody);
        const content = response.choices?.[0]?.message?.content;

        if (!content) {
          throw new Error(`[BRIDGE] Empty response from model ${model}`);
        }

        return await maybeUseLocalCodexFallback(content);
      } catch (error: any) {
        // If JSON mode failed, retry without it
        if (config?.jsonMode && error?.status === 400) {
          console.warn('[BRIDGE] JSON mode not supported by provider, retrying without it...');
          delete requestBody.response_format;
          try {
            const response = await client.chat.completions.create(requestBody);
            return await maybeUseLocalCodexFallback(response.choices?.[0]?.message?.content || '');
          } catch (retryError) {
            throw normalizeBridgeError(retryError, `running chat completion for model ${model}`);
          }
        }
        throw normalizeBridgeError(error, `running chat completion for model ${model}`);
      }
    },

    async listModels(config?: CompletionConfig): Promise<ModelInfo[]> {
      try {
        const runtime = await requireBridgeRuntime('listing bridge providers');
        if (runtime.protocol === 'standalone') {
          const authProfile = await resolveBridgeAuthProfile(config);
          if (authProfile?.provider === 'github-copilot') {
            return await listGithubCopilotDirectModels(config);
          }
          return await standaloneBridgeModels(config);
        }
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
        if (isBridgeConnectionError(err)) {
          throw createBridgeRuntimeError('listing bridge providers');
        }
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
        if (isBridgeConnectionError(error)) {
          throw createBridgeRuntimeError('listing bridge models');
        }
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
          { id: 'openai-codex/gpt-5.5', name: 'Codex › gpt-5.5', provider: 'bridge' },
          { id: 'openai-codex/gpt-5.4', name: 'Codex › gpt-5.4', provider: 'bridge' },
          { id: 'openai-codex/gpt-5.4-mini', name: 'Codex › gpt-5.4-mini', provider: 'bridge' },
          { id: 'thebridge/default', name: 'Bridge › auto (default)', provider: 'bridge' },
        ];
      }
    },
  };
}
