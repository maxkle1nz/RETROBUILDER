import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';
import type { SpecularNodeInput, SpecularReferenceCandidate, SpecularScreenType } from '../specular-create/specular-types.js';

const DEFAULT_21ST_CATALOG_ROOT = path.join(homedir(), '.retrobuilder', '21st-catalog', 'components');
const MAX_L1GHT_SUMMARY_CHARS = 420;

interface Raw21stComponent {
  component_key?: string;
  username?: string;
  slug?: string;
  name?: string;
  title?: string;
  description_original?: string;
  description_enhanced?: string;
  category_primary?: string;
  categories?: string[];
  author_display_name?: string;
  author_username?: string;
  component_page_url?: string;
  prompt_page_url?: string;
  preview_url?: string;
  video_url?: string;
  npm_dependencies?: string[];
  direct_registry_dependencies?: string[];
  import_sources?: string[];
  tags?: string[];
  likes_count?: number;
  bookmarks_count?: number;
  downloads_count?: number;
}

interface TasteCatalogEntry {
  key: string;
  title: string;
  description: string;
  category: string;
  categories: string[];
  author?: string;
  componentUrl?: string;
  promptUrl?: string;
  previewUrl?: string;
  videoUrl?: string;
  localPath: string;
  promptPath?: string;
  dependencies: string[];
  importSources: string[];
  tags: string[];
  l1ghtSummary?: string;
  popularity: number;
}

const SCREEN_INTENT_TERMS: Record<SpecularScreenType, string[]> = {
  landing: ['hero', 'landing', 'marketing', 'mockup', 'pricing', 'cta', 'showcase', 'video'],
  dashboard: ['dashboard', 'chart', 'metric', 'progress', 'command', 'search', 'data', 'control'],
  form: ['form', 'input', 'select', 'textarea', 'otp', 'checkout', 'sign-in', 'login'],
  list: ['table', 'list', 'directory', 'feed', 'search', 'filter', 'data-display', 'card'],
  detail: ['profile', 'detail', 'card', 'timeline', 'hover', 'avatar', 'testimonial'],
  chat: ['chat', 'prompt', 'assistant', 'ai', 'message', 'conversation'],
  wizard: ['flow', 'step', 'onboarding', 'progress', 'checkout', 'sign-in', 'switch'],
};

const TASTE_SEED_BOOSTS: Record<string, number> = {
  'rahil1202/glass-video-hero': 18,
  'aghasisahakyan1/section-with-mockup': 14,
  'easemize/animated-glassy-pricing': 14,
  'kokonutd/action-search-bar': 12,
  'easemize/ai-prompt-box': 12,
  'easemize/chatgpt-prompt-input': 12,
  'victorwelander/gooey-text-morphing': 10,
  'thimows/animated-text-cycle': 10,
  'dillionverma/sparkles-text': 10,
};

let catalogCache: TasteCatalogEntry[] | null = null;

function catalogRoot() {
  return process.env.RETROBUILDER_21ST_CATALOG_ROOT?.trim() || DEFAULT_21ST_CATALOG_ROOT;
}

function safeJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function firstParagraph(markdown: string) {
  const body = markdown
    .replace(/^---[\s\S]*?---\s*/m, '')
    .split(/\n## /)[0]
    .replace(/^# .+$/m, '')
    .trim()
    .replace(/\s+/g, ' ');
  return body.length > MAX_L1GHT_SUMMARY_CHARS ? `${body.slice(0, MAX_L1GHT_SUMMARY_CHARS).trim()}...` : body;
}

function unique(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenize(value: string) {
  return new Set(normalize(value).split(/\s+/).filter((part) => part.length >= 3));
}

function readCatalogEntry(componentDir: string): TasteCatalogEntry | null {
  const componentPath = path.join(componentDir, 'component.json');
  if (!existsSync(componentPath)) return null;

  const raw = safeJson<Raw21stComponent>(componentPath);
  if (!raw) return null;

  const promptPath = path.join(componentDir, 'component.l1ght.md');
  const promptText = existsSync(promptPath) ? readFileSync(promptPath, 'utf8') : '';
  const key = raw.component_key || [raw.username || raw.author_username, raw.slug].filter(Boolean).join('/');
  if (!key) return null;

  const categories = unique([raw.category_primary, ...(raw.categories || [])]);
  const dependencies = unique([...(raw.npm_dependencies || []), ...(raw.direct_registry_dependencies || [])]);
  const importSources = unique(raw.import_sources || []);
  const tags = unique([...(raw.tags || []), ...categories, raw.slug, raw.name]);
  const popularity = Number(raw.likes_count || 0) + Number(raw.bookmarks_count || 0) * 0.35 + Number(raw.downloads_count || 0) * 0.08;

  return {
    key,
    title: raw.name || raw.title || key,
    description: raw.description_enhanced || raw.description_original || firstParagraph(promptText) || key,
    category: raw.category_primary || categories[0] || 'ai-ui',
    categories,
    author: raw.author_display_name || raw.author_username || raw.username,
    componentUrl: raw.component_page_url,
    promptUrl: raw.prompt_page_url,
    previewUrl: raw.preview_url,
    videoUrl: raw.video_url,
    localPath: componentDir,
    promptPath: existsSync(promptPath) ? promptPath : undefined,
    dependencies,
    importSources,
    tags,
    l1ghtSummary: promptText ? firstParagraph(promptText) : undefined,
    popularity,
  };
}

export function loadTasteCatalog() {
  if (catalogCache) return catalogCache;

  const root = catalogRoot();
  if (!existsSync(root)) {
    catalogCache = [];
    return catalogCache;
  }

  const entries: TasteCatalogEntry[] = [];
  for (const author of readdirSync(root, { withFileTypes: true })) {
    if (!author.isDirectory()) continue;
    const authorDir = path.join(root, author.name);
    for (const component of readdirSync(authorDir, { withFileTypes: true })) {
      if (!component.isDirectory()) continue;
      const entry = readCatalogEntry(path.join(authorDir, component.name));
      if (entry) entries.push(entry);
    }
  }

  catalogCache = entries;
  return catalogCache;
}

export function resetTasteCatalogCache() {
  catalogCache = null;
}

function scoreEntry(entry: TasteCatalogEntry, node: Pick<SpecularNodeInput, 'label' | 'description' | 'type'>, screenType: SpecularScreenType) {
  const nodeTokens = tokenize(`${node.label} ${node.description || ''} ${node.type || ''} ${screenType}`);
  const entryText = `${entry.key} ${entry.title} ${entry.description} ${entry.categories.join(' ')} ${entry.tags.join(' ')}`;
  const entryTokens = tokenize(entryText);
  const intentTerms = SCREEN_INTENT_TERMS[screenType] || [];
  let score = TASTE_SEED_BOOSTS[entry.key] || 0;

  for (const token of nodeTokens) {
    if (entryTokens.has(token)) score += 6;
  }
  for (const term of intentTerms) {
    if (normalize(entryText).includes(term)) score += 8;
  }
  if (entry.previewUrl) score += 7;
  if (entry.promptUrl) score += 5;
  if (entry.dependencies.length > 0) score += 3;
  score += Math.min(18, Math.log10(entry.popularity + 1) * 6);

  return Math.round(score);
}

function toReferenceCandidate(entry: TasteCatalogEntry, score: number, node: Pick<SpecularNodeInput, 'id' | 'label'>): SpecularReferenceCandidate {
  return {
    id: `21st-${entry.key.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
    title: entry.title,
    category: entry.category,
    rationale: [
      `${entry.description} Applied to ${node.label}.`,
      entry.l1ghtSummary ? `L1GHT: ${entry.l1ghtSummary}` : '',
    ].filter(Boolean).join(' '),
    tags: entry.tags.slice(0, 12),
    source: '21st-catalog',
    componentKey: entry.key,
    author: entry.author,
    componentUrl: entry.componentUrl,
    promptUrl: entry.promptUrl,
    previewUrl: entry.previewUrl,
    localPath: entry.localPath,
    promptPath: entry.promptPath,
    dependencies: entry.dependencies,
    importSources: entry.importSources,
    tasteScore: score,
  };
}

export function getTasteReferenceCandidates(
  node: Pick<SpecularNodeInput, 'id' | 'label' | 'description' | 'type'>,
  screenType: SpecularScreenType,
  limit = 4,
): SpecularReferenceCandidate[] {
  return loadTasteCatalog()
    .map((entry) => ({ entry, score: scoreEntry(entry, node, screenType) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, limit)
    .map(({ entry, score }) => toReferenceCandidate(entry, score, node));
}
