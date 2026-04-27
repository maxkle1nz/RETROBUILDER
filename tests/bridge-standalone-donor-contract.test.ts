#!/usr/bin/env tsx
import { inspectBridgeRuntime } from '../src/server/bridge-bootstrap.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function run() {
  const runtime = await inspectBridgeRuntime();
  expect(runtime.protocol === 'openai_compat' || runtime.protocol === 'standalone', 'Expected bridge runtime inspection to expose a protocol.');
  expect(runtime.source === 'env' || runtime.source === 'path' || runtime.source === 'donor', 'Expected bridge runtime inspection to expose a source.');

  if (runtime.source === 'donor') {
    expect(runtime.protocol === 'standalone', 'Expected donor-discovered runtime to use standalone protocol.');
    expect(runtime.command.includes('the-bridge/cli.mjs'), 'Expected donor-discovered runtime to launch the local donor bridge CLI.');
  }

  console.log('PASS bridge standalone donor contract', JSON.stringify({
    source: runtime.source,
    protocol: runtime.protocol,
    installed: runtime.installed,
    healthy: runtime.healthy,
  }));
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
