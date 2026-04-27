#!/usr/bin/env tsx

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function run() {
  const baseUrl = (process.env.RETROBUILDER_TEST_BASE || 'http://127.0.0.1:7777').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/api/m1nd/health`, {
    signal: AbortSignal.timeout(5000),
  });
  const payload = await response.json() as {
    connected?: boolean;
    nodeCount?: number;
    edgeCount?: number;
    graphState?: string;
  };

  expect(response.status === 200, `Expected /api/m1nd/health at ${baseUrl} to succeed, got ${response.status}`);
  expect(payload.connected === true, `Expected m1nd to be connected at ${baseUrl}, got ${JSON.stringify(payload)}`);
  expect((payload.nodeCount || 0) > 0, `Expected m1nd nodeCount > 0, got ${JSON.stringify(payload)}`);
  expect((payload.edgeCount || 0) > 0, `Expected m1nd edgeCount > 0, got ${JSON.stringify(payload)}`);

  console.log(`PASS m1nd health runtime smoke ${baseUrl} ${JSON.stringify(payload)}`);
}

run().catch((error) => {
  console.error('FAIL m1nd health runtime smoke');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
