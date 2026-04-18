---
Protocol: L1GHT/0.4
Node: research-engine
State: ◉ operational
Color: #b026ff
Glyph: 🔬
Completeness: 92%
Proof: empirical
Depends on:
  - src/server/web-research.ts
  - src/server/ai-workflows.ts
  - src/server/m1nd-bridge.ts
Next:
  - browser-level proof of grounding visibility
  - research caching / replay
---

## Overview

[⌂ entity: WebResearchService] orchestrates parallel multi-source research used by node grounding and the broader KOMPLETUS pipeline.

The current user-facing entry points are:
- `NodeContextMenu` deep research
- `NodeInspector` Grounding tab
- `RightPanel` Grounding tab
- `performDeepResearchWorkflow(...)` inside backend AI workflows

[⟁ binds_to: src/server/web-research.ts]
[⟁ binds_to: src/server/ai-workflows.ts::performDeepResearchWorkflow]
[⟁ binds_to: src/components/NodeInspector.tsx]
[⟁ binds_to: src/components/NodeContextMenu.tsx]
[⟁ binds_to: src/components/RightPanel.tsx]

## Source Architecture

The engine currently pulls from these source channels:
- Perplexity
- Serper Web
- Serper Scholar
- Jina Reader
- Semantic Scholar
- CrossRef
- GitHub Search

The fetch strategy is parallel and best-effort; partial results are accepted.

## m1nd Document Enrichment

[⟐ state: m1nd-enriched]

When m1nd is online, `performDeepResearchWorkflow(...)` enriches research output with document/code linkage signals:
- `documentBindings(...)`
- `documentDrift(...)`

That lets the research report talk not only about external knowledge, but also about where the concept is likely bound into the code/document graph.

[⟁ depends_on: src/server/m1nd-bridge.ts]

## Output Contract

### Research Response
```
{
  research: string,
  meta: {
    sourcesFound: number,
    searchTimeMs: number,
    sourcesBreakdown: {
      perplexity,
      webArticles,
      scholarPapers,
      semanticScholar,
      crossref,
      githubDonors
    },
    enrichedPages: number,
    m1nd?: {
      structuralBindingsChars: number,
      grounded: boolean
    }
  }
}
```

## Operational Truth

What is true today:
- grounding is available as a first-class UX action in multiple surfaces
- research is not just a detached note; it is written back into `researchContext`
- the research pipeline is structurally enriched when m1nd is available
- KOMPLETUS reuses the same general research substrate at larger pipeline scale

## Risk Surface

[AMBER warning: visual-grounding-proof-gap]
We still need a browser-level proof that grounding results are surfaced coherently across the full m1ndmap -> report -> build journey.

[AMBER warning: external-rate-limits]
GitHub and scholar-style sources can still rate-limit under load.

[GREEN note: graceful-partial-results]
The system accepts partial research completion rather than collapsing on one provider failure.
