#!/usr/bin/env tsx
import {
  buildLocalCodexPrompt,
  isBridgeFallbackSummary,
  localCodexJsonFallbackEnabled,
  resolveLocalCodexFallbackModel,
  resolveLocalCodexFallbackReasoningEffort,
  shouldUseLocalCodexJsonFallback,
} from '../src/server/providers/bridge.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function run() {
  const originalFallbackFlag = process.env.RETROBUILDER_ENABLE_LOCAL_CODEX_FALLBACK;
  const fallbackSummary = 'THEBRIDGE returned a resilient fallback summary because Codex execution was unavailable. codex exec request timed out after 12 seconds';
  expect(isBridgeFallbackSummary(fallbackSummary), 'Expected THE BRIDGE fallback summary to be detected.');
  delete process.env.RETROBUILDER_ENABLE_LOCAL_CODEX_FALLBACK;
  expect(!localCodexJsonFallbackEnabled(), 'Expected local Codex JSON fallback to be disabled by default.');
  expect(
    !shouldUseLocalCodexJsonFallback('openai-codex/gpt-5.4-mini', { jsonMode: true }, fallbackSummary),
    'Expected Codex JSON fallback to stay disabled unless explicitly opted in.',
  );
  process.env.RETROBUILDER_ENABLE_LOCAL_CODEX_FALLBACK = '1';
  expect(localCodexJsonFallbackEnabled(), 'Expected local Codex JSON fallback opt-in env to enable the fallback.');
  expect(
    shouldUseLocalCodexJsonFallback('openai-codex/gpt-5.4-mini', { jsonMode: true }, fallbackSummary),
    'Expected Codex JSON mode to use local fallback for bridge fallback summaries.',
  );
  expect(
    !shouldUseLocalCodexJsonFallback('github-copilot/gpt-5.4', { jsonMode: true }, fallbackSummary),
    'Expected GitHub Copilot models to avoid local Codex fallback.',
  );

  const prompt = buildLocalCodexPrompt(
    [
      { role: 'system', content: 'Return JSON only.' },
      { role: 'user', content: 'Build a todo app.' },
    ],
    { jsonMode: true },
  );
    expect(prompt.includes('Return only strict valid JSON'), 'Expected local Codex prompt to enforce strict JSON.');
    expect(prompt.includes('complete compact schema-valid JSON'), 'Expected local Codex prompt to prefer compact valid JSON.');
    expect(prompt.includes('literal newlines inside JSON strings'), 'Expected prompt to guard against malformed JSON strings.');
    expect(prompt.includes('[SYSTEM]\nReturn JSON only.'), 'Expected local Codex prompt to preserve the system message.');
    expect(prompt.includes('[USER]\nBuild a todo app.'), 'Expected local Codex prompt to preserve the user message.');

    expect(
      resolveLocalCodexFallbackModel('gpt-5.4-mini', { jsonMode: true }) === 'gpt-5.5',
      'Expected JSON fallback to promote mini models to the default frontier model.',
    );
    expect(
      resolveLocalCodexFallbackModel('openai-codex/gpt-5.4-mini', { jsonMode: true }) === 'gpt-5.5',
      'Expected OpenAI Codex mini aliases to promote to the default frontier model.',
    );
    expect(
      resolveLocalCodexFallbackModel('gpt-5.4-mini', { jsonMode: false }) === 'gpt-5.4-mini',
      'Expected non-JSON fallback to preserve the requested mini model.',
    );
    expect(
      resolveLocalCodexFallbackReasoningEffort({ jsonMode: true }) === 'medium',
      'Expected JSON fallback to use medium reasoning by default.',
    );
    expect(
    resolveLocalCodexFallbackReasoningEffort({ jsonMode: false }) === 'low',
    'Expected non-JSON fallback to keep low reasoning by default.',
  );

  if (originalFallbackFlag === undefined) delete process.env.RETROBUILDER_ENABLE_LOCAL_CODEX_FALLBACK;
  else process.env.RETROBUILDER_ENABLE_LOCAL_CODEX_FALLBACK = originalFallbackFlag;

  console.log('PASS bridge local Codex JSON fallback contract');
}

run();
