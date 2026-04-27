import type { ProductDnaPack } from '../product-dna/product-dna-types.js';
import {
  buildKnowledgeBankSnapshot,
  chunkKnowledgeDocument,
  createKnowledgeDocument,
} from './knowledge-bank-store.js';
import type {
  KnowledgeBankSnapshot,
  KnowledgeChunk,
  KnowledgeSourceDocument,
} from './knowledge-bank-types.js';

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function packBody(pack: ProductDnaPack) {
  const donorLines = pack.retrieval.donorSources.map((source) => [
    `- ${source.label}`,
    `  URL: ${source.url}`,
    `  Kind: ${source.kind}`,
    source.license ? `  License: ${source.license}` : '',
    source.notes ? `  Notes: ${source.notes}` : '',
  ].filter(Boolean).join('\n'));

  return [
    `# ${pack.title}`,
    '',
    pack.summary,
    '',
    `Pack ID: ${pack.id}`,
    `Version: ${pack.version}`,
    `Family: ${pack.family}`,
    `Status: ${pack.status}`,
    '',
    '## Retrieval',
    pack.retrieval.description,
    '',
    `Keywords: ${pack.retrieval.keywords.join(', ')}`,
    `Applies to intents: ${pack.appliesTo.intents.join(', ')}`,
    `Applies to node types: ${pack.appliesTo.nodeTypes.join(', ')}`,
    `Applies to screen types: ${(pack.appliesTo.screenTypes || []).join(', ') || 'not specified'}`,
    '',
    '## Donor Sources',
    donorLines.join('\n'),
    '',
    '## Prompt Directives',
    ...pack.directives.prompt.map((entry) => `- ${entry}`),
    '',
    '## Required Elements',
    ...pack.directives.requiredElements.map((entry) => `- ${entry}`),
    '',
    '## Forbidden Patterns',
    ...pack.directives.forbiddenPatterns.map((entry) => `- ${entry}`),
    '',
    '## Validators',
    ...pack.validators.map((validator) => `- [${validator.severity}] ${validator.id}: ${validator.description} Evidence: ${validator.evidence}`),
    '',
    '## Required Receipts',
    ...pack.receipts.required.map((entry) => `- ${entry}`),
    '',
    '## Provenance',
    `Captured at: ${pack.provenance.capturedAt}`,
    `Source type: ${pack.provenance.sourceType}`,
    `Source URLs: ${pack.provenance.sourceUrls.join(', ')}`,
    pack.provenance.notes,
  ].join('\n');
}

export function productDnaPackToKnowledgeEntry(pack: ProductDnaPack): {
  document: KnowledgeSourceDocument;
  chunks: KnowledgeChunk[];
} {
  const body = packBody(pack);
  const tags = unique([
    pack.family,
    pack.id,
    ...pack.appliesTo.nodeTypes,
    ...(pack.appliesTo.screenTypes || []),
    ...pack.appliesTo.intents,
    ...pack.retrieval.keywords,
  ]);
  const document = createKnowledgeDocument({
    docId: `product-dna:${pack.id}@${pack.version}`,
    title: pack.title,
    sourceKind: 'product-dna-pack',
    sourceUri: `product-dna-packs/${pack.id}@${pack.version}`,
    capturedAt: pack.provenance.capturedAt,
    trustLevel: 'verified',
    reviewStatus: 'approved',
    rightsBasis: 'source-controlled manual curation',
    body,
    tags,
    sourceUrls: unique([
      ...pack.provenance.sourceUrls,
      ...pack.retrieval.donorSources.map((source) => source.url),
    ]),
    packId: pack.id,
    family: pack.family,
    license: {
      allowed: pack.retrieval.donorSources.every((source) => source.license !== 'Unknown'),
      notes: 'Pack-level donor licenses are advisory until donor content is ingested as first-class source objects.',
    },
    metadata: {
      version: pack.version,
      status: pack.status,
      requiredReceipts: pack.receipts.required,
      optionalReceipts: pack.receipts.optional,
      validatorIds: pack.validators.map((validator) => validator.id),
    },
  });
  const chunks = chunkKnowledgeDocument(document, body, {
    keywords: tags,
  });
  return { document, chunks };
}

export function buildProductDnaKnowledgeSnapshot(
  packs: ProductDnaPack[],
  generatedAt = new Date().toISOString(),
): KnowledgeBankSnapshot {
  return buildKnowledgeBankSnapshot(packs.map(productDnaPackToKnowledgeEntry), generatedAt);
}
