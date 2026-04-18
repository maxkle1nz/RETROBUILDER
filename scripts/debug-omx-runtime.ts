#!/usr/bin/env tsx
import express from 'express';
import { createOmxRouter } from '../src/server/routes/omx.ts';
import { createSession, deleteSession } from '../src/server/session-store.ts';

async function main() {
  const session = await createSession({
    name: `debug-${Date.now()}`,
    source: 'manual',
    manifesto: 'debug',
    architecture: 'debug',
    projectContext: 'debug',
    graph: {
      nodes: [{
        id: 'api-core',
        label: 'API Core',
        description: 'debug node',
        status: 'pending',
        type: 'backend',
        group: 1,
        priority: 1,
        data_contract: 'debug',
        acceptance_criteria: ['debug'],
        error_handling: ['debug'],
      }],
      links: [],
    },
  });

  const app = express();
  app.use(express.json());
  app.use(createOmxRouter());

  const server = await new Promise<import('node:http').Server>((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no address');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const buildRes = await fetch(`${baseUrl}/api/omx/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.id }),
    });
    const buildText = await buildRes.text();
    console.log('BUILD', buildRes.status, buildText);

    const statusRes1 = await fetch(`${baseUrl}/api/omx/status/${session.id}`);
    const statusText1 = await statusRes1.text();
    console.log('STATUS1', statusRes1.status, statusText1);

    const stopRes = await fetch(`${baseUrl}/api/omx/stop/${session.id}`, { method: 'POST' });
    const stopText = await stopRes.text();
    console.log('STOP', stopRes.status, stopText);

    const statusRes2 = await fetch(`${baseUrl}/api/omx/status/${session.id}`);
    const statusText2 = await statusRes2.text();
    console.log('STATUS2', statusRes2.status, statusText2);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    await deleteSession(session.id).catch((error) => {
      console.error('DELETE_SESSION_ERROR', error instanceof Error ? error.message : String(error));
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
