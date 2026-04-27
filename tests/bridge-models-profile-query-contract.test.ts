#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const api = readFileSync(path.join(ROOT, 'src/lib/api.ts'), 'utf8');
const configRoute = readFileSync(path.join(ROOT, 'src/server/routes/config.ts'), 'utf8');
const selector = readFileSync(path.join(ROOT, 'src/components/ModelSelector.tsx'), 'utf8');
const modal = readFileSync(path.join(ROOT, 'src/components/EnvConfigModal.tsx'), 'utf8');
const app = readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');

function run() {
  expect(api.includes("params.set('authProfile', authProfile)"), 'Expected fetchModels() to support authProfile query forwarding.');
  expect(configRoute.includes("const authProfile = typeof req.query.authProfile === 'string'"), 'Expected /api/ai/models route to accept authProfile query input.');
  expect(configRoute.includes("targetP.listModels(authProfile ? { authProfile } : undefined)"), 'Expected /api/ai/models route to pass authProfile through to provider model inventory.');
  expect(selector.includes("const authProfile = providerName === 'bridge' ? activeAuthProfile : null;"), 'Expected ModelSelector to request bridge models for the active auth profile.');
  expect(modal.includes('fetchModels(selectedProvider, selectedAuthProfile)'), 'Expected EnvConfigModal to request profile-aware model inventory after bridge auth-profile changes.');
  expect(app.includes("setActiveAuthProfile(envState.config.THEBRIDGE_AUTH_PROFILE || null)"), 'Expected App bootstrap to hydrate the active bridge auth profile from env config.');
  console.log('PASS bridge models profile query contract');
}

run();
