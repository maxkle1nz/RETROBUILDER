#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const app = readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
const chatFooter = readFileSync(path.join(ROOT, 'src/components/ChatFooter.tsx'), 'utf8');
const modelSelector = readFileSync(path.join(ROOT, 'src/components/ModelSelector.tsx'), 'utf8');

function test_header_compacts_before_it_wraps_badly() {
  expect(app.includes('xl:h-[60px]'), 'Header should only force one-row height on wide screens.');
  expect(app.includes('xl:flex-row'), 'Header should become a two-row adaptive shell below xl.');
  expect(app.includes('overflow-x-auto'), 'Header control rows should keep controls in-bounds on compact windows.');
  expect(app.includes('hidden lg:inline">ARCHITECT'), 'Mode labels should collapse before tablet-width layouts overflow.');
  expect(app.includes('hidden text-left xl:block'), 'Session/key detail copy should wait for wide screens.');
}

function test_chat_footer_has_a_real_command_dock() {
  expect(!chatFooter.includes('absolute -top-7'), 'Mode label and model selector should not float above the input.');
  expect(chatFooter.includes('rounded-[18px]'), 'Chat footer should render as a cohesive dock/card.');
  expect(chatFooter.includes('ModelSelector className="shrink-0"'), 'Model selector should be anchored in the chat command bar.');
  expect(chatFooter.includes('pr-20'), 'Textarea should reserve room for action buttons instead of overlapping them.');
  expect(chatFooter.includes('KONSTRUKTOR') && chatFooter.includes('KREATOR'), 'Architect chat modes should remain explicit in the dock.');
}

function test_model_selector_is_anchored_and_viewport_safe() {
  expect(modelSelector.includes('interface ModelSelectorProps'), 'Model selector should accept layout props from its dock.');
  expect(modelSelector.includes('AI model settings. Current model'), 'Model selector should expose an accessible active-model label.');
  expect(modelSelector.includes('w-[min(320px,calc(100vw-2rem))]'), 'Model selector panel should clamp to the viewport width.');
  expect(!modelSelector.includes('floating config panel'), 'Model selector should not be documented or styled as a loose floating panel.');
}

function run() {
  const tests = [
    test_header_compacts_before_it_wraps_badly,
    test_chat_footer_has_a_real_command_dock,
    test_model_selector_is_anchored_and_viewport_safe,
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
