import type { ActiveProductDnaContract } from '../product-dna/product-dna-types.js';
import type { KnowledgeContextBundle } from '../knowledge-bank/knowledge-bank-types.js';

export type DesignProfile = '21st';
export type SpecularScreenType = 'dashboard' | 'form' | 'list' | 'detail' | 'chat' | 'wizard' | 'landing';
export type SpecularDensity = 'comfortable' | 'compact';
export type SpecularEmphasis = 'editorial' | 'product' | 'dashboard';
export type SpecularBlockKind = 'hero' | 'metrics' | 'list' | 'detail' | 'activity' | 'cta';

export interface SpecularReferenceCandidate {
  id: string;
  title: string;
  category: string;
  rationale: string;
  tags: string[];
  source: '21st-local' | '21st-catalog' | 'retrobuilder-vanguard';
  componentKey?: string;
  author?: string;
  componentUrl?: string;
  promptUrl?: string;
  previewUrl?: string;
  localPath?: string;
  promptPath?: string;
  dependencies?: string[];
  importSources?: string[];
  patternId?: string;
  sourcePromptName?: string;
  stackAdapters?: Record<string, string[]>;
  implementationNotes?: string[];
  mobileRules?: string[];
  tasteScore?: number;
}

export interface SpecularPreviewBlock {
  id: string;
  kind: SpecularBlockKind;
  title: string;
  eyebrow?: string;
  body?: string;
  items?: string[];
}

export interface SpecularPreviewArtifact {
  kind: 'tsx';
  componentName: string;
  screenType: SpecularScreenType;
  summary: string;
  blocks: SpecularPreviewBlock[];
  tsx: string;
}

export interface SpecularPreviewState {
  density: SpecularDensity;
  emphasis: SpecularEmphasis;
}

export interface SpecularDesignVerdict {
  status: 'pending' | 'passed' | 'failed';
  score: number;
  findings: string[];
  evidence: string[];
}

export interface SpecularVariantCandidate {
  id: string;
  label: string;
  description: string;
  flavor: 'editorial' | 'control' | 'conversational';
  screenType: SpecularScreenType;
  referenceIds: string[];
  previewArtifact: SpecularPreviewArtifact;
  designVerdict: SpecularDesignVerdict;
}

export interface SpecularNodeInput {
  id: string;
  label: string;
  description: string;
  type?: string;
  data_contract?: string;
  acceptance_criteria?: string[];
  error_handling?: string[];
  designProfile?: DesignProfile;
  referenceCandidates?: SpecularReferenceCandidate[];
  selectedReferenceIds?: string[];
  selectedProductDnaPackIds?: string[];
  activeProductDnaContract?: ActiveProductDnaContract;
  variantCandidates?: SpecularVariantCandidate[];
  selectedVariantId?: string;
  previewArtifact?: SpecularPreviewArtifact;
  previewState?: SpecularPreviewState;
  designVerdict?: SpecularDesignVerdict;
}

export interface SpecularCreatePayload {
  nodeId: string;
  designProfile: DesignProfile;
  referenceCandidates: SpecularReferenceCandidate[];
  selectedReferenceIds: string[];
  selectedProductDnaPackIds: string[];
  activeProductDnaContract: ActiveProductDnaContract;
  knowledgeContextBundle: KnowledgeContextBundle;
  variantCandidates: SpecularVariantCandidate[];
  selectedVariantId: string;
  previewArtifact: SpecularPreviewArtifact;
  previewState: SpecularPreviewState;
  designVerdict: SpecularDesignVerdict;
}

export interface SpecularBuildDesignSummary {
  designProfile: DesignProfile;
  designGateStatus: 'pending' | 'passed' | 'failed';
  designScore: number;
  designFindings: string[];
  designEvidence: string[];
  affectedNodeIds: string[];
  failingNodeIds: string[];
}
