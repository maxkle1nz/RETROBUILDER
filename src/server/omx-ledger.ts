import { appendFile, mkdir, readFile } from 'node:fs/promises';
import * as path from 'node:path';

export const OMX_LEDGER_VERSION = 1 as const;
const LEDGER_FILE = 'omx-ledger.ndjson';

export type OmxLedgerCategory =
  | 'build'
  | 'wave'
  | 'task'
  | 'worker'
  | 'verify'
  | 'merge'
  | 'chat'
  | 'system';

export interface OmxLedgerEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  ledgerVersion: typeof OMX_LEDGER_VERSION;
  timestamp: string;
  category: OmxLedgerCategory;
  name: string;
  payload: TPayload;
}

export function buildLedgerFile(runtimeDir: string) {
  return path.join(runtimeDir, LEDGER_FILE);
}

export async function appendOmxLedgerEvent<TPayload extends Record<string, unknown>>(
  runtimeDir: string,
  category: OmxLedgerCategory,
  name: string,
  payload: TPayload,
) {
  await mkdir(runtimeDir, { recursive: true }).catch(() => {});
  const event: OmxLedgerEvent<TPayload> = {
    ledgerVersion: OMX_LEDGER_VERSION,
    timestamp: new Date().toISOString(),
    category,
    name,
    payload,
  };
  await appendFile(buildLedgerFile(runtimeDir), `${JSON.stringify(event)}\n`, 'utf8');
  return event;
}

export async function readOmxLedgerEvents(runtimeDir: string): Promise<OmxLedgerEvent[]> {
  try {
    const raw = await readFile(buildLedgerFile(runtimeDir), 'utf8');
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((entry) => entry && typeof entry === 'object' && entry.payload && typeof entry.payload === 'object');
  } catch {
    return [];
  }
}

export async function readOmxHistoryPayloads(runtimeDir: string): Promise<Record<string, unknown>[]> {
  const events = await readOmxLedgerEvents(runtimeDir);
  return events
    .map((event) => event.payload)
    .filter((payload) => payload && typeof payload.type === 'string');
}
