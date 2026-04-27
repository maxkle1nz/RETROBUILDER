#!/usr/bin/env tsx
import { needsSchedulingControls } from '../src/server/scheduling-intent.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function run() {
  expect(
    needsSchedulingControls('Barbershop booking site with appointment slots and barber availability'),
    'Expected explicit appointment booking surfaces to require scheduling controls.',
  );
  expect(
    needsSchedulingControls('Restaurant reservation flow with time slot and host availability'),
    'Expected reservation surfaces to require scheduling controls.',
  );
  expect(
    needsSchedulingControls('Service appointment scheduler with appointment time selection and staff availability'),
    'Expected explicit appointment time selection to require scheduling controls.',
  );
  expect(
    !needsSchedulingControls('Landing Content SSOT with Free tier copy and Lifetime: €5 one-time pricing, ordered sections, CTA labels, and forbidden claim rules'),
    'Expected one-time pricing copy not to be misclassified as appointment scheduling.',
  );
  expect(
    !needsSchedulingControls('Narrative rhythm game with save slots, save cassette state, player chapters, beat pads, and achievements'),
    'Expected game save slots not to be misclassified as appointment scheduling.',
  );
  expect(
    !needsSchedulingControls('Cinematic title screen for a rhythm game that renders a distinct title screen, not a booking/CRM/site template.'),
    'Expected negative booking guardrails in game prompts not to force appointment controls.',
  );
  expect(
    !needsSchedulingControls('Music producer career story map with track release date metadata and beat quality stats'),
    'Expected game/story metadata dates not to force appointment controls.',
  );

  console.log('PASS scheduling intent contract');
}

run();
