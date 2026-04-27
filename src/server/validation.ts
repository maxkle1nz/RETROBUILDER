/**
 * Zod schemas for validating AI responses.
 * Ensures malformed LLM output doesn't crash the app.
 */

import { z } from 'zod';
import { enforceDAGInvariants, breakCycles } from './graph-integrity.js';
import { extractJSONCandidates } from './ai-helpers.js';

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

const SpecularReferenceCandidateSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  rationale: z.string(),
  tags: z.array(z.string()).default([]),
  source: z.enum(['21st-local', '21st-catalog', 'retrobuilder-vanguard']),
  componentKey: z.string().optional(),
  author: z.string().optional(),
  componentUrl: z.string().optional(),
  promptUrl: z.string().optional(),
  previewUrl: z.string().optional(),
  localPath: z.string().optional(),
  promptPath: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  importSources: z.array(z.string()).optional(),
  patternId: z.string().optional(),
  sourcePromptName: z.string().optional(),
  stackAdapters: z.record(z.string(), z.array(z.string())).optional(),
  implementationNotes: z.array(z.string()).optional(),
  mobileRules: z.array(z.string()).optional(),
  tasteScore: z.number().optional(),
});

const SpecularPreviewBlockSchema = z.object({
  id: z.string(),
  kind: z.enum(['hero', 'metrics', 'list', 'detail', 'activity', 'cta']),
  title: z.string(),
  eyebrow: z.string().optional(),
  body: z.string().optional(),
  items: z.array(z.string()).optional(),
});

const SpecularPreviewArtifactSchema = z.object({
  kind: z.literal('tsx'),
  componentName: z.string(),
  screenType: z.enum(['dashboard', 'form', 'list', 'detail', 'chat', 'wizard', 'landing']),
  summary: z.string(),
  blocks: z.array(SpecularPreviewBlockSchema).default([]),
  tsx: z.string(),
});

const SpecularPreviewStateSchema = z.object({
  density: z.enum(['comfortable', 'compact']).default('comfortable'),
  emphasis: z.enum(['editorial', 'product', 'dashboard']).default('product'),
});

const SpecularDesignVerdictSchema = z.object({
  status: z.enum(['pending', 'passed', 'failed']),
  score: z.number().min(0).max(100),
  findings: z.array(z.string()).default([]),
  evidence: z.array(z.string()).default([]),
});

const ActiveProductDnaContractSchema = z.object({
  contractVersion: z.literal('active-product-dna-contract@1'),
  generatedAt: z.string(),
  node: z.object({
    id: z.string(),
    type: z.string().optional(),
    screenType: z.string().optional(),
    intent: z.string().optional(),
  }),
  packBindings: z.array(z.object({
    id: z.string(),
    version: z.string(),
    family: z.enum(['design', 'domain', 'stack', 'game', 'asset', 'capability', 'quality']),
    title: z.string(),
  })).default([]),
  promptDirectives: z.array(z.string()).default([]),
  requiredElements: z.array(z.string()).default([]),
  forbiddenPatterns: z.array(z.string()).default([]),
  allowedSubstitutions: z.array(z.string()).default([]),
  stackHints: z.array(z.string()).default([]),
  validators: z.array(z.object({
    packId: z.string(),
    id: z.string(),
    severity: z.enum(['info', 'warn', 'fail']),
    description: z.string(),
    evidence: z.string(),
  })).default([]),
  receipts: z.object({
    required: z.array(z.string()).default([]),
    optional: z.array(z.string()).default([]),
  }),
  provenance: z.array(z.object({
    packId: z.string(),
    capturedAt: z.string(),
    sourceType: z.enum(['sidecar-research', 'manual-curation', 'internal-code', 'imported-docs']),
    sourceUrls: z.array(z.string()).default([]),
  })).default([]),
});

const SpecularVariantCandidateSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  flavor: z.enum(['editorial', 'control', 'conversational']),
  screenType: z.enum(['dashboard', 'form', 'list', 'detail', 'chat', 'wizard', 'landing']),
  referenceIds: z.array(z.string()).default([]),
  previewArtifact: SpecularPreviewArtifactSchema,
  designVerdict: SpecularDesignVerdictSchema,
});

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
  designProfile: z.literal('21st').optional(),
  referenceCandidates: z.array(SpecularReferenceCandidateSchema).optional(),
  selectedReferenceIds: z.array(z.string()).optional(),
  selectedProductDnaPackIds: z.array(z.string()).optional(),
  activeProductDnaContract: ActiveProductDnaContractSchema.optional(),
  variantCandidates: z.array(SpecularVariantCandidateSchema).optional(),
  selectedVariantId: z.string().optional(),
  previewArtifact: SpecularPreviewArtifactSchema.optional(),
  previewState: SpecularPreviewStateSchema.optional(),
  designVerdict: SpecularDesignVerdictSchema.optional(),
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
  archived: z.boolean().default(false),
  manifesto: stringish.default(''),
  architecture: stringish.default(''),
  graph: GraphDataSchema,
  projectContext: z.string().default(''),
  importMeta: CodebaseImportMetaSchema.optional(),
});

export const SessionPatchSchema = z.object({
  name: z.string().optional(),
  source: SessionSourceSchema.optional(),
  archived: z.boolean().optional(),
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

function stripTrailingJsonCommas(raw: string): string {
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

    if (!inString && ch === ',') {
      let next = i + 1;
      while (next < raw.length && /\s/.test(raw[next])) next++;
      if (raw[next] === '}' || raw[next] === ']') {
        continue;
      }
    }

    result += ch;
  }

  return result;
}

function jsonCandidateVariants(candidate: string): string[] {
  const trimmed = candidate.trim();
  const sanitized = sanitizeJsonStrings(trimmed);
  return [
    trimmed,
    sanitized,
    stripTrailingJsonCommas(trimmed),
    stripTrailingJsonCommas(sanitized),
  ];
}

function buildJsonParseCandidates(rawJson: string): string[] {
  const candidates = [rawJson.trim(), ...extractJSONCandidates(rawJson)];
  const start = rawJson.indexOf('{');
  const end = rawJson.lastIndexOf('}');

  if (start !== -1 && end > start) {
    candidates.push(rawJson.substring(start, end + 1));
  }

  return [
    ...new Set(
      candidates
        .flatMap(jsonCandidateVariants)
        .map((candidate) => candidate.trim())
        .filter(Boolean),
    ),
  ];
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
  let lastParseError: unknown;
  let lastSchemaError: z.ZodError | undefined;

  for (const candidate of buildJsonParseCandidates(rawJson)) {
    try {
      const parsed = JSON.parse(candidate);
      const validated = schema.safeParse(parsed);
      if (validated.success) return validated.data;
      lastSchemaError = validated.error;
    } catch (error) {
      lastParseError = error;
    }
  }

  if (lastSchemaError) {
    const issues = lastSchemaError.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`[Validation] ${endpoint}: AI response failed schema validation — ${issues}`);
  }

  if (process.env.RETROBUILDER_DEBUG_AI_JSON === '1') {
    const parseMessage = lastParseError instanceof Error ? lastParseError.message : 'unknown parse error';
    console.warn(`[Validation] ${endpoint}: raw AI JSON parse failure sample: ${rawJson.slice(0, 1200)}`);
    console.warn(`[Validation] ${endpoint}: last JSON parse error: ${parseMessage}`);
  }

  throw new Error(`[Validation] ${endpoint}: Failed to parse AI response as JSON`);
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
