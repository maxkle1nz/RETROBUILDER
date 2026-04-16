---
Protocol: L1GHT/0.4
Node: research-engine
State: ◉ operational
Color: #b026ff
Glyph: 🔬
Completeness: 90%
Proof: empirical
Depends on:
  - perplexity-api
  - serper-api
  - jina-reader
  - semantic-scholar
  - crossref
  - github-search
  - m1nd-bridge
Next:
  - citation-graph
  - research-cache
---

## Overview

[⍂ entity: WebResearchService] orchestrates parallel queries across 7 research sources to provide the Kreator and Deep Research endpoint with grounded, citation-backed context.

[⟁ binds_to: src/server/web-research.ts]
[⟁ binds_to: server.ts:performDeepResearch]

## Source Architecture

The engine fires all sources in parallel via `Promise.allSettled`:

| Source | API | Purpose |
|---|---|---|
| [⍂ entity: Perplexity] | `sonar-pro` | Synthesized web answers with citations |
| [⍂ entity: Serper-Web] | Google Search API | Top web results for queries |
| [⍂ entity: Serper-Scholar] | Google Scholar API | Academic paper discovery |
| [⍂ entity: Jina-Reader] | `r.jina.ai` | Full-text markdown extraction |
| [⍂ entity: Semantic-Scholar] | S2 API | Paper metadata and citation graphs |
| [⍂ entity: CrossRef] | CrossRef API | DOI resolution and metadata |
| [⍂ entity: GitHub-Search] | GitHub API | Donor repository discovery |

[𝔻 confidence: 0.95] — All sources have fallback handling; partial results are accepted.

## M1ND Document Integration

[⍐ state: m1nd-enriched] — When m1nd is online, the Deep Research pipeline enriches results with:

1. `document_bindings(node.label)` → finds code locations implementing the researched concept
2. `document_drift(node.label)` → detects stale bindings between docs and code

This creates a closed-loop: **Research → Structure → Code → Verification**.

[⟁ depends_on: src/server/m1nd-bridge.ts]

## Output Contract

### Research Response
```
{
  research: string (markdown),
  meta: {
    sourcesFound: number,
    searchTimeMs: number,
    sourcesBreakdown: { perplexity, webArticles, scholarPapers, semanticScholar, crossref, githubDonors },
    enrichedPages: number,
    m1nd?: { structuralBindingsChars: number, grounded: boolean }
  }
}
```

## Risk Surface

[AMBER warning: rate-limits] — GitHub (60 req/hr unauthenticated), Semantic Scholar (429 under load).
[AMBER warning: api-cost] — Perplexity Sonar Pro has per-query costs; other sources are free.

[⟁ tests: deep-research-7-source-pipeline]
[⟁ tests: m1nd-document-bindings-injection]
