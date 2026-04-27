#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const api = readFileSync(path.join(ROOT, 'src/lib/api.ts'), 'utf8');
const store = readFileSync(path.join(ROOT, 'src/store/useGraphStore.ts'), 'utf8');
const modal = readFileSync(path.join(ROOT, 'src/components/EnvConfigModal.tsx'), 'utf8');
const configRoute = readFileSync(path.join(ROOT, 'src/server/routes/config.ts'), 'utf8');

function run() {
  expect(api.includes('export interface AuthProfileInfo'), 'Expected api.ts to expose AuthProfileInfo.');
  expect(api.includes('fetchAuthProfiles'), 'Expected api.ts to expose fetchAuthProfiles.');
  expect(store.includes('activeAuthProfile'), 'Expected useGraphStore to track activeAuthProfile.');
  expect(store.includes('availableAuthProfiles'), 'Expected useGraphStore to track availableAuthProfiles.');
  expect(configRoute.includes("/api/ai/auth-profiles"), 'Expected config router to expose /api/ai/auth-profiles.');
  expect(modal.includes('Bridge Auth Profile'), 'Expected EnvConfigModal to render Bridge Auth Profile selection.');
  expect(modal.includes('THEBRIDGE_AUTH_PROFILE'), 'Expected EnvConfigModal to bind THEBRIDGE_AUTH_PROFILE in the form.');
  console.log('PASS auth profile visibility contract');
}

run();
