#!/usr/bin/env tsx
/**
 * KOMPLETUS E2E Mirror Test
 *
 * LAW: This test uses the EXACT same SSE parser as the browser UIX (src/lib/api.ts).
 *      If this test passes, the UIX WILL work. If this test fails, the UIX WILL fail.
 *      There is NO drift allowed between under-the-hood tests and user-facing behavior.
 *
 * Usage:  npx tsx tests/kompletus-e2e.ts "your prompt here"
 *         npx tsx tests/kompletus-e2e.ts   (uses default prompt)
 */

const BASE = 'http://localhost:7777';
const PROMPT = process.argv[2] || 'Simple task manager with auth and notifications';
const TIMEOUT_MS = 600_000; // 10 min max

// ─── Types (mirror of src/lib/api.ts) ──────────────────────────────────

interface KompletusEvent {
  stage: string;
  status: 'running' | 'done' | 'error';
  message?: string;
  data?: Record<string, unknown>;
}

interface KompletusResult {
  graph: { nodes: Array<Record<string, unknown>>; links: Array<Record<string, unknown>> };
  manifesto: string;
  architecture: string;
  explanation: string;
  research: Record<string, { report: string; meta: Record<string, unknown> }>;
  specular: {
    moments: Array<{ id: string; label: string; backendStages: string[]; userQuestion: string }>;
    coverage: Array<{ backendPhase: string; momentId: string; momentLabel: string; confidence: number }>;
    nodeScreenMap: Array<{ nodeId: string; label: string; hasUserSurface: boolean; screenType?: string; userActions?: string[]; dataDisplayed?: string[] }>;
    parityScore: number;
  };
  specularCreate: {
    designProfile: '21st';
    artifacts: Array<{
      nodeId: string;
      selectedVariantId: string;
      previewArtifact: {
        kind: 'tsx';
        tsx: string;
        blocks: Array<{ id: string; kind: string; title: string }>;
      };
      designVerdict: {
        status: 'pending' | 'passed' | 'failed';
        score: number;
        findings: string[];
        evidence: string[];
      };
    }>;
    gate: {
      designProfile: '21st';
      designGateStatus: 'pending' | 'passed' | 'failed';
      designScore: number;
      designFindings: string[];
      designEvidence: string[];
      affectedNodeIds: string[];
    };
    warnings: string[];
  };
  l1ght: {
    expandedContracts: number;
    crossNodeIssues: number;
    artifacts: { routeMap?: string; envTemplate?: string; dbSchema?: string };
  };
  qualityGate: { passed: boolean; iterations: number; remainingIssues: string[] };
  meta: {
    totalTimeMs: number;
    stages: Record<string, { durationMs: number; details?: Record<string, unknown> }>;
  };
}

// ─── MIRROR OF src/lib/api.ts runKompletus() ───────────────────────────
// This is a COPY of the browser's SSE parser. Any change to api.ts MUST
// be reflected here. If they diverge, this test is worthless.

async function runKompletusMirror(
  prompt: string,
  onProgress: (event: KompletusEvent) => void,
): Promise<KompletusResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE}/api/ai/kompletus`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body}`);
    }

    return new Promise((resolve, reject) => {
      const reader = res.body?.getReader();
      if (!reader) return reject(new Error('No response body'));

      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult: KompletusResult | null = null;
      let lastError: string | null = null;
      // CRITICAL: eventType must persist across chunk boundaries
      let eventType = '';

      function processLines(text: string) {
        buffer += text;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.substring(7).trim();
          } else if (line.startsWith('data: ') && eventType) {
            const raw = line.substring(6);
            try {
              const data = JSON.parse(raw);
              if (eventType === 'progress') {
                onProgress(data as KompletusEvent);
              } else if (eventType === 'result') {
                finalResult = data as KompletusResult;
              } else if (eventType === 'error') {
                lastError = data.error || 'Pipeline error';
              }
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : 'parse error';
              console.error(`[MIRROR] ❌ Failed to parse ${eventType} (${raw.length} chars): ${msg}`);
              if (eventType === 'result') {
                lastError = `Result JSON parse failed (${raw.length} chars): ${msg}`;
              }
            }
            eventType = '';
          } else if (line === '') {
            eventType = '';
          }
        }
      }

      async function pump() {
        try {
          while (true) {
            const { done, value } = await reader!.read();
            if (done) break;
            processLines(decoder.decode(value, { stream: true }));
          }
          // Flush remaining buffer — reset first to prevent doubling
          if (buffer.trim()) {
            const remaining = buffer;
            buffer = '';
            processLines(remaining + '\n');
          }
          if (lastError && !finalResult) {
            reject(new Error(lastError));
          } else if (finalResult) {
            resolve(finalResult);
          } else {
            reject(new Error('Pipeline stream ended without result event'));
          }
        } catch (e) {
          reject(e);
        }
      }

      pump();
    });
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Test Runner ────────────────────────────────────────────────────────

async function main() {
  console.log('╭────────────────────────────────────────────────────────╮');
  console.log('│  KOMPLETUS E2E Mirror Test                            │');
  console.log('│  Uses EXACT same SSE parser as browser UIX            │');
  console.log('╰────────────────────────────────────────────────────────╯');
  console.log();
  console.log(`Prompt: "${PROMPT}"`);
  console.log(`Server: ${BASE}`);
  console.log();

  const progressEvents: KompletusEvent[] = [];
  const startTime = Date.now();
  let lastStage = '';

  try {
    const result = await runKompletusMirror(PROMPT, (event) => {
      progressEvents.push(event);
      const stageChanged = event.stage !== lastStage;
      lastStage = event.stage;
      const icon = event.status === 'done' ? '✅' : event.status === 'error' ? '❌' : '⏳';
      if (stageChanged || event.status !== 'running') {
        console.log(`  ${icon} [${event.stage}] ${event.message || event.status}`);
      }
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // ── Assertions ──
    const failures: string[] = [];

    if (!result.graph) failures.push('Missing graph');
    if (!result.graph?.nodes?.length) failures.push('No nodes in graph');
    if (!result.graph?.links?.length) failures.push('No links in graph');
    if (!result.manifesto) failures.push('Missing manifesto');
    if (!result.architecture) failures.push('Missing architecture');
    if (!result.qualityGate) failures.push('Missing qualityGate');
    if (!result.meta?.totalTimeMs) failures.push('Missing timing meta');
    if (!result.l1ght) failures.push('Missing l1ght data');

    // SPECULAR assertions
    if (!result.specular) failures.push('Missing specular data');
    if (result.specular) {
      if (!result.specular.moments?.length) failures.push('SPECULAR: no user moments');
      if (result.specular.moments?.length > 5) failures.push(`SPECULAR: too many moments (${result.specular.moments.length} > 5, PARSIMÔNIA violation)`);
      if (typeof result.specular.parityScore !== 'number') failures.push('SPECULAR: missing parityScore');
      if (result.specular.parityScore < 0 || result.specular.parityScore > 100) failures.push(`SPECULAR: parityScore out of range (${result.specular.parityScore})`);
      if (!result.specular.nodeScreenMap?.length) failures.push('SPECULAR: no nodeScreenMap entries');
      if (!result.specular.coverage?.length) failures.push('SPECULAR: no coverage entries');

      // Verify frontend nodes have screens
      const frontendNodes = result.graph.nodes.filter((n: any) => ['frontend', 'external'].includes(n.type));
      for (const fn of frontendNodes) {
        const screenEntry = result.specular.nodeScreenMap.find(e => e.nodeId === (fn as any).id);
        if (screenEntry && !screenEntry.hasUserSurface) {
          failures.push(`SPECULAR: frontend node ${(fn as any).label} marked as no user surface`);
        }
      }
    }

    if (!result.specularCreate) failures.push('Missing specularCreate data');
    if (result.specularCreate) {
      if (result.specularCreate.designProfile !== '21st') failures.push(`SPECULAR CREATE: wrong design profile (${result.specularCreate.designProfile})`);
      if (!Array.isArray(result.specularCreate.artifacts)) failures.push('SPECULAR CREATE: artifacts missing');
      if (!result.specularCreate.gate) failures.push('SPECULAR CREATE: gate missing');
      if (result.specularCreate.gate && (result.specularCreate.gate.designScore < 0 || result.specularCreate.gate.designScore > 100)) {
        failures.push(`SPECULAR CREATE: designScore out of range (${result.specularCreate.gate.designScore})`);
      }

      const userFacingIds = new Set(
        result.specular.nodeScreenMap.filter((entry) => entry.hasUserSurface).map((entry) => entry.nodeId),
      );
      for (const artifact of result.specularCreate.artifacts || []) {
        if (!userFacingIds.has(artifact.nodeId)) {
          failures.push(`SPECULAR CREATE: artifact generated for non user-facing node ${artifact.nodeId}`);
        }
        if (artifact.previewArtifact?.kind !== 'tsx') {
          failures.push(`SPECULAR CREATE: artifact ${artifact.nodeId} is not tsx-backed`);
        }
        if (!artifact.previewArtifact?.tsx) {
          failures.push(`SPECULAR CREATE: artifact ${artifact.nodeId} missing tsx`);
        }
        if (!artifact.previewArtifact?.blocks?.length) {
          failures.push(`SPECULAR CREATE: artifact ${artifact.nodeId} missing blocks`);
        }
        if (typeof artifact.designVerdict?.score !== 'number') {
          failures.push(`SPECULAR CREATE: artifact ${artifact.nodeId} missing design verdict score`);
        }
      }
    }

    // Per-node checks
    for (const node of result.graph.nodes) {
      const n = node as Record<string, unknown>;
      if (!n.id) failures.push(`Node missing id: ${JSON.stringify(n).substring(0, 80)}`);
      if (!n.label) failures.push(`Node missing label: ${n.id}`);
      if (!n.type) failures.push(`Node missing type: ${n.id}`);
      const dc = (n.data_contract as string) || '';
      if (dc.length < 10) failures.push(`Node ${n.id}: data_contract too short (${dc.length}c)`);
      const ac = (n.acceptance_criteria as string[]) || [];
      if (ac.length === 0) failures.push(`Node ${n.id}: no acceptance_criteria`);
      const eh = (n.error_handling as string[]) || [];
      if (eh.length === 0) failures.push(`Node ${n.id}: no error_handling`);
    }

    // Report
    console.log();
    console.log('╭────────────────────────────────────────────────────────╮');
    console.log('│  RESULTS                                              │');
    console.log('╰────────────────────────────────────────────────────────╯');
    console.log();
    console.log(`  Nodes:           ${result.graph.nodes.length}`);
    console.log(`  Links:           ${result.graph.links.length}`);
    console.log(`  Research:        ${Object.keys(result.research).length} modules`);
    console.log(`  L1GHT expanded:  ${result.l1ght.expandedContracts}`);
    console.log(`  Cross issues:    ${result.l1ght.crossNodeIssues}`);
    console.log(`  RouteMap:        ${result.l1ght.artifacts.routeMap ? 'yes' : 'no'}`);
    console.log(`  EnvTemplate:     ${result.l1ght.artifacts.envTemplate ? 'yes' : 'no'}`);
    console.log(`  DbSchema:        ${result.l1ght.artifacts.dbSchema ? 'yes' : 'no'}`);
    console.log(`  QG passed:       ${result.qualityGate.passed}`);
    console.log(`  QG iterations:   ${result.qualityGate.iterations}`);
    console.log(`  Total time:      ${elapsed}s`);
    console.log(`  Progress events: ${progressEvents.length}`);

    // SPECULAR report
    if (result.specular) {
      console.log();
      console.log('  🪞 SPECULAR AUDIT:');
      console.log(`  Parity score:    ${result.specular.parityScore}%`);
      console.log(`  User moments:    ${result.specular.moments.length}`);
      console.log(`  Screen nodes:    ${result.specular.nodeScreenMap.filter(n => n.hasUserSurface).length}`);
      console.log(`  Coverage:        ${result.specular.coverage.length} mappings`);
      for (const moment of result.specular.moments) {
        console.log(`    ${moment.id}: "${moment.label}" ← [${moment.backendStages.join(', ')}]`);
      }
    }

    if (result.specularCreate) {
      console.log();
      console.log('  ✨ SPECULAR CREATE:');
      console.log(`  Design gate:     ${result.specularCreate.gate.designGateStatus} (${result.specularCreate.gate.designScore}%)`);
      console.log(`  Artifacts:       ${result.specularCreate.artifacts.length}`);
    }

    if (result.qualityGate.remainingIssues.length > 0) {
      console.log();
      console.log('  ⚠ Remaining QG issues:');
      for (const issue of result.qualityGate.remainingIssues) {
        console.log(`    - ${issue}`);
      }
    }

    console.log();
    console.log('  Nodes:');
    for (const node of result.graph.nodes) {
      const n = node as Record<string, unknown>;
      const dc = ((n.data_contract as string) || '').length;
      const ac = ((n.acceptance_criteria as string[]) || []).length;
      const eh = ((n.error_handling as string[]) || []).length;
      const res = n.researchContext ? '✓' : '✗';
      console.log(`    ${(n.label as string).padEnd(40)} ${(n.type as string).padEnd(12)} DC=${String(dc).padStart(4)}c AC=${ac} EH=${eh} Res=${res}`);
    }

    console.log();
    if (failures.length === 0) {
      console.log('  ✅ ALL ASSERTIONS PASSED (including SPECULAR)');
      console.log();
      console.log('  This EXACTLY mirrors what the browser UIX will receive.');
      console.log('  If this passes, the UIX WILL work. Zero drift guaranteed.');
      process.exit(0);
    } else {
      console.log(`  ❌ ${failures.length} ASSERTION(S) FAILED:`);
      for (const f of failures) {
        console.log(`    - ${f}`);
      }
      process.exit(1);
    }
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error();
    console.error(`  ❌ PIPELINE FAILED after ${elapsed}s`);
    console.error(`  Error: ${error instanceof Error ? error.message : String(error)}`);
    console.error();
    console.error('  Progress received before failure:');
    for (const e of progressEvents) {
      console.error(`    [${e.stage}] ${e.status}: ${e.message || ''}`);
    }
    process.exit(1);
  }
}

main();
