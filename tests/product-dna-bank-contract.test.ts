#!/usr/bin/env tsx
import {
  compileActiveProductDnaContract,
  loadProductDnaPacks,
  summarizeActiveProductDnaContract,
  validateProductDnaPack,
} from '../src/server/product-dna/product-dna-bank.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function test_loads_seed_packs_and_validates_contract_shape() {
  const packs = await loadProductDnaPacks();
  const packIds = packs.map((pack) => pack.id);

  for (const expectedId of [
    'asset/provenance-safe-media',
    'capability/safe-mcp-tooling',
    'design/retrofuture-command-center',
    'domain/smb-operations',
    'game/playable-web-game',
    'quality/browser-product-quality',
    'stack/agentic-web-default',
  ]) {
    expect(packIds.includes(expectedId), `Expected Product DNA bank to include ${expectedId}.`);
  }

  for (const pack of packs) {
    const validation = validateProductDnaPack(pack);
    expect(validation.ok, `Expected ${pack.id} to validate. Errors: ${validation.errors.join(', ')}`);
    expect(pack.retrieval.donorSources.length >= 1, `Expected ${pack.id} to include donor source provenance.`);
    expect(pack.validators.length >= 1, `Expected ${pack.id} to include validators.`);
  }
}

async function test_compiles_explicit_active_contract() {
  const packs = await loadProductDnaPacks();
  const contract = compileActiveProductDnaContract({
    packs,
    selectedPackIds: [
      'design/retrofuture-command-center',
      'game/playable-web-game',
      'quality/browser-product-quality',
      'asset/provenance-safe-media',
    ],
    generatedAt: '2026-04-26T12:00:00.000Z',
    node: {
      id: 'trash-tape-ascension',
      type: 'game',
      screenType: 'landing',
      intent: 'A playable web game about a music producer going from trash to success with generated assets and audio feedback.',
    },
  });

  expect(contract.contractVersion === 'active-product-dna-contract@1', 'Expected active contract schema version.');
  expect(contract.generatedAt === '2026-04-26T12:00:00.000Z', 'Expected deterministic generatedAt for test.');
  expect(contract.packBindings.length === 4, `Expected four explicit pack bindings. Got: ${contract.packBindings.length}.`);
  expect(contract.promptDirectives.some((directive) => directive.includes('playable loop')), 'Expected game pack directive to require playable loop.');
  expect(contract.requiredElements.includes('Input loop with keyboard, pointer, or touch controls'), 'Expected game required input loop.');
  expect(contract.requiredElements.includes('Context chips or visible inputs behind any AI output'), 'Expected design required AI context.');
  expect(contract.forbiddenPatterns.includes('static story page pretending to be a game'), 'Expected game anti-static forbidden pattern.');
  expect(contract.receipts.required.includes('playwright-input-trace'), 'Expected playable game receipt.');
  expect(contract.receipts.required.includes('mobile-screenshot'), 'Expected browser quality receipt.');
  expect(contract.validators.some((validator) => validator.packId === 'quality/browser-product-quality' && validator.id === 'browser_smoke_validator'), 'Expected quality browser validator binding.');
  expect(contract.provenance.every((entry) => entry.sourceUrls.length > 0), 'Expected every binding to carry provenance URLs.');

  const summary = summarizeActiveProductDnaContract(contract);
  expect(summary.includes('Product DNA Contract: 4 pack(s)'), `Expected useful contract summary. Got: ${summary}`);
}

async function test_selects_relevant_packs_from_intent() {
  const packs = await loadProductDnaPacks();
  const contract = compileActiveProductDnaContract({
    packs,
    generatedAt: '2026-04-26T12:00:00.000Z',
    maxPacks: 5,
    node: {
      id: 'whatsapp-crm',
      type: 'frontend',
      screenType: 'chat',
      intent: 'Build a WhatsApp CRM command center with customer threads, billing status, booking schedule, browser quality receipts, and AI trace controls.',
    },
  });

  const selectedIds = contract.packBindings.map((binding) => binding.id);
  expect(selectedIds.includes('domain/smb-operations'), `Expected SMB domain pack. Got: ${selectedIds.join(', ')}`);
  expect(selectedIds.includes('design/retrofuture-command-center'), `Expected command-center design pack. Got: ${selectedIds.join(', ')}`);
  expect(selectedIds.includes('quality/browser-product-quality'), `Expected browser quality pack. Got: ${selectedIds.join(', ')}`);
  expect(contract.validators.length >= 6, `Expected merged validators from selected packs. Got: ${contract.validators.length}.`);
}

async function run() {
  const tests = [
    test_loads_seed_packs_and_validates_contract_shape,
    test_compiles_explicit_active_contract,
    test_selects_relevant_packs_from_intent,
  ];

  let passed = 0;
  for (const test of tests) {
    try {
      await test();
      console.log(`PASS ${test.name}`);
      passed += 1;
    } catch (error) {
      console.error(`FAIL ${test.name}`);
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  console.log(`\n${passed}/${tests.length} tests passed`);
}

run().catch((error) => {
  console.error('FAIL product dna bank contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
