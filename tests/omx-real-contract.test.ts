#!/usr/bin/env tsx
/**
 * OMX Real Builder Contract (RED phase)
 *
 * These tests define the desired contract for the real OMX runtime:
 * - explicit build lifecycle routes
 * - real workspace path under the per-session runtime directory
 * - native Codex CLI transport surfaced in API payloads
 * - SSE stream attaches to an active build instead of auto-starting simulation
 *
 * LAW: these are desired-contract tests, not "absence proofs".
 * They should fail against the simulation-first OMX and go green only when the
 * real runner exists.
 */

import express from 'express';
import { chmod, mkdtemp, rm, writeFile as writeFsFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { createOmxRouter } from '../src/server/routes/omx.ts';
import { createSession, deleteSession, getRuntimeDirectory, type SessionDocument } from '../src/server/session-store.ts';

function expect(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function truncate(text: string, max = 220) {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function withFakeCodex<T>(run: () => Promise<T>): Promise<T> {
  const fakeBinDir = await mkdtemp(path.join(tmpdir(), 'omx-fake-codex-'));
  const fakeCodexPath = path.join(fakeBinDir, 'codex');
  const originalPath = process.env.PATH || '';

  await writeFsFile(
    fakeCodexPath,
    [
      '#!/bin/sh',
      'if [ "$1" = "--version" ]; then',
      '  echo "codex 0.0-test"',
      '  exit 0',
      'fi',
      'if [ "$1" = "exec" ]; then',
      '  echo "{\"ok\":true,\"source\":\"fake-codex\"}"',
      '  exit 0',
      'fi',
      'exit 0',
      '',
    ].join('\n'),
    'utf8',
  );
  await chmod(fakeCodexPath, 0o755);
  process.env.PATH = `${fakeBinDir}${path.delimiter}${originalPath}`;

  try {
    return await run();
  } finally {
    process.env.PATH = originalPath;
    await rm(fakeBinDir, { force: true, recursive: true }).catch(() => {});
  }
}

async function withOmxServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use(createOmxRouter());

  const server = await new Promise<import('node:http').Server>((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Failed to resolve ephemeral OMX test server port.');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    return await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function createReadySession(): Promise<SessionDocument> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return createSession({
    name: `OMX Real Contract ${stamp}`,
    source: 'manual',
    manifesto: 'Materialize the blueprint into a real workspace using Codex CLI and stream the runtime state back to the builder UI.',
    architecture: 'OMX owns execution. Build lifecycle is explicit: build, status, stop, stream.',
    projectContext: 'RED contract test for the real OMX runtime.',
    graph: {
      nodes: [
        {
          id: 'api-core',
          label: 'API Core',
          description: 'Materialize the first backend slice into the real workspace.',
          status: 'pending',
          type: 'backend',
          group: 1,
          priority: 1,
          data_contract: 'Input: blueprint session. Output: real workspace artifacts, build status snapshots, SSE progress, and Codex transport metadata.',
          acceptance_criteria: [
            'A build can be started through an explicit OMX build route.',
            'The build exposes workspace, status, stop, and stream surfaces for the active session.',
          ],
          error_handling: [
            'Propagate Codex CLI failures into build status and SSE logs.',
          ],
        },
      ],
      links: [],
    },
  });
}

interface OmxBuildStartResponse {
  sessionId: string;
  buildId: string;
  status: 'queued' | 'running' | 'stopping' | 'stopped';
  workspacePath: string;
  streamUrl: string;
  statusUrl: string;
  stopUrl: string;
  transport: {
    kind: 'codex-cli';
    command: string;
    available: boolean;
  };
  source: 'persisted-session' | 'session-draft';
  designProfile?: '21st';
  designGateStatus?: 'pending' | 'passed' | 'failed';
  designScore?: number;
  designFindings?: string[];
  designEvidence?: string[];
}

interface OmxBuildResultSummary {
  totalFiles: number;
  totalLines: number;
  elapsedMs: number;
  systemVerify?: {
    status: 'pending' | 'passed' | 'failed' | 'not_available';
    command?: string;
    summary?: string;
  };
}

interface OmxStatusResponse {
  sessionId: string;
  buildId?: string;
  status: 'idle' | 'queued' | 'running' | 'succeeded' | 'failed' | 'stopping' | 'stopped';
  workspacePath?: string;
  transport: {
    kind: 'codex-cli';
    command: string;
    available: boolean;
  };
  source: 'persisted-session' | 'session-draft';
  totalNodes?: number;
  completedNodes?: number;
  buildProgress?: number;
  activeNodeId?: string | null;
  nodeStates?: Record<string, 'dormant' | 'queued' | 'building' | 'complete' | 'error'>;
  result?: OmxBuildResultSummary;
  terminalMessage?: string;
  designProfile?: '21st';
  designGateStatus?: 'pending' | 'passed' | 'failed';
  designScore?: number;
  designFindings?: string[];
  designEvidence?: string[];
  resumeAvailable?: boolean;
  resumeReason?: 'interrupted' | 'stopped' | 'failed';
  wavesTotal?: number;
  wavesCompleted?: number;
  activeWaveId?: string | null;
  activeTasks?: string[];
  workerCount?: number;
  verifyPendingCount?: number;
  mergePendingCount?: number;
  ledgerVersion?: number;
}

async function createDesignBlockedSession(): Promise<SessionDocument> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return createSession({
    name: `OMX Design Block ${stamp}`,
    source: 'manual',
    manifesto: 'A user-facing system still needs real UIX certification before build.',
    architecture: 'Frontend surfaces must pass the 21st design gate before OMX starts.',
    projectContext: 'Contract test for design gate blocking at OMX build start.',
    graph: {
      nodes: [
        {
          id: 'broken-frontend',
          label: 'Broken Frontend',
          description: 'A user-facing surface with no contract discipline.',
          status: 'pending',
          type: 'frontend',
          group: 1,
          priority: 1,
          data_contract: '',
          acceptance_criteria: [],
          error_handling: [],
        },
      ],
      links: [],
    },
  });
}

async function test_omx_build_route_prefers_explicit_session_draft_when_provided() {
  const session = await createReadySession();
  try {
    await withOmxServer(async (baseUrl) => {
      const draft = {
        name: session.name,
        source: session.source,
        graph: session.graph,
        manifesto: 'DRAFT manifesto should drive the real build runtime.',
        architecture: 'DRAFT architecture should drive the real build runtime.',
        projectContext: session.projectContext,
        importMeta: session.importMeta || null,
      };

      const response = await fetch(`${baseUrl}/api/omx/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, draft }),
      });
      const text = await response.text();
      const data = safeJson(text) as OmxBuildStartResponse | null;

      expect(
        response.status === 202,
        `Expected POST /api/omx/build with draft to start successfully. Got ${response.status}: ${truncate(text)}`,
      );
      expect(
        data?.source === 'session-draft',
        `Expected build payload to disclose that the real build is using the explicit session draft. Got: ${String(data?.source)}`,
      );
      expect(
        data?.transport?.kind === 'codex-cli',
        'Expected draft-based real builds to keep exposing Codex CLI transport metadata.',
      );
    });
  } finally {
    await deleteSession(session.id);
  }
}

async function test_omx_build_route_rejects_real_builds_when_codex_transport_is_unavailable() {
  const session = await createReadySession();
  const original = process.env.PATH;
  try {
    await withOmxServer(async (baseUrl) => {
      const warmResponse = await fetch(`${baseUrl}/api/omx/status/${session.id}`);
      const warmText = await warmResponse.text();
      expect(
        warmResponse.status === 200,
        `Expected status warm-up request to succeed before simulating Codex unavailability. Got ${warmResponse.status}: ${truncate(warmText)}`,
      );

      process.env.PATH = '';

      const response = await fetch(`${baseUrl}/api/omx/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const text = await response.text();
      const data = safeJson(text) as { error?: string } | null;

      expect(
        response.status === 503,
        `Expected POST /api/omx/build to reject real builds when Codex CLI is unavailable, even after availability was warmed earlier. Got ${response.status}: ${truncate(text)}`,
      );
      expect(
        typeof data?.error === 'string' && /codex/i.test(data.error),
        `Expected unavailable-Codex build rejection to mention Codex explicitly. Got: ${truncate(text)}`,
      );
    });
  } finally {
    process.env.PATH = original;
    await deleteSession(session.id);
  }
}

async function test_omx_build_route_returns_real_runtime_contract() {
  const session = await createReadySession();
  try {
    await withOmxServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/omx/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const text = await response.text();
      const data = safeJson(text) as OmxBuildStartResponse | null;

      expect(
        response.status === 202,
        `Expected POST /api/omx/build to return 202 and start a real build lifecycle. Got ${response.status}: ${truncate(text)}`,
      );
      expect(data && typeof data === 'object', 'Expected POST /api/omx/build to return a JSON runtime payload.');
      expect(data?.sessionId === session.id, 'Expected build payload to echo the sessionId being materialized.');
      expect(typeof data?.buildId === 'string' && data.buildId.length > 0, 'Expected build payload to include a buildId.');
      expect(data?.status === 'queued' || data?.status === 'running', 'Expected build status to start as queued or running.');

      const runtimeDir = getRuntimeDirectory(session.id);
      expect(typeof data?.workspacePath === 'string' && data.workspacePath.startsWith(runtimeDir), `Expected workspacePath to live under ${runtimeDir}. Got: ${data?.workspacePath}`);
      expect(data?.workspacePath !== runtimeDir, 'Expected workspacePath to point to a real workspace subtree, not the bare runtime directory.');
      expect(data?.streamUrl === `/api/omx/stream/${session.id}`, 'Expected build payload to advertise the session stream URL.');
      expect(data?.statusUrl === `/api/omx/status/${session.id}`, 'Expected build payload to advertise the session status URL.');
      expect(data?.stopUrl === `/api/omx/stop/${session.id}`, 'Expected build payload to advertise the session stop URL.');
      expect(data?.transport?.kind === 'codex-cli', 'Expected build payload to expose Codex CLI as the native transport.');
      expect(typeof data?.transport?.command === 'string' && data.transport.command.length > 0, 'Expected build payload to expose the Codex command explicitly.');
      expect(typeof data?.transport?.available === 'boolean', 'Expected build payload to surface Codex availability as a boolean.');
      expect(data?.source === 'persisted-session', `Expected persisted-session builds to disclose source='persisted-session'. Got: ${String(data?.source)}`);
      expect(data?.designProfile === '21st', `Expected build payload to expose the active design profile. Got: ${String(data?.designProfile)}`);
      expect(data?.designGateStatus === 'passed', `Expected build payload to expose a passed design gate for a well-formed session. Got: ${String(data?.designGateStatus)}`);
      expect(typeof data?.designScore === 'number', `Expected build payload to expose a numeric design score. Got: ${truncate(text)}`);
    });
  } finally {
    await deleteSession(session.id);
  }
}

async function test_omx_build_route_blocks_when_design_gate_fails() {
  const session = await createDesignBlockedSession();
  try {
    await withOmxServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/omx/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const text = await response.text();
      const data = safeJson(text) as { error?: string; design?: Record<string, unknown> } | null;

      expect(
        response.status === 409,
        `Expected OMX build start to be blocked when the 21st design gate fails. Got ${response.status}: ${truncate(text)}`,
      );
      expect(
        typeof data?.error === 'string' && /design gate/i.test(data.error),
        `Expected design-gate rejection to mention the design gate explicitly. Got: ${truncate(text)}`,
      );
      expect(
        data?.design?.designProfile === '21st',
        `Expected design-gate rejection payload to include structured design summary. Got: ${truncate(text)}`,
      );
      expect(
        data?.design?.designGateStatus === 'failed',
        `Expected design-gate rejection payload to expose failed gate status. Got: ${truncate(text)}`,
      );

      const statusResponse = await fetch(`${baseUrl}/api/omx/status/${session.id}`);
      const statusText = await statusResponse.text();
      const status = safeJson(statusText) as OmxStatusResponse | null;
      expect(
        statusResponse.status === 200,
        `Expected blocked build status to be persisted for reload/re-entry. Got ${statusResponse.status}: ${truncate(statusText)}`,
      );
      expect(
        status?.status === 'failed',
        `Expected persisted blocked status to report failed. Got: ${truncate(statusText)}`,
      );
      expect(
        status?.designGateStatus === 'failed',
        `Expected persisted blocked status to preserve designGateStatus=failed. Got: ${truncate(statusText)}`,
      );
      expect(
        status?.resumeAvailable === false || status?.resumeAvailable === undefined,
        `Expected design-gate block before execution not to advertise resumability yet. Got: ${truncate(statusText)}`,
      );

      const historyResponse = await fetch(`${baseUrl}/api/omx/history/${session.id}`);
      const historyText = await historyResponse.text();
      const history = safeJson(historyText) as { events?: Array<Record<string, unknown>> } | null;
      expect(
        historyResponse.status === 200,
        `Expected design-gate block to be recorded in OMX history. Got ${historyResponse.status}: ${truncate(historyText)}`,
      );
      expect(
        history?.events?.some((event) => event.type === 'build_terminal' && event.status === 'failed' && /BUILD BLOCKED/i.test(String(event.message || ''))),
        `Expected history to include a failed BUILD BLOCKED terminal event. Got: ${truncate(historyText)}`,
      );
      expect(
        history?.events?.some((event) => event.designGateStatus === 'failed'),
        `Expected history to preserve failed design gate metadata. Got: ${truncate(historyText)}`,
      );
    });
  } finally {
    await deleteSession(session.id);
  }
}

async function test_omx_build_route_treats_design_gate_block_as_controlled_warning_not_runtime_error() {
  const session = await createDesignBlockedSession();
  const originalError = console.error;
  const originalWarn = console.warn;
  const errorCalls: string[] = [];
  const warnCalls: string[] = [];

  console.error = (...args: unknown[]) => {
    errorCalls.push(args.map((arg) => String(arg)).join(' '));
  };
  console.warn = (...args: unknown[]) => {
    warnCalls.push(args.map((arg) => String(arg)).join(' '));
  };

  try {
    await withOmxServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/omx/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const text = await response.text();

      expect(
        response.status === 409,
        `Expected design-gate rejection to remain a controlled 409 response. Got ${response.status}: ${truncate(text)}`,
      );
    });

    expect(errorCalls.length === 0, `Expected design-gate blocks to avoid console.error noise. Got: ${errorCalls.join(' | ')}`);
    expect(
      warnCalls.some((entry) => /design gate/i.test(entry)),
      `Expected design-gate blocks to emit a warning-level operational log. Got: ${warnCalls.join(' | ')}`,
    );
    expect(
      !warnCalls.some((entry) => /error-handling/i.test(entry)),
      `Expected design-gate warning log to avoid echoing raw finding text that trips generic error alerts. Got: ${warnCalls.join(' | ')}`,
    );
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
    await deleteSession(session.id);
  }
}

async function test_omx_status_route_reports_idle_runtime_before_build_start() {
  const session = await createReadySession();
  try {
    await withOmxServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/omx/status/${session.id}`);
      const text = await response.text();
      const data = safeJson(text) as OmxStatusResponse | null;

      expect(
        response.status === 200,
        `Expected GET /api/omx/status/:sessionId to exist and report idle runtime state before build start. Got ${response.status}: ${truncate(text)}`,
      );
      expect(data?.sessionId === session.id, 'Expected status payload to echo the sessionId.');
      expect(data?.status === 'idle', `Expected pre-build OMX status to be idle. Got: ${data?.status}`);
      expect(data?.buildId === undefined, `Expected idle OMX status to have no active buildId. Got: ${String(data?.buildId)}`);
      expect(data?.transport?.kind === 'codex-cli', 'Expected status payload to expose Codex CLI as the native transport.');
      expect(typeof data?.transport?.command === 'string' && data.transport.command.length > 0, 'Expected status payload to expose a concrete Codex command.');
      expect(typeof data?.transport?.available === 'boolean', 'Expected status payload to surface Codex availability as a boolean.');
      expect(data?.designProfile === '21st', `Expected idle OMX status to disclose the 21st design profile. Got: ${String(data?.designProfile)}`);
      expect(data?.resumeAvailable === false, `Expected idle OMX status not to advertise resume availability. Got: ${truncate(text)}`);
    });
  } finally {
    await deleteSession(session.id);
  }
}

async function test_omx_status_route_reflects_active_build_after_explicit_start() {
  const session = await createReadySession();
  try {
    await withOmxServer(async (baseUrl) => {
      const buildResponse = await fetch(`${baseUrl}/api/omx/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const buildText = await buildResponse.text();
      const build = safeJson(buildText) as OmxBuildStartResponse | null;

      expect(
        buildResponse.status === 202,
        `Expected POST /api/omx/build to succeed before checking live status. Got ${buildResponse.status}: ${truncate(buildText)}`,
      );

      const statusResponse = await fetch(`${baseUrl}/api/omx/status/${session.id}`);
      const statusText = await statusResponse.text();
      const status = safeJson(statusText) as OmxStatusResponse | null;

      expect(
        statusResponse.status === 200,
        `Expected GET /api/omx/status/:sessionId to report the active build after POST /api/omx/build. Got ${statusResponse.status}: ${truncate(statusText)}`,
      );
      expect(status?.sessionId === session.id, 'Expected active status payload to echo the sessionId.');
      expect(status?.buildId === build?.buildId, 'Expected active status payload to reuse the buildId returned by POST /api/omx/build.');
      expect(status?.status === 'queued' || status?.status === 'running', `Expected active OMX status to be queued or running. Got: ${status?.status}`);
      expect(status?.workspacePath === build?.workspacePath, 'Expected active status payload to report the same workspacePath returned by POST /api/omx/build.');
      expect(status?.designGateStatus === 'passed', `Expected active status payload to preserve the passed design gate. Got: ${String(status?.designGateStatus)}`);
    });
  } finally {
    await deleteSession(session.id);
  }
}

async function test_omx_stop_route_rejects_stop_requests_without_active_build() {
  const session = await createReadySession();
  try {
    await withOmxServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/omx/stop/${session.id}`, {
        method: 'POST',
      });
      const text = await response.text();
      const data = safeJson(text) as { error?: string; sessionId?: string; status?: string } | null;

      expect(
        response.status === 409,
        `Expected POST /api/omx/stop/:sessionId to exist and reject stop requests when no build is active. Got ${response.status}: ${truncate(text)}`,
      );
      expect(data?.sessionId === session.id, 'Expected stop rejection payload to echo the sessionId.');
      expect(data?.status === 'idle', `Expected stop rejection payload to expose idle status. Got: ${data?.status}`);
      expect(typeof data?.error === 'string' && /no active build/i.test(data.error), `Expected stop rejection to explain that no active build exists. Got: ${data?.error}`);
    });
  } finally {
    await deleteSession(session.id);
  }
}

async function test_omx_stop_route_stops_active_build() {
  const session = await createReadySession();
  try {
    await withOmxServer(async (baseUrl) => {
      const buildResponse = await fetch(`${baseUrl}/api/omx/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const buildText = await buildResponse.text();
      const build = safeJson(buildText) as OmxBuildStartResponse | null;

      expect(
        buildResponse.status === 202,
        `Expected POST /api/omx/build to succeed before testing stop behavior. Got ${buildResponse.status}: ${truncate(buildText)}`,
      );

      const stopResponse = await fetch(`${baseUrl}/api/omx/stop/${session.id}`, {
        method: 'POST',
      });
      const stopText = await stopResponse.text();
      const stop = safeJson(stopText) as { sessionId?: string; buildId?: string; status?: string } | null;

      expect(
        stopResponse.status === 202,
        `Expected POST /api/omx/stop/:sessionId to stop an active build. Got ${stopResponse.status}: ${truncate(stopText)}`,
      );
      expect(stop?.sessionId === session.id, 'Expected stop payload to echo the sessionId.');
      expect(stop?.buildId === build?.buildId, 'Expected stop payload to echo the active buildId.');
      expect(stop?.status === 'stopping' || stop?.status === 'stopped', `Expected stop payload to expose stopping or stopped status. Got: ${stop?.status}`);

      const statusResponse = await fetch(`${baseUrl}/api/omx/status/${session.id}`);
      const statusText = await statusResponse.text();
      const status = safeJson(statusText) as OmxStatusResponse | null;
      expect(
        status?.status === 'stopping' || status?.status === 'stopped',
        `Expected post-stop status polling to expose stopping or stopped lifecycle state. Got: ${truncate(statusText)}`,
      );
      if (status?.status === 'stopped') {
        expect(
          status?.resumeAvailable === true && status?.resumeReason === 'stopped',
          `Expected stopped OMX status to advertise explicit resume truth. Got: ${truncate(statusText)}`,
        );
      }
    });
  } finally {
    await deleteSession(session.id);
  }
}

async function test_omx_stream_requires_explicit_build_start_and_never_autostarts_simulation() {
  const session = await createReadySession();
  try {
    await withOmxServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/omx/stream/${session.id}`, {
        headers: { Accept: 'text/event-stream' },
      });

      expect(
        response.status === 409,
        `Expected GET /api/omx/stream/:sessionId to require an explicitly started build instead of auto-starting simulation. Got ${response.status} with content-type ${response.headers.get('content-type') || 'unknown'}.`,
      );

      const text = await response.text();
      const data = safeJson(text) as { error?: string } | null;
      expect(typeof data?.error === 'string' && /build/i.test(data.error), `Expected stream rejection payload to explain that a build must be started first. Got: ${truncate(text)}`);
    });
  } finally {
    await deleteSession(session.id);
  }
}

async function test_omx_stream_emits_real_build_identity_after_explicit_build_start() {
  const session = await createReadySession();
  try {
    await withOmxServer(async (baseUrl) => {
      const buildResponse = await fetch(`${baseUrl}/api/omx/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const buildText = await buildResponse.text();
      const build = safeJson(buildText) as OmxBuildStartResponse | null;

      expect(
        buildResponse.status === 202,
        `Expected POST /api/omx/build to succeed before attaching to the real stream. Got ${buildResponse.status}: ${truncate(buildText)}`,
      );
      expect(typeof build?.buildId === 'string' && build.buildId.length > 0, 'Expected build route to provide a buildId before streaming.');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      let streamResponse: Response | null = null;
      try {
        streamResponse = await fetch(`${baseUrl}/api/omx/stream/${session.id}`, {
          headers: { Accept: 'text/event-stream' },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      expect(streamResponse?.status === 200, `Expected GET /api/omx/stream/:sessionId to attach to the active real build. Got ${streamResponse?.status}.`);
      expect(
        (streamResponse?.headers.get('content-type') || '').includes('text/event-stream'),
        `Expected OMX stream to return text/event-stream. Got: ${streamResponse?.headers.get('content-type') || 'unknown'}`,
      );

      const reader = streamResponse?.body?.getReader();
      expect(reader, 'Expected OMX stream response to expose a readable body.');
      const decoder = new TextDecoder();
      let buffer = '';
      const deadline = Date.now() + 5000;
      let matchedBuildId = false;
      let leakedSimulationId = false;

      while (Date.now() < deadline && !(matchedBuildId || leakedSimulationId)) {
        const chunk = await reader!.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const dataLines = buffer.match(/^data: .+$/gm) || [];
        for (const line of dataLines) {
          const payload = safeJson(line.slice(6));
          if (!payload || typeof payload !== 'object') continue;
          if ((payload as Record<string, unknown>).sessionId === 'sim') {
            leakedSimulationId = true;
          }
          if ((payload as Record<string, unknown>).buildId === build?.buildId) {
            matchedBuildId = true;
          }
        }
      }

      await reader?.cancel().catch(() => {});

      expect(
        matchedBuildId,
        `Expected OMX stream to emit at least one event tied to the explicit buildId ${build?.buildId}. Got: ${truncate(buffer)}`,
      );
      expect(
        !leakedSimulationId,
        `Expected real OMX stream to stop advertising the fake simulation sessionId "sim". Got: ${truncate(buffer)}`,
      );
    });
  } finally {
    await deleteSession(session.id);
  }
}

async function test_omx_start_route_reuses_stopping_build_identity_without_downgrading_status() {
  const session = await createReadySession();
  try {
    await withOmxServer(async (baseUrl) => {
      const buildResponse = await fetch(`${baseUrl}/api/omx/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const buildText = await buildResponse.text();
      const build = safeJson(buildText) as OmxBuildStartResponse | null;
      expect(buildResponse.status === 202, `Expected initial build start to succeed. Got ${buildResponse.status}: ${truncate(buildText)}`);

      const stopResponse = await fetch(`${baseUrl}/api/omx/stop/${session.id}`, { method: 'POST' });
      const stopText = await stopResponse.text();
      const stop = safeJson(stopText) as { status?: string; buildId?: string } | null;
      expect(stopResponse.status === 202, `Expected stop request to succeed before restart probe. Got ${stopResponse.status}: ${truncate(stopText)}`);
      expect(stop?.status === 'stopping' || stop?.status === 'stopped', `Expected stop request to move build into stopping/stopped state. Got: ${String(stop?.status)}`);

      const restartResponse = await fetch(`${baseUrl}/api/omx/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const restartText = await restartResponse.text();
      const restart = safeJson(restartText) as OmxBuildStartResponse | null;

      expect(restartResponse.status === 202, `Expected restart probe to reuse the in-flight build identity. Got ${restartResponse.status}: ${truncate(restartText)}`);
      expect(restart?.buildId === build?.buildId, 'Expected restart probe during stop to reuse the same buildId rather than spawn a duplicate build.');
      expect(restart?.status === 'stopping' || restart?.status === 'stopped', `Expected restart probe to preserve stopping/stopped state instead of downgrading to running. Got: ${String(restart?.status)}`);
    });
  } finally {
    await deleteSession(session.id);
  }
}

async function test_omx_start_route_reuses_stopped_parallel_build_identity_before_cleanup_window_expires() {
  const session = await createReadySession();
  try {
    await withOmxServer(async (baseUrl) => {
      const buildResponse = await fetch(`${baseUrl}/api/omx/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const buildText = await buildResponse.text();
      const build = safeJson(buildText) as OmxBuildStartResponse | null;
      expect(buildResponse.status === 202, `Expected initial build start to succeed before stopped-resume probe. Got ${buildResponse.status}: ${truncate(buildText)}`);

      const stopResponse = await fetch(`${baseUrl}/api/omx/stop/${session.id}`, { method: 'POST' });
      const stopText = await stopResponse.text();
      const stop = safeJson(stopText) as { status?: string; buildId?: string } | null;
      expect(stopResponse.status === 202, `Expected stop request to succeed before stopped-resume probe. Got ${stopResponse.status}: ${truncate(stopText)}`);
      expect(stop?.status === 'stopping' || stop?.status === 'stopped', `Expected stop request to move build into stopping/stopped state before resume probe. Got: ${String(stop?.status)}`);

      const deadline = Date.now() + 4000;
      let stoppedStatus: OmxStatusResponse | null = null;
      while (Date.now() < deadline) {
        const statusResponse = await fetch(`${baseUrl}/api/omx/status/${session.id}`);
        const statusText = await statusResponse.text();
        const status = safeJson(statusText) as OmxStatusResponse | null;
        if (status?.status === 'stopped') {
          stoppedStatus = status;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      expect(stoppedStatus?.status === 'stopped', `Expected stop lifecycle to settle into stopped before resume-window reuse. Got: ${truncate(JSON.stringify(stoppedStatus))}`);
      expect(stoppedStatus?.resumeAvailable === true && stoppedStatus?.resumeReason === 'stopped', `Expected stopped build to advertise resume availability before cleanup window expires. Got: ${truncate(JSON.stringify(stoppedStatus))}`);

      const restartResponse = await fetch(`${baseUrl}/api/omx/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const restartText = await restartResponse.text();
      const restart = safeJson(restartText) as OmxBuildStartResponse | null;

      expect(restartResponse.status === 202, `Expected stopped-resume probe to succeed before cleanup window expires. Got ${restartResponse.status}: ${truncate(restartText)}`);
      expect(restart?.buildId === build?.buildId, 'Expected stopped resume window to reuse the same buildId instead of spawning a duplicate parallel build.');
      expect(restart?.status === 'stopped', `Expected stopped resume window to preserve stopped status until cleanup window expires. Got: ${String(restart?.status)}`);
    });
  } finally {
    await deleteSession(session.id);
  }
}

async function test_omx_start_route_starts_fresh_build_after_stopped_build_is_persisted() {
  const session = await createReadySession();
  try {
    await withOmxServer(async (baseUrl) => {
      const buildResponse = await fetch(`${baseUrl}/api/omx/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const buildText = await buildResponse.text();
      const build = safeJson(buildText) as OmxBuildStartResponse | null;
      expect(buildResponse.status === 202, `Expected initial build start to succeed. Got ${buildResponse.status}: ${truncate(buildText)}`);

      const stopResponse = await fetch(`${baseUrl}/api/omx/stop/${session.id}`, { method: 'POST' });
      const stopText = await stopResponse.text();
      const stop = safeJson(stopText) as { status?: string; buildId?: string } | null;
      expect(stopResponse.status === 202, `Expected stop request to succeed before fresh restart probe. Got ${stopResponse.status}: ${truncate(stopText)}`);
      expect(stop?.status === 'stopping' || stop?.status === 'stopped', `Expected stop request to move build into stopping/stopped state. Got: ${String(stop?.status)}`);

      await new Promise((resolve) => setTimeout(resolve, 1800));

      const restartResponse = await fetch(`${baseUrl}/api/omx/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const restartText = await restartResponse.text();
      const restart = safeJson(restartText) as OmxBuildStartResponse | null;

      expect(restartResponse.status === 202, `Expected fresh restart after stopped persistence window to succeed. Got ${restartResponse.status}: ${truncate(restartText)}`);
      expect(typeof restart?.buildId === 'string' && restart.buildId.length > 0, 'Expected fresh restart to return a new buildId.');
      expect(restart?.buildId !== build?.buildId, 'Expected a fresh restart after stopped cleanup window to allocate a new buildId instead of reusing the stopped build.');
      expect(restart?.status === 'queued' || restart?.status === 'running', `Expected fresh restart after cleanup window to start a new queued/running build. Got: ${String(restart?.status)}`);
    });
  } finally {
    await deleteSession(session.id);
  }
}

async function test_omx_build_complete_exposes_specular_gate_approval_after_real_design_validation() {
  const session = await createReadySession();
  try {
    await withFakeCodex(async () => {
      await withOmxServer(async (baseUrl) => {
      const buildResponse = await fetch(`${baseUrl}/api/omx/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const buildText = await buildResponse.text();
      const build = safeJson(buildText) as OmxBuildStartResponse | null;

      expect(
        buildResponse.status === 202,
        `Expected POST /api/omx/build to succeed before verifying completion metadata. Got ${buildResponse.status}: ${truncate(buildText)}`,
      );
      expect(typeof build?.buildId === 'string' && build.buildId.length > 0, 'Expected build route to provide a buildId before validating completion metadata.');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      let streamResponse: Response | null = null;
      try {
        streamResponse = await fetch(`${baseUrl}/api/omx/stream/${session.id}`, {
          headers: { Accept: 'text/event-stream' },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      expect(streamResponse?.status === 200, `Expected GET /api/omx/stream/:sessionId to attach to the active build before completion metadata validation. Got ${streamResponse?.status}.`);

      const reader = streamResponse?.body?.getReader();
      expect(reader, 'Expected OMX stream response to expose a readable body while waiting for build_complete metadata.');
      const decoder = new TextDecoder();
      let buffer = '';
      const deadline = Date.now() + 8000;
      let completionPayload: Record<string, unknown> | null = null;

      while (Date.now() < deadline && !completionPayload) {
        const chunk = await reader!.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const dataLines = buffer.match(/^data: .+$/gm) || [];
        for (const line of dataLines) {
          const payload = safeJson(line.slice(6)) as Record<string, unknown> | null;
          if (!payload || payload.buildId !== build?.buildId) continue;
          if (payload.type === 'build_complete') {
            completionPayload = payload;
            break;
          }
        }
      }

      await reader?.cancel().catch(() => {});

      expect(
        completionPayload,
        `Expected OMX stream to emit a build_complete event for build ${build?.buildId}. Got: ${truncate(buffer)}`,
      );
      expect(
        typeof completionPayload?.specular === 'object',
        `Expected build_complete to expose SPECULAR gate metadata after real design validation. Got: ${truncate(JSON.stringify(completionPayload))}`,
      );
      expect(
        (completionPayload?.specular as Record<string, unknown> | undefined)?.gateApproved === true,
        `Expected successful real build to report specular.gateApproved=true. Got: ${truncate(JSON.stringify(completionPayload))}`,
      );
});
    });
  } finally {
    await deleteSession(session.id);
  }
}

async function test_omx_status_route_persists_terminal_recovery_summary_after_success() {
  const session = await createReadySession();
  try {
    await withFakeCodex(async () => {
      await withOmxServer(async (baseUrl) => {
        const buildResponse = await fetch(`${baseUrl}/api/omx/build`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id }),
        });
        const buildText = await buildResponse.text();
        expect(buildResponse.status === 202, `Expected build start to succeed before terminal recovery inspection. Got ${buildResponse.status}: ${truncate(buildText)}`);

        const deadline = Date.now() + 8000;
        let terminalStatus: OmxStatusResponse | null = null;
        while (Date.now() < deadline) {
          const statusResponse = await fetch(`${baseUrl}/api/omx/status/${session.id}`);
          const statusText = await statusResponse.text();
          const status = safeJson(statusText) as OmxStatusResponse | null;
          if (status?.status === 'succeeded') {
            terminalStatus = status;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 150));
        }

        expect(terminalStatus, 'Expected OMX status polling to eventually surface succeeded terminal state.');
        expect(terminalStatus?.result?.totalFiles && terminalStatus.result.totalFiles > 0, `Expected succeeded OMX status to persist real terminal file counts. Got: ${truncate(JSON.stringify(terminalStatus))}`);
        expect(typeof terminalStatus?.result?.totalLines === 'number' && terminalStatus.result.totalLines > 0, `Expected succeeded OMX status to persist real terminal line counts. Got: ${truncate(JSON.stringify(terminalStatus))}`);
        expect(typeof terminalStatus?.result?.elapsedMs === 'number' && terminalStatus.result.elapsedMs >= 0, `Expected succeeded OMX status to persist elapsedMs. Got: ${truncate(JSON.stringify(terminalStatus))}`);
        expect(terminalStatus?.completedNodes === terminalStatus?.totalNodes, `Expected succeeded OMX status to report all nodes completed. Got: ${truncate(JSON.stringify(terminalStatus))}`);
        expect(terminalStatus?.buildProgress === 100, `Expected succeeded OMX status to report 100% buildProgress. Got: ${truncate(JSON.stringify(terminalStatus))}`);
        expect(terminalStatus?.nodeStates?.['api-core'] === 'complete', `Expected succeeded OMX status to preserve nodeStates for builder reentry. Got: ${truncate(JSON.stringify(terminalStatus))}`);
        expect(terminalStatus?.designGateStatus === 'passed', `Expected succeeded OMX status to persist a passed design gate. Got: ${truncate(JSON.stringify(terminalStatus))}`);
        expect(typeof terminalStatus?.designScore === 'number', `Expected succeeded OMX status to persist designScore. Got: ${truncate(JSON.stringify(terminalStatus))}`);
        expect(terminalStatus?.result?.systemVerify?.status === 'passed', `Expected OMX status to surface passed final system verify truth. Got: ${truncate(JSON.stringify(terminalStatus))}`);
        expect(terminalStatus?.result?.systemVerify?.command === 'npm run smoke', `Expected terminal system verify to prefer the generated root smoke wrapper. Got: ${truncate(JSON.stringify(terminalStatus))}`);
        expect(String(terminalStatus?.result?.systemVerify?.summary || '').includes('ready'), `Expected terminal system verify summary to include runtime readiness evidence. Got: ${truncate(JSON.stringify(terminalStatus))}`);
      });
    });
  } finally {
    await deleteSession(session.id);
  }
}

async function test_omx_status_route_persists_terminal_message_after_stop() {
  const session = await createReadySession();
  try {
    await withOmxServer(async (baseUrl) => {
      const buildResponse = await fetch(`${baseUrl}/api/omx/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const buildText = await buildResponse.text();
      expect(buildResponse.status === 202, `Expected build start to succeed before stop recovery inspection. Got ${buildResponse.status}: ${truncate(buildText)}`);

      const stopResponse = await fetch(`${baseUrl}/api/omx/stop/${session.id}`, { method: 'POST' });
      const stopText = await stopResponse.text();
      expect(stopResponse.status === 202, `Expected stop request to succeed before terminal message inspection. Got ${stopResponse.status}: ${truncate(stopText)}`);

      const deadline = Date.now() + 4000;
      let terminalStatus: OmxStatusResponse | null = null;
      while (Date.now() < deadline) {
        const statusResponse = await fetch(`${baseUrl}/api/omx/status/${session.id}`);
        const statusText = await statusResponse.text();
        const status = safeJson(statusText) as OmxStatusResponse | null;
        if (status?.status === 'stopped') {
          terminalStatus = status;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      expect(terminalStatus?.status === 'stopped', `Expected OMX status polling to surface stopped terminal state. Got: ${truncate(JSON.stringify(terminalStatus))}`);
      const wavesTotal = terminalStatus?.wavesTotal;
      expect(terminalStatus?.resumeAvailable === true && terminalStatus?.resumeReason === 'stopped', `Expected stopped OMX status to preserve resume availability for parallel-wave recovery. Got: ${truncate(JSON.stringify(terminalStatus))}`);
      expect(typeof terminalStatus?.terminalMessage === 'string' && /stopped/i.test(terminalStatus.terminalMessage), `Expected stopped OMX status to preserve a terminalMessage for builder reentry diagnostics. Got: ${truncate(JSON.stringify(terminalStatus))}`);
      expect(typeof wavesTotal === 'number' && wavesTotal >= 1, `Expected stopped OMX status to preserve parallel wave totals for builder reentry diagnostics. Got: ${truncate(JSON.stringify(terminalStatus))}`);
    });
  } finally {
    await deleteSession(session.id);
  }
}

async function test_omx_history_route_returns_persisted_build_events() {
  const session = await createReadySession();
  try {
    await withFakeCodex(async () => {
      await withOmxServer(async (baseUrl) => {
        const buildResponse = await fetch(`${baseUrl}/api/omx/build`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id }),
        });
        const buildText = await buildResponse.text();
        expect(buildResponse.status === 202, `Expected build start to succeed before history inspection. Got ${buildResponse.status}: ${truncate(buildText)}`);

        const deadline = Date.now() + 8000;
        let historyPayload: { events?: Array<Record<string, unknown>> } | null = null;
        while (Date.now() < deadline) {
          const historyResponse = await fetch(`${baseUrl}/api/omx/history/${session.id}`);
          const historyText = await historyResponse.text();
          const history = safeJson(historyText) as { events?: Array<Record<string, unknown>> } | null;
          if (Array.isArray(history?.events) && history.events.some((event) => event.type === 'build_complete')) {
            historyPayload = history;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 150));
        }

        expect(historyPayload?.events && historyPayload.events.length > 0, 'Expected OMX history route to return persisted build events.');
        expect(historyPayload?.events?.some((event) => event.type === 'build_start'), 'Expected OMX history to include build_start.');
        expect(historyPayload?.events?.some((event) => event.type === 'build_complete'), 'Expected OMX history to include build_complete.');
      });
    });
  } finally {
    await deleteSession(session.id);
  }
}

async function run() {
  const tests = [
    test_omx_build_route_prefers_explicit_session_draft_when_provided,
    test_omx_build_route_rejects_real_builds_when_codex_transport_is_unavailable,
    test_omx_build_route_returns_real_runtime_contract,
    test_omx_build_route_blocks_when_design_gate_fails,
    test_omx_build_route_treats_design_gate_block_as_controlled_warning_not_runtime_error,
    test_omx_status_route_reports_idle_runtime_before_build_start,
    test_omx_status_route_reflects_active_build_after_explicit_start,
    test_omx_stop_route_rejects_stop_requests_without_active_build,
    test_omx_stop_route_stops_active_build,
    test_omx_stream_requires_explicit_build_start_and_never_autostarts_simulation,
    test_omx_stream_emits_real_build_identity_after_explicit_build_start,
    test_omx_start_route_reuses_stopping_build_identity_without_downgrading_status,
    test_omx_start_route_reuses_stopped_parallel_build_identity_before_cleanup_window_expires,
    test_omx_start_route_starts_fresh_build_after_stopped_build_is_persisted,
    test_omx_build_complete_exposes_specular_gate_approval_after_real_design_validation,
    test_omx_status_route_persists_terminal_recovery_summary_after_success,
    test_omx_status_route_persists_terminal_message_after_stop,
    test_omx_history_route_returns_persisted_build_events,
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test();
      console.log(`PASS ${test.name}`);
      passed += 1;
    } catch (error) {
      console.error(`FAIL ${test.name}`);
      console.error(error instanceof Error ? error.message : String(error));
      failed += 1;
    }
  }

  console.log(`\n${passed}/${tests.length} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

run();
