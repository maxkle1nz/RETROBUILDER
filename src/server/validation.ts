/**
 * Zod schemas for validating AI responses.
 * Ensures malformed LLM output doesn't crash the app.
 */

import { z } from 'zod';
import { enforceDAGInvariants, breakCycles } from './graph-integrity.js';

const stringArrayish = z.union([z.array(z.string()), z.string()]).transform((value) => {
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean);
  return value
    .split(/\n|;|•|-/)
    .map((item) => item.trim())
    .filter(Boolean);
});

const stringish = z.union([z.string(), z.record(z.string(), z.any())]).transform((value) => {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
});

const safeNumber = z.preprocess((value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}, z.number().optional());

// ─── Node & Link Schemas ─────────────────────────────────────────────

export const NodeDataSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().default(''),
  status: z.string().default('pending').transform(s => {
    const valid = ['pending', 'in-progress', 'completed'];
    return valid.includes(s) ? s : 'pending';
  }),
  type: z.string().default('backend').transform(t => {
    const known = ['frontend', 'backend', 'database', 'external', 'security'];
    if (known.includes(t)) return t;
    // Map common LLM variants to nearest known type
    const map: Record<string, string> = {
      'service': 'backend', 'api': 'backend', 'server': 'backend',
      'infrastructure': 'external', 'monitoring': 'external', 'observability': 'external',
      'messaging': 'external', 'queue': 'external', 'cache': 'database',
      'storage': 'database', 'auth': 'security', 'gateway': 'backend',
    };
    return map[t] || 'backend';
  }),
  data_contract: stringish.optional(),
  decision_rationale: stringish.optional(),
  acceptance_criteria: stringArrayish.optional(),
  error_handling: stringArrayish.optional(),
  priority: safeNumber,
  group: safeNumber.default(0),
  researchContext: z.string().optional(),
  constructionNotes: z.string().optional(),
});

export const LinkDataSchema = z.object({
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
});

export const GraphDataSchema = z.object({
  nodes: z.array(NodeDataSchema).default([]),
  links: z.array(LinkDataSchema).default([]),
});

export const SessionSourceSchema = z.enum(['manual', 'imported_codebase']);

export const CodebaseImportMetaSchema = z.object({
  sourcePath: z.string(),
  importedAt: z.string(),
  confidence: z.number(),
  notes: z.array(z.string()).default([]),
  summary: z.string().optional(),
  sourceStats: z.object({
    totalFiles: z.number().optional(),
    totalLoc: z.number().optional(),
    topFiles: z.array(z.string()).optional(),
  }).optional(),
});

export const SessionDocumentSchema = z.object({
  id: z.string(),
  name: z.string(),
  source: SessionSourceSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  manifesto: stringish.default(''),
  architecture: stringish.default(''),
  graph: GraphDataSchema,
  projectContext: z.string().default(''),
  importMeta: CodebaseImportMetaSchema.optional(),
});

export const SessionPatchSchema = z.object({
  name: z.string().optional(),
  source: SessionSourceSchema.optional(),
  manifesto: stringish.optional(),
  architecture: stringish.optional(),
  graph: GraphDataSchema.optional(),
  projectContext: z.string().optional(),
  importMeta: CodebaseImportMetaSchema.optional(),
});

// ─── Endpoint-specific Response Schemas ──────────────────────────────

export const SystemStateSchema = z.object({
  manifesto: stringish.default(''),
  architecture: stringish.default(''),
  graph: GraphDataSchema,
  explanation: z.string().optional().default(''),
});

export const AnalysisResultSchema = z.object({
  isGood: z.boolean(),
  critique: z.string().default('No critique provided.'),
  optimizedGraph: GraphDataSchema.optional(),
});

// ─── Safe Parsing Helper ─────────────────────────────────────────────

/**
 * Escape raw newlines/tabs ONLY inside JSON string values.
 * Leaves structural JSON whitespace intact.
 */
function sanitizeJsonStrings(raw: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    
    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }
    
    if (ch === '\\' && inString) {
      result += ch;
      escaped = true;
      continue;
    }
    
    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }
    
    if (inString) {
      if (ch === '\n') { result += '\\n'; continue; }
      if (ch === '\r') { result += '\\r'; continue; }
      if (ch === '\t') { result += '\\t'; continue; }
      if (ch.charCodeAt(0) < 0x20 && ch !== '\n' && ch !== '\r' && ch !== '\t') {
        continue;
      }
    }
    
    result += ch;
  }
  return result;
}

/**
 * Safely parse + validate AI response JSON with a Zod schema.
 * Returns a typed result or throws a descriptive error.
 */
export function validateAIResponse<T>(
  rawJson: string,
  schema: z.ZodType<T>,
  endpoint: string
): T {
  try {
    let parsed: any;
    
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      try {
        parsed = JSON.parse(sanitizeJsonStrings(rawJson));
      } catch {
        const start = rawJson.indexOf('{');
        const end = rawJson.lastIndexOf('}');
        if (start !== -1 && end > start) {
          const extracted = rawJson.substring(start, end + 1);
          parsed = JSON.parse(sanitizeJsonStrings(extracted));
        } else {
          throw new Error('No JSON object found');
        }
      }
    }
    
    return schema.parse(parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`[Validation] ${endpoint}: AI response failed schema validation — ${issues}`);
    }
    throw new Error(`[Validation] ${endpoint}: Failed to parse AI response as JSON`);
  }
}

// ─── Graph Integrity Enforcement ─────────────────────────────────────

/**
 * Validate a graph's structural integrity after Zod schema validation.
 * Enforces DAG invariants: no cycles, no dangling links, priority consistency.
 * 
 * - Cycles → blocking error (rejects the graph) or auto-repair with allowCycleBreaking
 * - Dangling links → auto-repaired (stripped)
 * - Self-loops → auto-repaired (stripped)
 * - Priority inversions → warning (logged)
 * - Orphan nodes → warning (logged)
 * 
 * @returns The repaired graph (or original if no repair needed)
 * @throws Error if unrecoverable structural violations are found (cycles)
 */
export function validateGraphIntegrity(
  graph: { nodes: any[]; links: any[] },
  endpoint: string,
  options: { allowCycleBreaking?: boolean } = {},
): { nodes: any[]; links: any[] } {
  const report = enforceDAGInvariants(graph.nodes, graph.links, { autoRepair: true });

  // Log warnings (non-blocking)
  for (const w of report.warnings) {
    console.warn(`[Integrity] ${endpoint}: ⚠ ${w.code} — ${w.message}`);
  }

  // Handle cycles
  if (report.stats.cycleCount > 0) {
    if (options.allowCycleBreaking) {
      console.warn(`[Integrity] ${endpoint}: 🔄 Attempting to break ${report.stats.cycleCount} cycle(s)...`);
      const repaired = breakCycles(graph.nodes, report.repaired?.links ?? graph.links);
      console.warn(`[Integrity] ${endpoint}: ✂ Removed ${repaired.removed.length} edge(s) to break cycles: ${repaired.removed.map((r) => `${r.source}→${r.target}`).join(', ')}`);

      // Re-validate after repair
      const recheck = enforceDAGInvariants(graph.nodes, repaired.links, { autoRepair: true });
      if (recheck.stats.cycleCount > 0) {
        const cycleErrors = recheck.errors.filter((e) => e.code === 'CYCLE_DETECTED');
        throw new Error(
          `[Integrity] ${endpoint}: FATAL — Could not break all cycles. Remaining: ${cycleErrors.map((e) => e.message).join('; ')}`,
        );
      }

      return { nodes: graph.nodes, links: repaired.links };
    }

    // Strict mode: reject outright
    const cycleErrors = report.errors.filter((e) => e.code === 'CYCLE_DETECTED');
    throw new Error(
      `[Integrity] ${endpoint}: Graph contains circular dependencies — ${cycleErrors.map((e) => e.message).join('; ')}`,
    );
  }

  // Log success
  const { stats } = report;
  console.log(
    `[Integrity] ${endpoint}: ✓ DAG valid — ${stats.nodeCount} nodes, ${stats.linkCount} links, ${stats.connectedComponents} component(s)` +
      (stats.danglingLinkCount > 0 ? ` (${stats.danglingLinkCount} dangling links repaired)` : '') +
      (stats.orphanCount > 0 ? ` (${stats.orphanCount} orphan warnings)` : ''),
  );

  return report.repaired ?? graph;
}
