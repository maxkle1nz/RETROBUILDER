/**
 * L1GHT Pre-flight Protocol
 *
 * Validates and expands blueprint data before OMX materialization:
 * - Expand generic data contracts into concrete JSON schemas
 * - Cross-node contract validation (A's output matches B's input)
 * - Generate system artifacts (route map, env template, DB schema)
 */

import type { NodeData, LinkData } from '../lib/api.js';
import { chatCompletionWithFallback } from './provider-runtime.js';
import type { ChatMessage } from './providers/index.js';

// ─── Contract Expansion ────────────────────────────────────────────────

export async function expandContractsWithResearch(
  nodes: NodeData[],
  research: Record<string, { report: string; meta: Record<string, unknown> }>,
  model?: string,
): Promise<{ nodes: NodeData[]; expandedCount: number }> {
  // Find nodes with generic contracts that need expansion
  const needsExpansion = nodes.filter(n => {
    const dc = n.data_contract || '';
    return (
      dc.includes('object') ||
      dc.includes('...') ||
      dc.length < 30 ||
      !dc.includes('{')
    );
  });

  if (needsExpansion.length === 0) {
    return { nodes, expandedCount: 0 };
  }

  const nodeContexts = needsExpansion.map(n => {
    const nodeResearch = research[n.id]?.report?.substring(0, 500) || '';
    return `Node: ${n.label} (${n.type})
Description: ${n.description}
Current contract: ${n.data_contract}
Research excerpt: ${nodeResearch}
---`;
  }).join('\n');

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a contract expansion agent. Given system modules with generic data contracts, expand them into concrete, specific contracts with real field names and types.

Rules:
- Use actual field names relevant to the domain (not generic "data", "payload", "info")
- Include data types: string, number, boolean, ISO8601 date strings, enums
- For Brazilian systems: include CPF, CNPJ, BRL currency fields as appropriate
- Format: "Input: { field1: type, field2: type } → Output: { field1: type, field2: type }"

Return JSON array: [{ "nodeId": "...", "expandedContract": "..." }]
CRITICAL: Return ONLY valid JSON.`,
    },
    {
      role: 'user',
      content: `Expand these generic contracts into concrete ones:\n\n${nodeContexts}`,
    },
  ];

  try {
    const result = await chatCompletionWithFallback(messages, { jsonMode: true, model }, 'l1ght:expandContracts');
    const parsed = JSON.parse(result.content);
    const expansions = Array.isArray(parsed) ? parsed : parsed.expansions || parsed.contracts || [];

    const expansionMap = new Map<string, string>();
    for (const exp of expansions) {
      const id = exp.nodeId || exp.node_id || exp.id;
      if (id && exp.expandedContract) {
        expansionMap.set(id, exp.expandedContract);
      }
    }

    const expandedNodes = nodes.map(n => {
      const expanded = expansionMap.get(n.id);
      if (expanded) {
        return { ...n, data_contract: expanded };
      }
      return n;
    });

    console.log(`[L1GHT] Expanded ${expansionMap.size}/${needsExpansion.length} contracts`);
    return { nodes: expandedNodes, expandedCount: expansionMap.size };
  } catch (e: any) {
    console.warn(`[L1GHT] Contract expansion failed: ${e.message}`);
    return { nodes, expandedCount: 0 };
  }
}

// ─── Cross-Node Contract Validation ────────────────────────────────────

export function validateCrossNodeContracts(nodes: NodeData[], links: LinkData[]): string[] {
  const issues: string[] = [];
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Types/keywords that are infrastructure — don't flag their links
  const skipTypes = new Set(['external', 'monitoring', 'infrastructure', 'database', 'frontend']);
  const infraKeywords = ['observability', 'resilience', 'logging', 'monitoring', 'metrics', 'tracing', 'notification', 'queue'];

  function shouldSkip(node: NodeData): boolean {
    if (skipTypes.has(node.type || '')) return true;
    const label = node.label.toLowerCase();
    return infraKeywords.some(kw => label.includes(kw));
  }

  for (const link of links) {
    const source = nodeMap.get(link.source);
    const target = nodeMap.get(link.target);
    if (!source || !target) continue;

    // Skip any link involving infrastructure / utility / db / frontend nodes
    if (shouldSkip(source) || shouldSkip(target)) continue;

    const sourceDC = (source.data_contract || '').trim();
    const targetDC = (target.data_contract || '').trim();

    // Only flag if BOTH have clearly generic/stub contracts
    const isStub = (dc: string) => !dc || dc.length < 15 || (dc.includes('object') && !dc.includes(':'));
    if (isStub(sourceDC) && isStub(targetDC)) {
      issues.push(`${source.label} \u2194 ${target.label}: both have stub/empty contracts \u2014 needs expansion`);
    }
  }

  return issues;
}

// ─── System Artifact Generation ────────────────────────────────────────

export function generateSystemArtifacts(
  nodes: NodeData[],
  links: LinkData[],
): { routeMap?: string; envTemplate?: string; dbSchema?: string } {
  // Route Map — extract from acceptance criteria + infer from node labels
  const routes: string[] = ['# API Route Map', '', '| Method | Endpoint | Module | Description |', '|--------|----------|--------|-------------|'];
  const routeSet = new Set<string>(); // Deduplicate

  // First: try to extract explicit routes from AC
  for (const node of nodes) {
    for (const ac of node.acceptance_criteria || []) {
      const match = ac.match(/(GET|POST|PUT|PATCH|DELETE|HEAD)\s+(\/[^\s]+)/i);
      if (match) {
        const key = `${match[1]}:${match[2]}`;
        if (!routeSet.has(key)) {
          routeSet.add(key);
          routes.push(`| ${match[1]} | ${match[2]} | ${node.label} | ${ac.substring(0, 80)} |`);
        }
      }
    }
  }

  // Second: infer standard CRUD routes from backend/security nodes if no explicit routes found
  if (routeSet.size === 0) {
    for (const node of nodes) {
      if (!['backend', 'security'].includes(node.type || '')) continue;
      // Skip infra-like backends
      if (['observability', 'resilience', 'monitoring', 'logging'].some(kw => node.label.toLowerCase().includes(kw))) continue;

      const slug = node.label.toLowerCase()
        .replace(/[&+]/g, '-')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-');
      const base = `/api/${slug}`;
      const desc = (node.description || node.label).substring(0, 60);

      routes.push(`| GET | ${base} | ${node.label} | List ${desc} |`);
      routes.push(`| POST | ${base} | ${node.label} | Create ${desc} |`);
      routes.push(`| GET | ${base}/:id | ${node.label} | Get single ${desc} |`);
      routes.push(`| PUT | ${base}/:id | ${node.label} | Update ${desc} |`);
      routes.push(`| DELETE | ${base}/:id | ${node.label} | Delete ${desc} |`);
    }
  }

  // Env Template — extract from node metadata
  const envLines: string[] = [
    '# Auto-generated by KOMPLETUS L1GHT Pre-flight',
    '# Fill in the values before building',
    '',
    '# Database',
    'DATABASE_URL=postgresql://user:password@localhost:5432/dbname',
    '',
  ];

  const hasAuth = nodes.some(n => n.type === 'security');
  const hasWhatsapp = nodes.some(n => n.label.toLowerCase().includes('whatsapp'));
  const hasQueue = nodes.some(n => n.label.toLowerCase().includes('queue'));
  const hasObservability = nodes.some(n => n.label.toLowerCase().includes('observability') || n.label.toLowerCase().includes('monitoring'));

  if (hasAuth) {
    envLines.push('# Auth', 'JWT_SECRET=', 'JWT_EXPIRES_IN=7d', 'BCRYPT_ROUNDS=12', '');
  }
  if (hasWhatsapp) {
    envLines.push('# WhatsApp Cloud API', 'WHATSAPP_PHONE_NUMBER_ID=', 'WHATSAPP_ACCESS_TOKEN=', 'WHATSAPP_VERIFY_TOKEN=', 'WHATSAPP_WEBHOOK_SECRET=', '');
  }
  if (hasQueue) {
    envLines.push('# Message Queue', 'REDIS_URL=redis://localhost:6379', 'QUEUE_CONCURRENCY=5', '');
  }
  if (hasObservability) {
    envLines.push('# Observability', 'LOG_LEVEL=info', 'METRICS_PORT=9090', '');
  }

  envLines.push('# Server', 'PORT=7777', 'NODE_ENV=production', '');

  // DB Schema skeleton — from data contracts
  const dbLines: string[] = ['-- Auto-generated by KOMPLETUS L1GHT Pre-flight', '--', ''];
  for (const node of nodes) {
    if (node.type === 'database') continue; // Skip the DB module itself
    if (!['backend', 'security'].includes(node.type || '')) continue;

    const tableName = node.label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    dbLines.push(`-- ${node.label}`);
    dbLines.push(`CREATE TABLE ${tableName} (`);
    dbLines.push(`  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),`);

    // Extract fields from data contract
    const dc = node.data_contract || '';
    const inputMatch = dc.match(/Input:\s*\{([^}]+)\}/);
    if (inputMatch) {
      const fields = inputMatch[1].split(',').map(f => f.trim());
      for (const field of fields) {
        const [name, type] = field.split(':').map(s => s.trim());
        if (name && name !== '...') {
          const sqlType = mapToSQL(type || 'string');
          const colName = name.replace(/[^a-zA-Z0-9_]/g, '');
          if (colName) {
            dbLines.push(`  ${colName} ${sqlType},`);
          }
        }
      }
    }

    dbLines.push(`  created_at TIMESTAMPTZ DEFAULT NOW(),`);
    dbLines.push(`  updated_at TIMESTAMPTZ DEFAULT NOW()`);
    dbLines.push(`);`);
    dbLines.push('');
  }

  return {
    routeMap: routes.length > 4 ? routes.join('\n') : undefined,
    envTemplate: envLines.join('\n'),
    dbSchema: dbLines.length > 3 ? dbLines.join('\n') : undefined,
  };
}

function mapToSQL(tsType: string): string {
  const t = tsType.toLowerCase().trim();
  if (t.includes('number') || t.includes('int')) return 'INTEGER';
  if (t.includes('float') || t.includes('decimal') || t.includes('brl') || t.includes('cost') || t.includes('price')) return 'DECIMAL(10,2)';
  if (t.includes('boolean') || t.includes('bool')) return 'BOOLEAN DEFAULT FALSE';
  if (t.includes('date') || t.includes('iso8601') || t.includes('timestamp')) return 'TIMESTAMPTZ';
  if (t.includes('array') || t.includes('[]')) return 'JSONB';
  if (t.includes('object') || t.includes('record')) return 'JSONB';
  if (t.includes('uuid')) return 'UUID';
  if (t.includes('email')) return 'VARCHAR(255)';
  if (t.includes('phone') || t.includes('cpf') || t.includes('cnpj')) return 'VARCHAR(20)';
  return 'TEXT';
}
