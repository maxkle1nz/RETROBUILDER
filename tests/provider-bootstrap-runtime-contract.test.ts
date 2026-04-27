#!/usr/bin/env tsx

const PROVIDER_ENV_KEYS = [
  'AI_PROVIDER',
  'XAI_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'GEMINI_API_KEYS',
] as const;

const originalEnv = Object.fromEntries(
  PROVIDER_ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<typeof PROVIDER_ENV_KEYS[number], string | undefined>;

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function resetProviderEnv(overrides: Partial<Record<typeof PROVIDER_ENV_KEYS[number], string>> = {}) {
  for (const key of PROVIDER_ENV_KEYS) {
    delete process.env[key];
  }
  Object.assign(process.env, overrides);
}

function restoreProviderEnv() {
  for (const key of PROVIDER_ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function loadRuntime(caseName: string) {
  return await import(`../src/server/provider-runtime.ts?provider-bootstrap=${caseName}-${Date.now()}`);
}

async function expectActiveProvider(
  caseName: string,
  env: Partial<Record<typeof PROVIDER_ENV_KEYS[number], string>>,
  expectedProvider: string,
) {
  resetProviderEnv(env);
  const runtime = await loadRuntime(caseName);
  const provider = runtime.getActiveProvider();
  expect(provider.name === expectedProvider, `${caseName}: expected active provider ${expectedProvider}, got ${provider.name}`);
  expect(runtime.getActiveProviderName() === expectedProvider, `${caseName}: expected active provider name ${expectedProvider}`);
}

async function run() {
  try {
    await expectActiveProvider('clean-env', {}, 'bridge');
    await expectActiveProvider('invalid-env-provider', { AI_PROVIDER: 'not-real' }, 'bridge');
    await expectActiveProvider('xai-missing-key', { AI_PROVIDER: 'xai' }, 'bridge');
    await expectActiveProvider('openai-missing-key', { AI_PROVIDER: 'openai' }, 'bridge');
    await expectActiveProvider('gemini-missing-key', { AI_PROVIDER: 'gemini' }, 'bridge');
    await expectActiveProvider('xai-configured', { AI_PROVIDER: 'xai', XAI_API_KEY: 'test-key' }, 'xai');

    console.log('PASS provider bootstrap runtime contract');
  } finally {
    restoreProviderEnv();
  }
}

run().catch((error) => {
  restoreProviderEnv();
  console.error('FAIL provider bootstrap runtime contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
