# Product DNA Packs

Product DNA Packs are source-controlled guidance contracts for Retrobuilder. Each pack captures a reusable product intelligence pattern, its donor sources, prompt directives, validators, receipt requirements, and provenance.

The runtime compiles selected packs into an `ActiveProductDnaContract` before generation. That compiled contract is the narrow artifact that should be injected into prompts, quality gates, build receipts, and future knowledge-bank retrieval.

## Pack Families

- `design`: visual language, layout grammar, motion, interaction, accessibility constraints.
- `domain`: business primitives, lifecycle states, integrations, compliance constraints.
- `stack`: default technology choices and routing rules.
- `game`: interactive mechanics, loop, progression, feedback, assets, browser capability.
- `asset`: media generation, licensing, provenance, safety, and brand constraints.
- `capability`: MCP/tool/provider integration policy and setup rules.
- `quality`: validators, browser evidence, a11y, performance, and receipt bundles.

## Directory Contract

- `pack.schema.json`: schema for authored pack files.
- `active-contract.schema.json`: schema for the compiled runtime contract.
- `packs/<family>/<pack-id>/pack.json`: immutable authored pack version.

Authored packs belong in source control. Runtime receipts and captured source objects should stay outside this folder, for example under `.retrobuilder/runtime/<sessionId>/pack-receipts/` or a future knowledge-bank object store.

## Selection Model

Retrobuilder can select packs explicitly by ID or compile them from intent:

1. Match node type, screen type, and intent text against `appliesTo`.
2. Score keyword hits from `retrieval.keywords`.
3. Prefer explicit selected pack IDs when present.
4. Compile prompt directives, required evidence, validators, and receipts into one active contract.

This keeps RAG in a retrieval role. The compiled contract is what constrains generation.

## Knowledge Bank Feed

Product DNA packs are now also ingestible as verified Knowledge Bank source documents. The pack remains the policy artifact; the Knowledge Bank creates chunk-level evidence with `docId`, `chunkId`, `sha256` fingerprints, trust level, review status, source URLs, and retrieval receipts.

The default v1 backend is filesystem-first under `.retrobuilder/knowledge-bank/` so retrieval can be inspected, diffed, and tested without adding a vector service. SQLite/FTS5 and embeddings remain future adapters until provenance and evals are stable.
