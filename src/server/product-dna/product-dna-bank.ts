import { readFileSync, readdirSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ActiveProductDnaContract,
  CompileProductDnaContractOptions,
  ProductDnaPack,
  ProductDnaPackValidationResult,
} from './product-dna-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_PRODUCT_DNA_PACK_ROOT = path.resolve(__dirname, '../../../product-dna-packs');
export const PRODUCT_DNA_PACK_SCHEMA_VERSION = 'product-dna-pack@1';
export const ACTIVE_PRODUCT_DNA_CONTRACT_VERSION = 'active-product-dna-contract@1';

const PACK_FAMILIES = new Set(['design', 'domain', 'stack', 'game', 'asset', 'capability', 'quality']);
const PACK_STATUSES = new Set(['seed', 'draft', 'active', 'deprecated']);
const VALIDATOR_SEVERITIES = new Set(['info', 'warn', 'fail']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : null;
}

function requireString(value: Record<string, unknown>, key: string, errors: string[]) {
  if (typeof value[key] !== 'string' || !(value[key] as string).trim()) {
    errors.push(`Missing string field: ${key}`);
  }
}

function requireStringArray(value: Record<string, unknown>, key: string, errors: string[]) {
  const entries = stringArray(value[key]);
  if (!entries || entries.length === 0) {
    errors.push(`Missing non-empty string array: ${key}`);
  }
}

export function validateProductDnaPack(candidate: unknown): ProductDnaPackValidationResult {
  const errors: string[] = [];
  if (!isRecord(candidate)) {
    return { ok: false, errors: ['Pack must be an object.'] };
  }

  for (const key of ['id', 'version', 'title', 'summary']) {
    requireString(candidate, key, errors);
  }

  if (candidate.schemaVersion !== PRODUCT_DNA_PACK_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${PRODUCT_DNA_PACK_SCHEMA_VERSION}.`);
  }
  if (typeof candidate.family !== 'string' || !PACK_FAMILIES.has(candidate.family)) {
    errors.push('family must be one of the known Product DNA families.');
  }
  if (typeof candidate.status !== 'string' || !PACK_STATUSES.has(candidate.status)) {
    errors.push('status must be seed, draft, active, or deprecated.');
  }
  if (typeof candidate.version === 'string' && !/^\d+\.\d+\.\d+$/.test(candidate.version)) {
    errors.push('version must use semver-like x.y.z format.');
  }

  const appliesTo = candidate.appliesTo;
  if (!isRecord(appliesTo)) {
    errors.push('appliesTo must be an object.');
  } else {
    requireStringArray(appliesTo, 'nodeTypes', errors);
    requireStringArray(appliesTo, 'intents', errors);
    if (appliesTo.screenTypes !== undefined && !stringArray(appliesTo.screenTypes)) {
      errors.push('appliesTo.screenTypes must be a string array when provided.');
    }
  }

  const retrieval = candidate.retrieval;
  if (!isRecord(retrieval)) {
    errors.push('retrieval must be an object.');
  } else {
    requireString(retrieval, 'description', errors);
    requireStringArray(retrieval, 'keywords', errors);
    if (!Array.isArray(retrieval.donorSources) || retrieval.donorSources.length === 0) {
      errors.push('retrieval.donorSources must be a non-empty array.');
    }
  }

  const directives = candidate.directives;
  if (!isRecord(directives)) {
    errors.push('directives must be an object.');
  } else {
    requireStringArray(directives, 'prompt', errors);
    requireStringArray(directives, 'requiredElements', errors);
    if (!stringArray(directives.forbiddenPatterns)) {
      errors.push('directives.forbiddenPatterns must be a string array.');
    }
    if (!stringArray(directives.allowedSubstitutions)) {
      errors.push('directives.allowedSubstitutions must be a string array.');
    }
    if (directives.stackHints !== undefined && !stringArray(directives.stackHints)) {
      errors.push('directives.stackHints must be a string array when provided.');
    }
  }

  if (!Array.isArray(candidate.validators) || candidate.validators.length === 0) {
    errors.push('validators must be a non-empty array.');
  } else {
    for (const validator of candidate.validators) {
      if (!isRecord(validator)) {
        errors.push('validator entries must be objects.');
        continue;
      }
      for (const key of ['id', 'description', 'evidence']) {
        requireString(validator, key, errors);
      }
      if (typeof validator.severity !== 'string' || !VALIDATOR_SEVERITIES.has(validator.severity)) {
        errors.push(`validator ${String(validator.id || '<unknown>')} has invalid severity.`);
      }
    }
  }

  const receipts = candidate.receipts;
  if (!isRecord(receipts)) {
    errors.push('receipts must be an object.');
  } else {
    if (!stringArray(receipts.required)) errors.push('receipts.required must be a string array.');
    if (!stringArray(receipts.optional)) errors.push('receipts.optional must be a string array.');
  }

  const provenance = candidate.provenance;
  if (!isRecord(provenance)) {
    errors.push('provenance must be an object.');
  } else {
    requireString(provenance, 'capturedAt', errors);
    requireString(provenance, 'sourceType', errors);
    requireString(provenance, 'notes', errors);
    if (!stringArray(provenance.sourceUrls)) {
      errors.push('provenance.sourceUrls must be a string array.');
    }
  }

  return { ok: errors.length === 0, errors };
}

async function walkPackFiles(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkPackFiles(entryPath));
    } else if (entry.isFile() && entry.name === 'pack.json') {
      files.push(entryPath);
    }
  }
  return files.sort();
}

function walkPackFilesSync(rootDir: string): string[] {
  const entries = (() => {
    try {
      return readdirSync(rootDir, { withFileTypes: true });
    } catch {
      return [];
    }
  })();
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkPackFilesSync(entryPath));
    } else if (entry.isFile() && entry.name === 'pack.json') {
      files.push(entryPath);
    }
  }
  return files.sort();
}

export async function listProductDnaPackFiles(rootDir = DEFAULT_PRODUCT_DNA_PACK_ROOT) {
  return walkPackFiles(path.join(rootDir, 'packs'));
}

export function listProductDnaPackFilesSync(rootDir = DEFAULT_PRODUCT_DNA_PACK_ROOT) {
  return walkPackFilesSync(path.join(rootDir, 'packs'));
}

export async function loadProductDnaPacks(rootDir = DEFAULT_PRODUCT_DNA_PACK_ROOT): Promise<ProductDnaPack[]> {
  const packFiles = await listProductDnaPackFiles(rootDir);
  const packs: ProductDnaPack[] = [];
  const seen = new Set<string>();

  for (const packFile of packFiles) {
    const raw = await readFile(packFile, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    const validation = validateProductDnaPack(parsed);
    if (!validation.ok) {
      throw new Error(`Invalid Product DNA pack ${path.relative(rootDir, packFile)}:\n${validation.errors.join('\n')}`);
    }

    const pack = parsed as ProductDnaPack;
    const key = `${pack.id}@${pack.version}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate Product DNA pack version: ${key}`);
    }
    seen.add(key);
    packs.push(pack);
  }

  return packs;
}

export function loadProductDnaPacksSync(rootDir = DEFAULT_PRODUCT_DNA_PACK_ROOT): ProductDnaPack[] {
  const packFiles = listProductDnaPackFilesSync(rootDir);
  const packs: ProductDnaPack[] = [];
  const seen = new Set<string>();

  for (const packFile of packFiles) {
    const raw = readFileSync(packFile, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    const validation = validateProductDnaPack(parsed);
    if (!validation.ok) {
      throw new Error(`Invalid Product DNA pack ${path.relative(rootDir, packFile)}:\n${validation.errors.join('\n')}`);
    }

    const pack = parsed as ProductDnaPack;
    const key = `${pack.id}@${pack.version}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate Product DNA pack version: ${key}`);
    }
    seen.add(key);
    packs.push(pack);
  }

  return packs;
}

function normalize(value: string) {
  return value.toLowerCase();
}

function tokenize(value: string) {
  return normalize(value).match(/[a-z0-9]+/g) || [];
}

function wordBoundaryCount(haystack: string, needle: string) {
  const haystackTokens = tokenize(haystack);
  const needleTokens = tokenize(needle);
  if (!haystackTokens.length || !needleTokens.length) return 0;

  let matches = 0;
  for (let i = 0; i <= haystackTokens.length - needleTokens.length; i += 1) {
    if (needleTokens.every((token, offset) => haystackTokens[i + offset] === token)) {
      matches += 1;
    }
  }
  return matches;
}

function scorePack(pack: ProductDnaPack, nodeType: string, screenType: string, intent: string) {
  let score = 0;
  if (pack.status === 'deprecated') return -1;
  if (pack.appliesTo.nodeTypes.includes('*') || pack.appliesTo.nodeTypes.some((type) => normalize(type) === normalize(nodeType))) {
    score += 6;
  }
  if (screenType && pack.appliesTo.screenTypes?.some((type) => normalize(type) === normalize(screenType))) {
    score += 3;
  }
  for (const intentHint of pack.appliesTo.intents) {
    score += wordBoundaryCount(intent, intentHint) * 4;
  }
  for (const keyword of pack.retrieval.keywords) {
    score += wordBoundaryCount(intent, keyword);
  }
  return score;
}

export function selectProductDnaPacks(options: CompileProductDnaContractOptions): ProductDnaPack[] {
  const { packs, selectedPackIds, maxPacks = 6 } = options;
  if (selectedPackIds?.length) {
    const selected = new Set(selectedPackIds);
    return packs.filter((pack) => selected.has(pack.id)).sort((a, b) => a.id.localeCompare(b.id));
  }

  const nodeType = options.node.type || '';
  const screenType = options.node.screenType || '';
  const intent = options.node.intent || '';

  return packs
    .map((pack) => ({ pack, score: scorePack(pack, nodeType, screenType, intent) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.pack.id.localeCompare(b.pack.id))
    .slice(0, maxPacks)
    .map((entry) => entry.pack);
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function compileActiveProductDnaContract(options: CompileProductDnaContractOptions): ActiveProductDnaContract {
  const selectedPacks = selectProductDnaPacks(options);
  return {
    contractVersion: ACTIVE_PRODUCT_DNA_CONTRACT_VERSION,
    generatedAt: options.generatedAt || new Date().toISOString(),
    node: options.node,
    packBindings: selectedPacks.map((pack) => ({
      id: pack.id,
      version: pack.version,
      family: pack.family,
      title: pack.title,
    })),
    promptDirectives: unique(selectedPacks.flatMap((pack) => pack.directives.prompt)),
    requiredElements: unique(selectedPacks.flatMap((pack) => pack.directives.requiredElements)),
    forbiddenPatterns: unique(selectedPacks.flatMap((pack) => pack.directives.forbiddenPatterns)),
    allowedSubstitutions: unique(selectedPacks.flatMap((pack) => pack.directives.allowedSubstitutions)),
    stackHints: unique(selectedPacks.flatMap((pack) => pack.directives.stackHints || [])),
    validators: selectedPacks.flatMap((pack) => pack.validators.map((validator) => ({
      ...validator,
      packId: pack.id,
    }))),
    receipts: {
      required: unique(selectedPacks.flatMap((pack) => pack.receipts.required)),
      optional: unique(selectedPacks.flatMap((pack) => pack.receipts.optional)),
    },
    provenance: selectedPacks.map((pack) => ({
      packId: pack.id,
      capturedAt: pack.provenance.capturedAt,
      sourceType: pack.provenance.sourceType,
      sourceUrls: pack.provenance.sourceUrls,
    })),
  };
}

export function summarizeActiveProductDnaContract(contract: ActiveProductDnaContract) {
  return [
    `Product DNA Contract: ${contract.packBindings.length} pack(s)`,
    `Families: ${unique(contract.packBindings.map((binding) => binding.family)).join(', ') || 'none'}`,
    `Required evidence: ${contract.requiredElements.length} element(s), ${contract.receipts.required.length} receipt(s)`,
    `Fail validators: ${contract.validators.filter((validator) => validator.severity === 'fail').length}`,
  ].join('\n');
}
