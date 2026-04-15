/**
 * Zod schemas for validating AI responses.
 * Ensures malformed LLM output doesn't crash the app.
 */

import { z } from 'zod';

// ─── Node & Link Schemas ─────────────────────────────────────────────

export const NodeDataSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().default(''),
  status: z.enum(['pending', 'in-progress', 'completed']).default('pending'),
  type: z.enum(['frontend', 'backend', 'database', 'external', 'security']).default('backend'),
  data_contract: z.string().optional(),
  decision_rationale: z.string().optional(),
  group: z.number().default(0),
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

// ─── Endpoint-specific Response Schemas ──────────────────────────────

export const SystemStateSchema = z.object({
  manifesto: z.string().default(''),
  architecture: z.string().default(''),
  graph: GraphDataSchema,
});

export const AnalysisResultSchema = z.object({
  isGood: z.boolean(),
  critique: z.string().default('No critique provided.'),
  optimizedGraph: GraphDataSchema.optional(),
});

// ─── Safe Parsing Helper ─────────────────────────────────────────────

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
    const parsed = JSON.parse(rawJson);
    return schema.parse(parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`[Validation] ${endpoint}: AI response failed schema validation — ${issues}`);
    }
    throw new Error(`[Validation] ${endpoint}: Failed to parse AI response as JSON`);
  }
}
