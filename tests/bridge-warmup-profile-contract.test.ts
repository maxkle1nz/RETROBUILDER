#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const aiRoute = readFileSync(path.join(ROOT, 'src/server/routes/ai.ts'), 'utf8');
const selector = readFileSync(path.join(ROOT, 'src/components/ModelSelector.tsx'), 'utf8');
const providerIndex = readFileSync(path.join(ROOT, 'src/server/providers/index.ts'), 'utf8');

function run() {
  expect(providerIndex.includes('warmModel?(model?: string, config?: CompletionConfig)'), 'Expected AIProvider warmModel signature to accept CompletionConfig.');
  expect(aiRoute.includes("const { model, provider: providerName, authProfile } = req.body;"), 'Expected warmup route to accept provider and authProfile.');
  expect(aiRoute.includes('createProvider(providerName)'), 'Expected warmup route to create the requested provider instead of always using the active global provider.');
  expect(aiRoute.includes("provider.warmModel(model, authProfile ? { authProfile, model } : { model })"), 'Expected warmup route to forward authProfile into provider warmup.');
  expect(selector.includes("provider: activeProvider"), 'Expected ModelSelector warmup request to include the active provider.');
  expect(selector.includes("authProfile: activeProvider === 'bridge' ? activeAuthProfile : null"), 'Expected ModelSelector warmup request to include bridge authProfile when relevant.');
  console.log('PASS bridge warmup profile contract');
}

run();
