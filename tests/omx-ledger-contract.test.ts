#!/usr/bin/env tsx
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appendOmxLedgerEvent, readOmxHistoryPayloads, readOmxLedgerEvents } from '../src/server/omx-ledger.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function run() {
  const runtimeDir = await mkdtemp(path.join(tmpdir(), 'omx-ledger-'));
  try {
    await appendOmxLedgerEvent(runtimeDir, 'build', 'build_compiled', {
      type: 'build_compiled',
      buildId: 'b1',
      status: 'stopped',
      wavesTotal: 2,
      wavesCompleted: 1,
    });
    await appendOmxLedgerEvent(runtimeDir, 'chat', 'operational_message', {
      type: 'operational_message',
      role: 'user',
      action: 'resume',
      message: 'continue',
      buildId: 'b1',
      status: 'stopped',
      resumeReason: 'stopped',
      wavesTotal: 2,
    });

    const ledger = await readOmxLedgerEvents(runtimeDir);
    const history = await readOmxHistoryPayloads(runtimeDir);
    const buildHistory = history[0] as Record<string, unknown> | undefined;
    const operationalHistory = history[1] as Record<string, unknown> | undefined;
    expect(ledger.length === 2, 'Expected ledger to persist both typed events.');
    expect(history.length === 2, 'Expected history projection to keep type-bearing payloads.');
    expect(history[0]?.type === 'build_compiled', 'Expected first projected payload to remain build_compiled.');
    expect(history[1]?.type === 'operational_message', 'Expected operational_message to be part of durable history.');
    expect(buildHistory?.buildId === 'b1', 'Expected build history to preserve the originating buildId.');
    expect(buildHistory?.status === 'stopped', 'Expected build history to preserve stopped status for parallel recovery.');
    expect(buildHistory?.wavesTotal === 2, 'Expected build history to preserve parallel wave totals.');
    expect(operationalHistory?.action === 'resume', 'Expected operational-message history to preserve resume intent.');
    expect(operationalHistory?.buildId === 'b1', 'Expected operational-message history to preserve the associated buildId.');
    expect(operationalHistory?.status === 'stopped', 'Expected operational-message history to preserve stopped status.');
    expect(operationalHistory?.resumeReason === 'stopped', 'Expected operational-message history to preserve resume reason.');
    expect(operationalHistory?.wavesTotal === 2, 'Expected operational-message history to preserve parallel wave totals.');
    console.log('PASS omx ledger contract');
  } finally {
    await rm(runtimeDir, { recursive: true, force: true }).catch(() => {});
  }
}

run().catch((error) => {
  console.error('FAIL omx ledger contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
