import { SPECULAR_DESIGN_PROFILE } from './specular-profile.js';
import { get21stReferenceCandidates, inferScreenType, isUserFacingNode } from './specular-references.js';
import { applyPreviewStateToArtifact, defaultPreviewState, generateSpecularVariants } from './specular-preview.js';
import { evaluateSpecularVerdict, summarizeBuildDesignGate } from './specular-verdict.js';
import { compileActiveProductDnaContract, loadProductDnaPacksSync } from '../product-dna/product-dna-bank.js';
import { buildKnowledgeContextBundle } from '../knowledge-bank/knowledge-bank-store.js';
import { buildProductDnaKnowledgeSnapshot } from '../knowledge-bank/product-dna-knowledge.js';
import type { ProductDnaPack } from '../product-dna/product-dna-types.js';
import type { KnowledgeContextBundle } from '../knowledge-bank/knowledge-bank-types.js';
import type {
  SpecularBuildDesignSummary,
  SpecularCreatePayload,
  SpecularNodeInput,
  SpecularVariantCandidate,
} from './specular-types.js';

let cachedProductDnaPacks: ProductDnaPack[] | null = null;

function getProductDnaPacks() {
  if (!cachedProductDnaPacks) {
    cachedProductDnaPacks = loadProductDnaPacksSync();
  }
  return cachedProductDnaPacks;
}

export function resetProductDnaPackCacheForTests() {
  cachedProductDnaPacks = null;
}

function compactKnowledgeContextBundle(bundle: KnowledgeContextBundle): KnowledgeContextBundle {
  return {
    ...bundle,
    chunks: bundle.chunks.map((chunk) => ({
      ...chunk,
      text: '',
    })),
    promptContext: '',
  };
}

export function buildSpecularCreatePayload(node: SpecularNodeInput): SpecularCreatePayload {
  const generatedReferences = get21stReferenceCandidates(node);
  const referenceCandidates = node.referenceCandidates?.length
    ? dedupeReferences([
      ...generatedReferences.filter((reference) => reference.source === 'retrobuilder-vanguard'),
      ...node.referenceCandidates,
      ...generatedReferences.filter((reference) => reference.source !== 'retrobuilder-vanguard'),
    ]).slice(0, 8)
    : generatedReferences;
  const screenType = inferScreenType(node);
  const productDnaPacks = getProductDnaPacks();
  const nodeIntent = [
    node.label,
    node.description,
    node.data_contract,
    ...(node.acceptance_criteria || []),
    ...(node.error_handling || []),
  ].filter(Boolean).join('\n');
  const activeProductDnaContract = compileActiveProductDnaContract({
    packs: productDnaPacks,
    selectedPackIds: node.selectedProductDnaPackIds,
    node: {
      id: node.id,
      type: node.type,
      screenType,
      intent: nodeIntent,
    },
  });
  const selectedProductDnaPackIds = activeProductDnaContract.packBindings.map((binding) => binding.id);
  const knowledgeContextBundle = compactKnowledgeContextBundle(buildKnowledgeContextBundle(
    buildProductDnaKnowledgeSnapshot(productDnaPacks, activeProductDnaContract.generatedAt),
    {
      query: nodeIntent,
      stage: 'specular-create',
      nodeRef: { id: node.id, type: node.type, screenType, label: node.label },
      selectedPackIds: selectedProductDnaPackIds,
      sourceKinds: ['product-dna-pack'],
      topK: 5,
      maxChunksPerDocument: 1,
      generatedAt: activeProductDnaContract.generatedAt,
    },
  ));
  const previewState = node.previewState || defaultPreviewState(screenType);

  const generatedVariants = generateSpecularVariants(node, referenceCandidates);
  const rawVariants = node.variantCandidates?.length ? node.variantCandidates : generatedVariants;
  const hydrateVariant = (variant: SpecularVariantCandidate): SpecularVariantCandidate => {
    const previewArtifact = applyPreviewStateToArtifact(variant.previewArtifact, previewState);
    return {
      ...variant,
      previewArtifact,
      designVerdict: evaluateSpecularVerdict(node, {
        previewArtifact,
        previewState,
        referenceCandidates,
        selectedReferenceIds: variant.referenceIds,
        activeProductDnaContract,
      }),
    };
  };
  const hydratedVariants: SpecularVariantCandidate[] = rawVariants.map(hydrateVariant);
  const generatedHydratedVariants: SpecularVariantCandidate[] = rawVariants === generatedVariants
    ? hydratedVariants
    : generatedVariants.map(hydrateVariant);

  let selectedVariantId = node.selectedVariantId || hydratedVariants[0]?.id || 'specular-default';
  const fallbackVariant = hydratedVariants.find((variant) => variant.id === selectedVariantId) || hydratedVariants[0];
  let selectedReferenceIds = node.selectedReferenceIds?.length ? node.selectedReferenceIds : fallbackVariant?.referenceIds || [];
  let previewArtifact = node.previewArtifact
    ? applyPreviewStateToArtifact(node.previewArtifact, previewState)
    : fallbackVariant.previewArtifact;

  let designVerdict = evaluateSpecularVerdict(node, {
    previewArtifact,
    previewState,
    referenceCandidates,
    selectedReferenceIds,
    activeProductDnaContract,
  });

  if (node.previewArtifact && designVerdict.status === 'failed') {
    const repairVariant = generatedHydratedVariants.find((variant) => variant.designVerdict.status === 'passed') || generatedHydratedVariants[0] || fallbackVariant;
    if (!repairVariant) {
      return {
        nodeId: node.id,
        designProfile: node.designProfile || SPECULAR_DESIGN_PROFILE,
        referenceCandidates,
        selectedReferenceIds,
        selectedProductDnaPackIds,
        activeProductDnaContract,
        knowledgeContextBundle,
        variantCandidates: hydratedVariants,
        selectedVariantId,
        previewArtifact,
        previewState,
        designVerdict,
      };
    }
    const repairedVerdict = evaluateSpecularVerdict(node, {
      previewArtifact: repairVariant.previewArtifact,
      previewState,
      referenceCandidates,
      selectedReferenceIds: repairVariant.referenceIds,
      activeProductDnaContract,
    });
    if (repairedVerdict.status === 'passed') {
      previewArtifact = repairVariant.previewArtifact;
      selectedVariantId = repairVariant.id;
      selectedReferenceIds = repairVariant.referenceIds;
      designVerdict = repairedVerdict;
    }
  }

  return {
    nodeId: node.id,
    designProfile: node.designProfile || SPECULAR_DESIGN_PROFILE,
    referenceCandidates,
    selectedReferenceIds,
    selectedProductDnaPackIds,
    activeProductDnaContract,
    knowledgeContextBundle,
    variantCandidates: hydratedVariants,
    selectedVariantId,
    previewArtifact,
    previewState,
    designVerdict,
  };
}

function dedupeReferences(references: SpecularCreatePayload['referenceCandidates']) {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = reference.id || `${reference.source}:${reference.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildSpecularNodePatch(node: SpecularNodeInput) {
  const payload = buildSpecularCreatePayload(node);
  return {
    designProfile: payload.designProfile,
    referenceCandidates: payload.referenceCandidates,
    selectedReferenceIds: payload.selectedReferenceIds,
    selectedProductDnaPackIds: payload.selectedProductDnaPackIds,
    activeProductDnaContract: payload.activeProductDnaContract,
    variantCandidates: payload.variantCandidates,
    selectedVariantId: payload.selectedVariantId,
    previewArtifact: payload.previewArtifact,
    previewState: payload.previewState,
    designVerdict: payload.designVerdict,
  };
}

export function buildSpecularDesignGate(nodes: SpecularNodeInput[]): SpecularBuildDesignSummary {
  const payloads = nodes.filter(isUserFacingNode).map((node) => buildSpecularCreatePayload(node));
  return summarizeBuildDesignGate(payloads);
}
