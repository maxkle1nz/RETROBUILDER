import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

function configuredLocalApiToken() {
  return (process.env.RETROBUILDER_LOCAL_API_TOKEN || '').trim();
}

export function isNonLoopbackBindHost(host: string) {
  const normalized = host.trim().toLowerCase();
  return normalized === '0.0.0.0' || normalized === '::' || normalized === '[::]';
}

export function assertLocalApiTokenForHost(host: string) {
  if (!isNonLoopbackBindHost(host) || configuredLocalApiToken()) return;
  throw new Error(
    'RETROBUILDER_LOCAL_API_TOKEN is required when binding Retrobuilder to a non-loopback host. ' +
    'Set RETROBUILDER_LOCAL_API_TOKEN and VITE_RETROBUILDER_LOCAL_API_TOKEN, or bind to 127.0.0.1.',
  );
}

function tokenFromRequest(req: Request) {
  const bearer = req.header('authorization') || '';
  const bearerMatch = bearer.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch?.[1]) return bearerMatch[1].trim();
  return (req.header('x-retrobuilder-token') || '').trim();
}

function safeTokenEquals(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function localApiTokenRequired() {
  return configuredLocalApiToken().length > 0;
}

export function requireLocalApiToken(req: Request, res: Response, next: NextFunction) {
  const expected = configuredLocalApiToken();
  if (!expected) return next();

  const actual = tokenFromRequest(req);
  if (actual && safeTokenEquals(actual, expected)) return next();

  return res.status(401).json({
    error: 'Local Retrobuilder API token required.',
    code: 'local_api_token_required',
  });
}
