export type ProductDnaPackFamily =
  | 'design'
  | 'domain'
  | 'stack'
  | 'game'
  | 'asset'
  | 'capability'
  | 'quality';

export type ProductDnaPackStatus = 'seed' | 'draft' | 'active' | 'deprecated';
export type ProductDnaValidatorSeverity = 'info' | 'warn' | 'fail';
export type ProductDnaSourceKind = 'docs' | 'repo' | 'product' | 'standard' | 'research' | 'internal';
export type ProductDnaProvenanceSourceType = 'sidecar-research' | 'manual-curation' | 'internal-code' | 'imported-docs';

export interface ProductDnaDonorSource {
  label: string;
  url: string;
  kind: ProductDnaSourceKind;
  license?: string;
  notes?: string;
}

export interface ProductDnaAppliesTo {
  nodeTypes: string[];
  screenTypes?: string[];
  intents: string[];
}

export interface ProductDnaRetrieval {
  description: string;
  keywords: string[];
  donorSources: ProductDnaDonorSource[];
}

export interface ProductDnaDirectives {
  prompt: string[];
  requiredElements: string[];
  forbiddenPatterns: string[];
  allowedSubstitutions: string[];
  stackHints?: string[];
}

export interface ProductDnaValidator {
  id: string;
  severity: ProductDnaValidatorSeverity;
  description: string;
  evidence: string;
}

export interface ProductDnaReceipts {
  required: string[];
  optional: string[];
}

export interface ProductDnaProvenance {
  capturedAt: string;
  sourceType: ProductDnaProvenanceSourceType;
  sourceUrls: string[];
  notes: string;
}

export interface ProductDnaPack {
  schemaVersion: 'product-dna-pack@1';
  id: string;
  version: string;
  family: ProductDnaPackFamily;
  title: string;
  summary: string;
  status: ProductDnaPackStatus;
  appliesTo: ProductDnaAppliesTo;
  retrieval: ProductDnaRetrieval;
  directives: ProductDnaDirectives;
  validators: ProductDnaValidator[];
  receipts: ProductDnaReceipts;
  provenance: ProductDnaProvenance;
}

export interface ProductDnaNodeContext {
  id: string;
  type?: string;
  screenType?: string;
  intent?: string;
}

export interface ProductDnaPackBinding {
  id: string;
  version: string;
  family: ProductDnaPackFamily;
  title: string;
}

export interface ActiveProductDnaValidator extends ProductDnaValidator {
  packId: string;
}

export interface ActiveProductDnaProvenance {
  packId: string;
  capturedAt: string;
  sourceType: ProductDnaProvenanceSourceType;
  sourceUrls: string[];
}

export interface ActiveProductDnaContract {
  contractVersion: 'active-product-dna-contract@1';
  generatedAt: string;
  node: ProductDnaNodeContext;
  packBindings: ProductDnaPackBinding[];
  promptDirectives: string[];
  requiredElements: string[];
  forbiddenPatterns: string[];
  allowedSubstitutions: string[];
  stackHints: string[];
  validators: ActiveProductDnaValidator[];
  receipts: ProductDnaReceipts;
  provenance: ActiveProductDnaProvenance[];
}

export interface CompileProductDnaContractOptions {
  node: ProductDnaNodeContext;
  packs: ProductDnaPack[];
  selectedPackIds?: string[];
  maxPacks?: number;
  generatedAt?: string;
}

export interface ProductDnaPackValidationResult {
  ok: boolean;
  errors: string[];
}
