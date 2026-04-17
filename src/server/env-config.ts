import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import type { ProviderInfo } from '../lib/api.js';

export type EnvConfigKey =
  | 'AI_PROVIDER'
  | 'XAI_API_KEY'
  | 'XAI_MODEL'
  | 'GEMINI_API_KEY'
  | 'GEMINI_API_KEYS'
  | 'GEMINI_MODEL'
  | 'OPENAI_API_KEY'
  | 'OPENAI_MODEL'
  | 'THEBRIDGE_URL'
  | 'THEBRIDGE_MODEL'
  | 'THEBRIDGE_HTTP_TOKEN'
  | 'PERPLEXITY_API_KEY'
  | 'SERPER_API_KEY'
  | 'APIFY_API_KEY'
  | 'NIMBLE_API_KEY';

export interface EnvConfigState {
  targetFile: string;
  onboardingRequired: boolean;
  config: Partial<Record<EnvConfigKey, string>>;
  configured: Partial<Record<EnvConfigKey, boolean>>;
  providers: ProviderInfo[];
}

const SECRET_KEYS: EnvConfigKey[] = [
  'XAI_API_KEY',
  'GEMINI_API_KEY',
  'GEMINI_API_KEYS',
  'OPENAI_API_KEY',
  'THEBRIDGE_HTTP_TOKEN',
  'PERPLEXITY_API_KEY',
  'SERPER_API_KEY',
  'APIFY_API_KEY',
  'NIMBLE_API_KEY',
];

const CONFIG_KEYS: EnvConfigKey[] = [
  'AI_PROVIDER',
  'XAI_API_KEY',
  'XAI_MODEL',
  'GEMINI_API_KEY',
  'GEMINI_API_KEYS',
  'GEMINI_MODEL',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'THEBRIDGE_URL',
  'THEBRIDGE_MODEL',
  'THEBRIDGE_HTTP_TOKEN',
  'PERPLEXITY_API_KEY',
  'SERPER_API_KEY',
  'APIFY_API_KEY',
  'NIMBLE_API_KEY',
];

function envFileCandidates() {
  return [
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), '.env'),
  ];
}

export async function resolveEnvTargetFile() {
  for (const file of envFileCandidates()) {
    try {
      await access(file);
      return file;
    } catch {
      // Keep searching.
    }
  }
  return path.join(process.cwd(), '.env.local');
}

function encodeEnvValue(value: string) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function buildEnvLine(key: string, value: string) {
  return `${key}=${encodeEnvValue(value)}`;
}

function mergeEnvContent(content: string, updates: Partial<Record<EnvConfigKey, string>>) {
  const lines = content.length > 0 ? content.split(/\r?\n/) : [];
  const seen = new Set<string>();
  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (!match) return line;
    const key = match[1] as EnvConfigKey;
    if (!CONFIG_KEYS.includes(key)) return line;
    seen.add(key);
    if (!(key in updates) || updates[key] === undefined) return line;
    return buildEnvLine(key, updates[key]!);
  });

  for (const key of CONFIG_KEYS) {
    const value = updates[key];
    if (!seen.has(key) && value !== undefined && value !== '') {
      nextLines.push(buildEnvLine(key, value));
    }
  }

  return nextLines.filter((line, index, arr) => !(index === arr.length - 1 && line === '')).join('\n') + '\n';
}

function redactConfig(rawConfig: Record<string, string | undefined>) {
  const config: Partial<Record<EnvConfigKey, string>> = {};
  const configured: Partial<Record<EnvConfigKey, boolean>> = {};

  for (const key of CONFIG_KEYS) {
    const value = rawConfig[key];
    configured[key] = Boolean(value);
    if (!value) continue;
    if (!SECRET_KEYS.includes(key)) {
      config[key] = value;
    }
  }

  return { config, configured };
}

export async function readEnvConfigState(providers: ProviderInfo[]): Promise<EnvConfigState> {
  const targetFile = await resolveEnvTargetFile();
  let parsed: Record<string, string | undefined> = {};

  try {
    const content = await readFile(targetFile, 'utf8');
    parsed = dotenv.parse(content);
  } catch {
    parsed = {};
  }

  const { config, configured } = redactConfig(parsed);
  return {
    targetFile: path.basename(targetFile),
    onboardingRequired: !providers.some((provider) => provider.status === 'ready'),
    config,
    configured,
    providers,
  };
}

export async function writeEnvConfig(
  updates: Partial<Record<EnvConfigKey, string>>,
): Promise<string> {
  const targetFile = await resolveEnvTargetFile();
  let current = '';

  try {
    current = await readFile(targetFile, 'utf8');
  } catch {
    current = '';
  }

  const normalized: Partial<Record<EnvConfigKey, string>> = {};
  for (const key of CONFIG_KEYS) {
    const value = updates[key];
    if (value === undefined) continue;
    const trimmed = value.trim();
    if (trimmed === '') continue;
    normalized[key] = trimmed;
  }

  const nextContent = mergeEnvContent(current, normalized);
  await writeFile(targetFile, nextContent, 'utf8');

  for (const [key, value] of Object.entries(normalized)) {
    process.env[key] = value;
  }

  return targetFile;
}
