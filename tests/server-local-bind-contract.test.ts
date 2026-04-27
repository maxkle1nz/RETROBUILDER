#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const source = readFileSync(path.join(ROOT, 'server.ts'), 'utf8');

expect(source.includes('function resolveServerHost()'), 'Expected server startup to resolve a configurable bind host.');
expect(source.includes("return configured || '127.0.0.1'"), 'Expected server bind host to default to local loopback.');
expect(source.includes('RETROBUILDER_HOST'), 'Expected LAN exposure to require an explicit RETROBUILDER_HOST override.');
expect(!source.includes('app.listen(PORT, "0.0.0.0"'), 'Expected server not to hard-bind the control plane to 0.0.0.0.');

console.log('PASS server local bind contract');
