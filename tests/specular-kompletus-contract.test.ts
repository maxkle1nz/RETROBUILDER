#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const ROOT = path.resolve(import.meta.dirname, '..');

function read(relPath: string) {
  return readFileSync(path.join(ROOT, relPath), 'utf8');
}

function test_kompletus_pipeline_generates_specular_create_stage_and_payload() {
  const source = read('src/server/kompletus-pipeline.ts');

  expect(source.includes("| 'specular_create'"), 'Expected KOMPLETUS stage union to include specular_create.');
  expect(source.includes("stage: 'specular_create'"), 'Expected KOMPLETUS pipeline to emit specular_create progress events.');
  expect(source.includes('buildSpecularCreatePayload'), 'Expected KOMPLETUS pipeline to build SPECULAR CREATE payloads.');
  expect(source.includes('buildSpecularDesignGate'), 'Expected KOMPLETUS pipeline to compute a SPECULAR CREATE design gate summary.');
  expect(source.includes('specularCreate:'), 'Expected KOMPLETUS result payload to expose specularCreate.');
  expect(source.includes('finalSpecularArtifacts'), 'Expected KOMPLETUS to rebuild SPECULAR CREATE artifacts after downstream graph mutations.');
  expect(source.includes('finalSpecularCreateGate'), 'Expected KOMPLETUS to recompute the final SPECULAR CREATE gate before returning.');
}

function test_frontend_contract_mirrors_specular_create_result() {
  const source = read('src/lib/api.ts');

  expect(source.includes('export interface SpecularBuildDesignSummary'), 'Expected frontend API contract to expose SpecularBuildDesignSummary.');
  expect(source.includes('specularCreate: {'), 'Expected KompletusResult to include specularCreate on the frontend mirror.');
  expect(source.includes('artifacts: SpecularCreateResponse[];'), 'Expected frontend KompletusResult to expose specularCreate artifacts.');
}

function test_kompletus_report_renders_specular_create_results() {
  const source = read('src/components/KompletusReport.tsx');

  expect(source.includes('SPECULAR CREATE'), 'Expected KompletusReport to render a SPECULAR CREATE section.');
  expect(source.includes('function SpecularCreateView'), 'Expected KompletusReport to define a SPECULAR CREATE renderer.');
  expect(source.includes('<SpecularCreateView specularCreate={result.specularCreate} />'), 'Expected KompletusReport specular tab to include SPECULAR CREATE output.');
  expect(source.includes("specular_create: '✨ SPECULAR CREATE'"), 'Expected KompletusReport stage labels to include specular_create.');
  expect(source.includes('Product DNA'), 'Expected KompletusReport SPECULAR view to surface active Product DNA packs.');
  expect(source.includes('Receipts:'), 'Expected KompletusReport SPECULAR view to surface Product DNA receipt requirements.');
  expect(source.includes('Knowledge Bank'), 'Expected KompletusReport SPECULAR view to surface Knowledge Bank evidence receipts.');
}

function run() {
  const tests = [
    test_kompletus_pipeline_generates_specular_create_stage_and_payload,
    test_frontend_contract_mirrors_specular_create_result,
    test_kompletus_report_renders_specular_create_results,
  ];

  let passed = 0;
  for (const test of tests) {
    try {
      test();
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

run();
