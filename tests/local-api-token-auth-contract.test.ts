#!/usr/bin/env tsx
import express from 'express';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { assertLocalApiTokenForHost, requireLocalApiToken } from '../src/server/local-api-auth.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function withAuthServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use('/secure', requireLocalApiToken);
  app.get('/secure/ping', (_req, res) => res.json({ ok: true }));
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function test_local_api_token_middleware_is_default_off() {
  const original = process.env.RETROBUILDER_LOCAL_API_TOKEN;
  delete process.env.RETROBUILDER_LOCAL_API_TOKEN;
  try {
    await withAuthServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/secure/ping`);
      expect(response.status === 200, `Expected default-off token middleware to allow request. Got ${response.status}`);
    });
  } finally {
    if (original === undefined) delete process.env.RETROBUILDER_LOCAL_API_TOKEN;
    else process.env.RETROBUILDER_LOCAL_API_TOKEN = original;
  }
}

async function test_local_api_token_accepts_bearer_and_custom_header() {
  const original = process.env.RETROBUILDER_LOCAL_API_TOKEN;
  process.env.RETROBUILDER_LOCAL_API_TOKEN = 'retrobuilder-test-token';
  try {
    await withAuthServer(async (baseUrl) => {
      const denied = await fetch(`${baseUrl}/secure/ping`);
      expect(denied.status === 401, `Expected missing token to be rejected. Got ${denied.status}`);

      const bearer = await fetch(`${baseUrl}/secure/ping`, {
        headers: { authorization: 'Bearer retrobuilder-test-token' },
      });
      expect(bearer.status === 200, `Expected Bearer token to be accepted. Got ${bearer.status}`);

      const custom = await fetch(`${baseUrl}/secure/ping`, {
        headers: { 'X-Retrobuilder-Token': 'retrobuilder-test-token' },
      });
      expect(custom.status === 200, `Expected X-Retrobuilder-Token to be accepted. Got ${custom.status}`);
    });
  } finally {
    if (original === undefined) delete process.env.RETROBUILDER_LOCAL_API_TOKEN;
    else process.env.RETROBUILDER_LOCAL_API_TOKEN = original;
  }
}

function test_non_loopback_bind_requires_token() {
  const original = process.env.RETROBUILDER_LOCAL_API_TOKEN;
  delete process.env.RETROBUILDER_LOCAL_API_TOKEN;
  try {
    assertLocalApiTokenForHost('127.0.0.1');
    assertLocalApiTokenForHost('localhost');

    let threw = false;
    try {
      assertLocalApiTokenForHost('0.0.0.0');
    } catch (error) {
      threw = error instanceof Error && error.message.includes('RETROBUILDER_LOCAL_API_TOKEN is required');
    }
    expect(threw, 'Expected non-loopback bind to require RETROBUILDER_LOCAL_API_TOKEN.');

    process.env.RETROBUILDER_LOCAL_API_TOKEN = 'retrobuilder-test-token';
    assertLocalApiTokenForHost('0.0.0.0');
    assertLocalApiTokenForHost('::');
  } finally {
    if (original === undefined) delete process.env.RETROBUILDER_LOCAL_API_TOKEN;
    else process.env.RETROBUILDER_LOCAL_API_TOKEN = original;
  }
}

function test_sensitive_routes_are_mounted_before_routers() {
  const ROOT = path.resolve(import.meta.dirname, '..');
  const server = readFileSync(path.join(ROOT, 'server.ts'), 'utf8');
  const hostAssertIndex = server.indexOf('assertLocalApiTokenForHost(HOST)');
  const m1ndIndex = server.indexOf("app.use('/api/m1nd', requireLocalApiToken)");
  const omxIndex = server.indexOf("app.use('/api/omx', requireLocalApiToken)");
  const configIndex = server.indexOf("app.use('/api/config', requireLocalApiToken)");
  const aiIndex = server.indexOf("app.use('/api/ai', requireLocalApiToken)");
  const importIndex = server.indexOf("app.use('/api/sessions/import/codebase', requireLocalApiToken)");
  const configRouterIndex = server.indexOf('app.use(createConfigRouter())');
  const sessionRouterIndex = server.indexOf('app.use(createSessionRouter())');
  const m1ndRouterIndex = server.indexOf('app.use(createM1ndRouter())');
  const omxRouterIndex = server.indexOf('app.use(createOmxRouter())');
  const aiLimiterIndex = server.indexOf('app.use("/api/ai", aiLimiter)');
  const aiRouterIndex = server.indexOf('app.use(createAiRouter())');

  expect(hostAssertIndex >= 0 && hostAssertIndex < m1ndIndex, 'Expected server startup to require a local API token before non-loopback route exposure.');
  expect(m1ndIndex >= 0 && m1ndIndex < m1ndRouterIndex, 'Expected /api/m1nd token middleware before m1nd router.');
  expect(omxIndex >= 0 && omxIndex < omxRouterIndex, 'Expected /api/omx token middleware before omx router.');
  expect(configIndex >= 0 && configIndex < configRouterIndex, 'Expected /api/config token middleware before config router.');
  expect(aiIndex >= 0 && aiIndex < configRouterIndex, 'Expected /api/ai token middleware before provider/config routes.');
  expect(aiIndex >= 0 && aiIndex < aiLimiterIndex && aiIndex < aiRouterIndex, 'Expected /api/ai token middleware before AI limiter/router.');
  expect(importIndex >= 0 && importIndex < sessionRouterIndex, 'Expected codebase import token middleware before session router.');
}

function test_browser_clients_use_central_local_token_header_helper() {
  const ROOT = path.resolve(import.meta.dirname, '..');
  const helper = readFileSync(path.join(ROOT, 'src/lib/local-api-auth.ts'), 'utf8');
  const api = readFileSync(path.join(ROOT, 'src/lib/api.ts'), 'utf8');
  const m1nd = readFileSync(path.join(ROOT, 'src/lib/m1nd.ts'), 'utf8');
  const modelSelector = readFileSync(path.join(ROOT, 'src/components/ModelSelector.tsx'), 'utf8');

  expect(!helper.includes('localStorage'), 'Expected browser token helper to avoid persistent localStorage for sensitive local API tokens.');
  expect(helper.includes('inMemoryLocalApiToken'), 'Expected browser token helper to keep manually supplied tokens in memory only.');
  expect(helper.includes('setLocalApiAuthToken'), 'Expected browser token helper to expose an in-memory token setter for trusted UI flows.');
  expect(helper.includes('VITE_RETROBUILDER_LOCAL_API_TOKEN'), 'Expected browser token helper to support Vite env token.');
  expect(helper.includes("next.set('X-Retrobuilder-Token', token)"), 'Expected helper to set X-Retrobuilder-Token.');
  expect(api.includes("import { localApiAuthHeaders } from './local-api-auth'"), 'Expected api.ts to import token header helper.');
  expect((api.match(/localApiAuthHeaders/g) || []).length >= 20, 'Expected AI/config/OMX/import API calls to use local token headers.');
  expect(m1nd.includes("import { localApiAuthHeaders } from './local-api-auth'"), 'Expected m1nd client to import token header helper.');
  expect((m1nd.match(/localApiAuthHeaders/g) || []).length >= 3, 'Expected m1nd health and post calls to use local token headers.');
  expect(modelSelector.includes("import { localApiAuthHeaders } from '../lib/local-api-auth'"), 'Expected model warmup to use the central token header helper.');
  expect(modelSelector.includes("headers: localApiAuthHeaders({ 'Content-Type': 'application/json' })"), 'Expected model warmup route to include local token headers.');
}

async function run() {
  await test_local_api_token_middleware_is_default_off();
  await test_local_api_token_accepts_bearer_and_custom_header();
  test_non_loopback_bind_requires_token();
  test_sensitive_routes_are_mounted_before_routers();
  test_browser_clients_use_central_local_token_header_helper();
  console.log('PASS local API token auth contract');
}

run().catch((error) => {
  console.error('FAIL local API token auth contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
