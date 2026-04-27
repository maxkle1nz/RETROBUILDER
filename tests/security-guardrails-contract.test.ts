#!/usr/bin/env tsx
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');

function read(relativePath: string) {
  return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function listServerSources(dir = path.join(ROOT, 'src/server')): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const absolute = path.join(dir, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) return listServerSources(absolute);
    return absolute.endsWith('.ts') ? [absolute] : [];
  });
}

function test_local_codex_fallback_is_explicit_and_sandboxed() {
  const bridge = read('src/server/providers/bridge.ts');
  expect(
    bridge.includes("process.env.RETROBUILDER_ENABLE_LOCAL_CODEX_FALLBACK === '1'"),
    'Expected local Codex JSON fallback to require explicit env opt-in.',
  );
  expect(
    bridge.includes('sandbox_mode = "read-only"'),
    'Expected local Codex JSON fallback config to use a read-only sandbox.',
  );
  expect(
    !bridge.includes('--dangerously-bypass-approvals-and-sandbox'),
    'Expected local Codex JSON fallback not to bypass approvals and sandboxing.',
  );
}

function test_server_sources_do_not_pin_personal_home_paths() {
  const offenders = listServerSources()
    .map((absolute) => ({ absolute, content: readFileSync(absolute, 'utf8') }))
    .filter(({ content }) => content.includes('/Users/cosmophonix'));
  expect(
    offenders.length === 0,
    `Expected server source to avoid personal absolute paths. Offenders: ${offenders.map((item) => path.relative(ROOT, item.absolute)).join(', ')}`,
  );
}

function run() {
  test_local_codex_fallback_is_explicit_and_sandboxed();
  test_server_sources_do_not_pin_personal_home_paths();
  console.log('PASS security guardrails contract');
}

run();
