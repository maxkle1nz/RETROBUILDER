/**
 * WebResearchService — Multi-source research orchestrator
 * 
 * Combines 7 sources in parallel to provide real, web-grounded context:
 * 
 *  PAID (API key):
 *    1. Perplexity Sonar  — web search + synthesized answer + citations
 *    2. Serper             — Google web search (snippets + URLs)
 *    3. Serper Scholar     — Google Scholar (academic papers)
 * 
 *  FREE (no key):
 *    4. Jina Reader        — URL → clean markdown
 *    5. Semantic Scholar   — 200M+ papers, abstracts, citation graphs
 *    6. CrossRef           — DOI metadata, 130M+ publications
 *    7. GitHub Search      — Open source repos, donors, stars, topics
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface ResearchSource {
  title: string;
  url: string;
  snippet: string;
  source: 'perplexity' | 'serper' | 'scholar' | 'semantic_scholar' | 'crossref' | 'jina' | 'github';
  citations?: number;
  year?: number;
}

export interface GitHubDonor {
  name: string;           // full_name e.g. "Kong/kong"
  url: string;
  description: string;
  stars: number;
  forks: number;
  language: string;
  license: string;
  topics: string[];
  updatedAt: string;
}

export interface ResearchResult {
  perplexityAnswer: string;
  sources: ResearchSource[];
  githubDonors: GitHubDonor[];        // Open source donor repos
  enrichedContent: string[];          // Full-text from Jina Reader
  totalSourcesFound: number;
  searchTimeMs: number;
}

// ─── Config ──────────────────────────────────────────────────────────

const PERPLEXITY_API = 'https://api.perplexity.ai/chat/completions';
const SERPER_SEARCH_API = 'https://google.serper.dev/search';
const SERPER_SCHOLAR_API = 'https://google.serper.dev/scholar';
const SEMANTIC_SCHOLAR_API = 'https://api.semanticscholar.org/graph/v1/paper/search';
const CROSSREF_API = 'https://api.crossref.org/works';
const GITHUB_SEARCH_API = 'https://api.github.com/search/repositories';
const JINA_READER_PREFIX = 'https://r.jina.ai/';

const TIMEOUT = 15_000;  // 15s per source

// ─── Helpers ─────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Source Adapters ─────────────────────────────────────────────────

async function searchPerplexity(query: string, apiKey: string): Promise<{ answer: string; sources: ResearchSource[] }> {
  if (!apiKey) return { answer: '', sources: [] };
  
  try {
    const res = await fetchWithTimeout(PERPLEXITY_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          { role: 'system', content: 'You are a technical research assistant. Provide detailed, citation-backed analysis. Include URLs.' },
          { role: 'user', content: query }
        ],
        temperature: 0.2,
        max_tokens: 2048,
      }),
    });
    
    const data = await res.json() as any;
    const content = data?.choices?.[0]?.message?.content || '';
    const citations = data?.citations || [];
    
    const sources: ResearchSource[] = citations.map((url: string, i: number) => ({
      title: `Perplexity Source ${i + 1}`,
      url,
      snippet: '',
      source: 'perplexity' as const,
    }));
    
    return { answer: content, sources };
  } catch (e: any) {
    console.warn('[Research] Perplexity failed:', e.message);
    return { answer: '', sources: [] };
  }
}

async function searchSerperWeb(query: string, apiKey: string, num = 5): Promise<ResearchSource[]> {
  if (!apiKey) return [];
  
  try {
    const res = await fetchWithTimeout(SERPER_SEARCH_API, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num }),
    });
    
    const data = await res.json() as any;
    return (data?.organic || []).map((r: any) => ({
      title: r.title || '',
      url: r.link || '',
      snippet: r.snippet || '',
      source: 'serper' as const,
    }));
  } catch (e: any) {
    console.warn('[Research] Serper web failed:', e.message);
    return [];
  }
}

async function searchSerperScholar(query: string, apiKey: string, num = 5): Promise<ResearchSource[]> {
  if (!apiKey) return [];
  
  try {
    const res = await fetchWithTimeout(SERPER_SCHOLAR_API, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num }),
    });
    
    const data = await res.json() as any;
    return (data?.organic || []).map((r: any) => {
      const cited = r.citedBy;
      const citeCount = typeof cited === 'object' ? cited?.total : cited;
      return {
        title: r.title || '',
        url: r.link || '',
        snippet: r.snippet || '',
        source: 'scholar' as const,
        citations: typeof citeCount === 'number' ? citeCount : undefined,
        year: r.year ? parseInt(r.year) : undefined,
      };
    });
  } catch (e: any) {
    console.warn('[Research] Serper Scholar failed:', e.message);
    return [];
  }
}

async function searchSemanticScholar(query: string, limit = 5): Promise<ResearchSource[]> {
  try {
    const params = new URLSearchParams({
      query,
      limit: String(limit),
      fields: 'title,abstract,citationCount,year,url,externalIds',
    });
    
    const res = await fetchWithTimeout(`${SEMANTIC_SCHOLAR_API}?${params}`);
    const data = await res.json() as any;
    
    return (data?.data || []).map((p: any) => ({
      title: p.title || '',
      url: p.url || (p.externalIds?.DOI ? `https://doi.org/${p.externalIds.DOI}` : ''),
      snippet: (p.abstract || '').substring(0, 300),
      source: 'semantic_scholar' as const,
      citations: p.citationCount,
      year: p.year,
    }));
  } catch (e: any) {
    console.warn('[Research] Semantic Scholar failed:', e.message);
    return [];
  }
}

async function searchCrossRef(query: string, rows = 3): Promise<ResearchSource[]> {
  try {
    const params = new URLSearchParams({
      query,
      rows: String(rows),
      select: 'title,DOI,is-referenced-by-count,abstract,published-print',
    });
    
    const res = await fetchWithTimeout(`${CROSSREF_API}?${params}`);
    const data = await res.json() as any;
    
    return (data?.message?.items || []).map((p: any) => {
      const year = p['published-print']?.['date-parts']?.[0]?.[0];
      return {
        title: (p.title || [''])[0],
        url: p.DOI ? `https://doi.org/${p.DOI}` : '',
        snippet: (p.abstract || '').replace(/<[^>]*>/g, '').substring(0, 300),
        source: 'crossref' as const,
        citations: p['is-referenced-by-count'],
        year,
      };
    });
  } catch (e: any) {
    console.warn('[Research] CrossRef failed:', e.message);
    return [];
  }
}

async function searchGitHub(query: string, perPage = 5): Promise<GitHubDonor[]> {
  try {
    // Extract just the core topic (first few meaningful words) for better GitHub results
    const stopWords = new Set(['a', 'an', 'the', 'for', 'and', 'or', 'with', 'in', 'on', 'at', 'to', 'of', 'by', 'is', 'best', 'practices', 'architecture', 'patterns', 'implementation', 'data', 'contract']);
    const coreQuery = query
      .split(/[:\-,;.]/)[0]            // Take text before first delimiter
      .split(/\s+/)                      // Split into words
      .filter(w => !stopWords.has(w.toLowerCase()) && w.length > 2)
      .slice(0, 4)                       // Max 4 keywords
      .join(' ');
    
    const params = new URLSearchParams({
      q: `${coreQuery} stars:>5`,        // Only repos with >5 stars
      sort: 'stars',
      order: 'desc',
      per_page: String(perPage),
    });
    
    const res = await fetchWithTimeout(`${GITHUB_SEARCH_API}?${params}`, {
      headers: { 'Accept': 'application/vnd.github+json' },
    });
    
    const data = await res.json() as any;
    return (data?.items || []).map((r: any) => ({
      name: r.full_name || '',
      url: r.html_url || '',
      description: (r.description || '').substring(0, 200),
      stars: r.stargazers_count || 0,
      forks: r.forks_count || 0,
      language: r.language || 'Unknown',
      license: r.license?.spdx_id || 'Unknown',
      topics: (r.topics || []).slice(0, 8),
      updatedAt: r.updated_at || '',
    }));
  } catch (e: any) {
    console.warn('[Research] GitHub search failed:', e.message);
    return [];
  }
}

async function readUrlWithJina(url: string): Promise<string> {
  try {
    const res = await fetchWithTimeout(`${JINA_READER_PREFIX}${url}`, {
      headers: { 'Accept': 'text/plain' },
    }, 20_000);  // 20s for full page reads
    
    const text = await res.text();
    // Limit to ~3000 chars to avoid token overflow
    return text.substring(0, 3000);
  } catch (e: any) {
    console.warn(`[Research] Jina Reader failed for ${url}:`, e.message);
    return '';
  }
}

// ─── Main Orchestrator ───────────────────────────────────────────────

export async function performWebResearch(
  query: string,
  options: {
    perplexityKey?: string;
    serperKey?: string;
    readTopUrls?: number;    // How many URLs to read full content (default: 2)
    includeScholar?: boolean; // Include academic papers (default: true)
  } = {}
): Promise<ResearchResult> {
  const start = Date.now();
  const { perplexityKey, serperKey, readTopUrls = 2, includeScholar = true } = options;
  
  console.log(`[Research] 🔍 Starting parallel research: "${query.substring(0, 60)}..."`);
  
  // Phase 1: Fire all searches in parallel
  const [perplexityResult, webResults, scholarResults, semanticResults, crossrefResults, githubResults] = await Promise.all([
    searchPerplexity(query, perplexityKey || ''),
    searchSerperWeb(query, serperKey || ''),
    includeScholar ? searchSerperScholar(query, serperKey || '') : Promise.resolve([]),
    includeScholar ? searchSemanticScholar(query) : Promise.resolve([]),
    includeScholar ? searchCrossRef(query, 3) : Promise.resolve([]),
    searchGitHub(query, 5),
  ]);
  
  // Deduplicate sources by URL
  const allSources = [
    ...perplexityResult.sources,
    ...webResults,
    ...scholarResults,
    ...semanticResults,
    ...crossrefResults,
  ];
  
  const seenUrls = new Set<string>();
  const dedupedSources = allSources.filter(s => {
    if (!s.url || seenUrls.has(s.url)) return false;
    seenUrls.add(s.url);
    return true;
  });
  
  // Sort: papers with most citations first, then web results
  dedupedSources.sort((a, b) => (b.citations || 0) - (a.citations || 0));
  
  console.log(`[Research] 📚 Found ${dedupedSources.length} unique sources (${scholarResults.length} papers, ${webResults.length} web, ${githubResults.length} repos)`);
  
  // Phase 2: Read top N URLs with Jina for full content enrichment
  const urlsToRead = dedupedSources
    .filter(s => s.url && !s.url.includes('doi.org') && s.url.startsWith('http'))
    .slice(0, readTopUrls)
    .map(s => s.url);
  
  const enrichedContent = await Promise.all(urlsToRead.map(readUrlWithJina));
  const validContent = enrichedContent.filter(c => c.length > 100);
  
  console.log(`[Research] 📖 Read ${validContent.length}/${urlsToRead.length} URLs via Jina`);
  
  const elapsed = Date.now() - start;
  console.log(`[Research] ✅ Complete in ${elapsed}ms`);
  
  return {
    perplexityAnswer: perplexityResult.answer,
    sources: dedupedSources,
    githubDonors: githubResults,
    enrichedContent: validContent,
    totalSourcesFound: dedupedSources.length + githubResults.length,
    searchTimeMs: elapsed,
  };
}

// ─── Context Builder ─────────────────────────────────────────────────

/**
 * Build a structured context string from research results
 * suitable for injection into an LLM prompt.
 */
export function buildResearchContext(result: ResearchResult): string {
  const parts: string[] = [];
  
  // Perplexity synthesized answer
  if (result.perplexityAnswer) {
    parts.push('## Web Research Summary (Perplexity)\n' + result.perplexityAnswer);
  }
  
  // Academic papers
  const papers = result.sources.filter(s =>
    s.source === 'scholar' || s.source === 'semantic_scholar' || s.source === 'crossref'
  );
  if (papers.length > 0) {
    parts.push('## Academic Papers\n' + papers.map(p =>
      `- **${p.title}** ${p.year ? `(${p.year})` : ''} ${p.citations ? `[${p.citations} citations]` : ''}\n  ${p.snippet ? p.snippet.substring(0, 200) : ''}\n  ${p.url}`
    ).join('\n'));
  }
  
  // Web articles
  const web = result.sources.filter(s => s.source === 'serper');
  if (web.length > 0) {
    parts.push('## Web Articles\n' + web.map(w =>
      `- **${w.title}**\n  ${w.snippet}\n  ${w.url}`
    ).join('\n'));
  }
  
  // GitHub donor repos
  if (result.githubDonors.length > 0) {
    parts.push('## Open Source Donors (GitHub)\n' + result.githubDonors.map(d =>
      `- **[${d.name}](${d.url})** ⭐ ${d.stars.toLocaleString()} │ ${d.language} │ ${d.license}\n  ${d.description}\n  Topics: ${d.topics.join(', ')}\n  Forks: ${d.forks.toLocaleString()} │ Updated: ${d.updatedAt.substring(0, 10)}`
    ).join('\n'));
  }
  
  // Enriched full-text content from Jina
  if (result.enrichedContent.length > 0) {
    parts.push('## Detailed Source Content\n' +
      result.enrichedContent.map((c, i) =>
        `### Source ${i + 1}\n${c}`
      ).join('\n\n')
    );
  }
  
  parts.push(`\n---\n*${result.totalSourcesFound} sources found in ${result.searchTimeMs}ms*`);
  
  return parts.join('\n\n');
}
