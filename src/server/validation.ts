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
  data_contract: z.string().optional(),
  decision_rationale: z.string().optional(),
  acceptance_criteria: z.array(z.string()).optional(),
  error_handling: z.array(z.string()).optional(),
  priority: z.number().optional(),
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
 * Escape raw newlines/tabs ONLY inside JSON string values.
 * Leaves structural JSON whitespace intact.
 */
function sanitizeJsonStrings(raw: string): string {
  // Walk through the string, track whether we're inside a JSON string value
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
    
    // Only sanitize control chars when inside a string value
    if (inString) {
      if (ch === '\n') { result += '\\n'; continue; }
      if (ch === '\r') { result += '\\r'; continue; }
      if (ch === '\t') { result += '\\t'; continue; }
      // Strip other rare control chars inside strings
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
    
    // 1. Direct parse (works when JSON is well-formed)
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      // 2. Smart sanitize: escape only newlines inside string values
      try {
        parsed = JSON.parse(sanitizeJsonStrings(rawJson));
      } catch {
        // 3. Last resort: extract JSON object boundaries and retry
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
