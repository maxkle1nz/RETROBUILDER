#!/usr/bin/env tsx
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { runFrontendMobileQualityGate } from '../src/server/omx-frontend-quality.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function writeSource(moduleDir: string, content: string) {
  await mkdir(path.join(moduleDir, 'src'), { recursive: true });
  await writeFile(path.join(moduleDir, 'src', 'index.js'), content, 'utf8');
}

async function writeTestSource(moduleDir: string, content: string) {
  await mkdir(path.join(moduleDir, 'src'), { recursive: true });
  await writeFile(path.join(moduleDir, 'src', 'index.test.js'), content, 'utf8');
}

async function run() {
  const backendDir = await mkdtemp(path.join(tmpdir(), 'omx-backend-quality-'));
  const riskyFrontendDir = await mkdtemp(path.join(tmpdir(), 'omx-risky-frontend-'));
  const diagnosticFrontendDir = await mkdtemp(path.join(tmpdir(), 'omx-diagnostic-frontend-'));
    const genericFrontendDir = await mkdtemp(path.join(tmpdir(), 'omx-generic-frontend-'));
      const moduleSpecFrontendDir = await mkdtemp(path.join(tmpdir(), 'omx-modulespec-frontend-'));
      const domActionFrontendDir = await mkdtemp(path.join(tmpdir(), 'omx-dom-action-frontend-'));
      const bookingMissingControlsDir = await mkdtemp(path.join(tmpdir(), 'omx-booking-missing-21st-controls-'));
      const booking21stControlsDir = await mkdtemp(path.join(tmpdir(), 'omx-booking-21st-controls-'));
      const vehicleNotesDir = await mkdtemp(path.join(tmpdir(), 'omx-vehicle-notes-quality-'));
      const gameTitleDir = await mkdtemp(path.join(tmpdir(), 'omx-game-title-quality-'));
      const safeFrontendDir = await mkdtemp(path.join(tmpdir(), 'omx-safe-frontend-'));

  try {
    const backendResult = await runFrontendMobileQualityGate(backendDir, { type: 'backend', label: 'Backend' });
    expect(backendResult.passed === true, 'Expected non-frontend modules to skip the mobile quality gate.');

    await writeSource(riskyFrontendDir, `
      function renderScreen() {
        return \`<!doctype html>
          <html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
          <body>
            <main>
              <section class="hero"><h1>Very long mobile headline with payload text</h1></section>
            </main>
            <style>
              main { padding: 18px; }
              .hero { display: grid; grid-template-columns: 1fr; }
              h1 { font-size: clamp(2rem, 8vw, 3.5rem); }
            </style>
          </body></html>\`;
      }
      function serializeInternalDraft() {
        return ({ debugPayload: JSON.stringify({ dataContract: 'internal-only' }) });
      }
      module.exports = { renderScreen };
    `);

    const riskyResult = await runFrontendMobileQualityGate(riskyFrontendDir, { type: 'frontend', label: 'Risky Frontend' });
    expect(riskyResult.passed === false, 'Expected frontend without wrapping/width containment to fail.');
    expect(riskyResult.summary.includes('long-content wrapping'), 'Expected failure to mention missing wrapping safeguards.');
    expect(riskyResult.summary.includes('width containment'), 'Expected failure to mention missing width containment.');
    expect(riskyResult.summary.includes('product action primitives'), 'Expected failure to mention missing product actions.');

    await writeSource(diagnosticFrontendDir, `
      function renderScreen() {
        const payload = { moduleId: 'frontend', dataContract: 'internal', acceptanceCriteria: ['looks fine'] };
        return \`<!doctype html>
          <html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
          <body>
            <main>
              <section class="hero">
                <h1>Book a visit in under a minute</h1>
                <button type="button">Schedule care</button>
                <pre class="payload">\${JSON.stringify(payload, null, 2)}</pre>
              </section>
            </main>
            <style>
              * { box-sizing: border-box; }
              body { overflow-x: hidden; }
              main { width: 100%; max-width: 100%; padding: 18px; }
              .hero { min-width: 0; width: 100%; max-width: 100%; display: grid; gap: 12px; }
              h1, button, .payload { overflow-wrap: anywhere; word-break: break-word; }
              @media (min-width: 760px) { .hero { grid-template-columns: minmax(0, 1fr); } }
            </style>
          </body></html>\`;
      }
      module.exports = { renderScreen };
    `);

    const diagnosticResult = await runFrontendMobileQualityGate(diagnosticFrontendDir, { type: 'frontend', label: 'Diagnostic Frontend' });
    expect(diagnosticResult.passed === false, 'Expected frontend exposing raw JSON/debug payloads to fail.');
    expect(diagnosticResult.summary.includes('developer diagnostics'), 'Expected failure to mention developer diagnostics.');

    await writeSource(genericFrontendDir, `
      function renderScreen() {
        return \`<!doctype html>
          <html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
          <body>
            <main>
              <section class="hero bg-black/30 text-slate-300">
                <h1>Generic dashboard</h1>
                <p>Order and delivery status is available.</p>
                <button type="button">Request delivery</button>
              </section>
            </main>
            <style>
              * { box-sizing: border-box; }
              body { overflow-x: hidden; }
              main { width: 100%; max-width: 100%; padding: 18px; }
              .hero { min-width: 0; width: 100%; max-width: 100%; display: grid; gap: 12px; }
              h1, p, button { overflow-wrap: anywhere; word-break: break-word; }
              @media (min-width: 760px) { .hero { grid-template-columns: minmax(0, 1fr); } }
            </style>
          </body></html>\`;
      }
      module.exports = { renderScreen };
    `);

    const genericResult = await runFrontendMobileQualityGate(genericFrontendDir, { type: 'frontend', label: 'Generic Frontend' });
    expect(genericResult.passed === false, 'Expected generic dark/card fallback frontend to fail.');
    expect(genericResult.summary.includes('generic dark/glass/card'), 'Expected failure to mention generic visual fallback vocabulary.');

    await writeSource(moduleSpecFrontendDir, `
      const moduleSpec = { label: 'Mobile Booking', description: 'Request warm daily delivery from your phone.' };
      function renderScreen() {
        return \`<!doctype html>
          <html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
          <body>
            <main>
              <section class="hero">
                <h1>\${moduleSpec.label}</h1>
                <p>\${moduleSpec.description}</p>
                <button type="button">Request delivery</button>
              </section>
            </main>
            <style>
              * { box-sizing: border-box; }
              body { overflow-x: hidden; }
              main { width: 100%; max-width: 100%; padding: 18px; }
              .hero { min-width: 0; width: 100%; max-width: 100%; display: grid; gap: 12px; }
              h1, p, button { overflow-wrap: anywhere; word-break: break-word; }
              @media (min-width: 760px) { .hero { grid-template-columns: minmax(0, 1fr); } }
            </style>
          </body></html>\`;
      }
      module.exports = { renderScreen };
    `);

      const moduleSpecResult = await runFrontendMobileQualityGate(moduleSpecFrontendDir, { type: 'frontend', label: 'ModuleSpec Frontend' });
      expect(moduleSpecResult.passed === true, `Expected internal moduleSpec interpolation to pass when visible copy is product-facing. ${moduleSpecResult.summary}`);

      await writeSource(domActionFrontendDir, `
        function renderScreen() {
          const action = document.createElement("button");
          action.textContent = "Confirm booking";
          action.addEventListener("click", () => {});
          return \`<!doctype html>
            <html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
            <body>
              <main>
                <section class="hero">
                  <h1>Confirm a booking without losing the client context</h1>
                  <p class="long-note">A very long appointment note stays inside the mobile card while the DOM action controls booking confirmation.</p>
                </section>
              </main>
              <style>
                * { box-sizing: border-box; }
                body { overflow-x: hidden; }
                main { width: 100%; max-width: 100%; padding: 18px; }
                .hero { min-width: 0; width: 100%; max-width: 100%; display: grid; gap: 12px; }
                h1 { font-size: clamp(1.8rem, 8vw, 3.2rem); overflow-wrap: anywhere; }
                .long-note { min-width: 0; max-width: 100%; overflow-wrap: anywhere; word-break: break-word; }
                @media (min-width: 760px) { .hero { grid-template-columns: minmax(0, 1fr); } }
              </style>
            </body></html>\`;
        }
        module.exports = { renderScreen };
      `);

        const domActionResult = await runFrontendMobileQualityGate(domActionFrontendDir, { type: 'frontend', label: 'DOM Action Frontend' });
        expect(domActionResult.passed === true, `Expected DOM-created product action primitives to pass. ${domActionResult.summary}`);

        const bookingNode = {
          type: 'frontend',
          label: 'Ink Ledger Tattoo Booking Site',
          description: 'Public tattoo studio site with artist consultation booking, deposits, aftercare reminders, and CRM intake.',
          data_contract: 'Input: {services, artists, client, availableSlots} -> Output: responsive tattoo consultation page',
          acceptance_criteria: ['Guests can request tattoo consultations from a 390px phone viewport'],
          error_handling: ['Long tattoo idea notes stay inside the mobile layout'],
        };

        await writeSource(bookingMissingControlsDir, `
          function renderScreen() {
            return \`<!doctype html>
              <html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
              <body>
                <main>
                  <section class="hero">
                    <h1>Request a tattoo consultation</h1>
                    <p class="long-note">A long tattoo idea wraps safely while guests choose a date and confirm a booking request.</p>
                    <form>
                      <input name="date" type="date" />
                      <button type="submit">Confirm consultation</button>
                    </form>
                  </section>
                </main>
                <style>
                  * { box-sizing: border-box; }
                  body { overflow-x: hidden; }
                  main { width: 100%; max-width: 100%; padding: 18px; }
                  .hero, form { min-width: 0; width: 100%; max-width: 100%; display: grid; gap: 12px; }
                  h1, p, button, input { overflow-wrap: anywhere; word-break: break-word; }
                  @media (min-width: 760px) { .hero { grid-template-columns: minmax(0, 1fr); } }
                </style>
              </body></html>\`;
          }
          module.exports = { renderScreen };
        `);

        const bookingMissingControlsResult = await runFrontendMobileQualityGate(bookingMissingControlsDir, bookingNode);
        expect(bookingMissingControlsResult.passed === false, 'Expected scheduling frontend with native date/basic button to fail 21st control fidelity.');
        expect(bookingMissingControlsResult.summary.includes('date/time control'), 'Expected scheduling failure to mention missing date/time control.');
        expect(bookingMissingControlsResult.summary.includes('interaction behavior'), 'Expected scheduling failure to mention missing 21st interaction behavior.');

        await writeSource(booking21stControlsDir, `
          function renderScreen() {
            return \`<!doctype html>
              <html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
              <body>
                <main>
                  <section class="appointment-scheduler date-wheel-picker" data-21st-pattern="appointment-scheduler date-wheel-picker" aria-label="Appointment scheduler">
                    <header class="scheduler-head">
                      <h1>Request a tattoo consultation</h1>
                      <p class="long-note">A long tattoo idea wraps safely while guests choose a consultation slot.</p>
                    </header>
                    <form class="booking-form">
                      <div class="wheel-grid" aria-label="Date and time selector">
                        <div class="wheel-column">
                          <span class="wheel-label">Date</span>
                          <div class="wheel-track" aria-label="date options">
                            <button class="wheel-option is-selected" type="button">Fri 24</button>
                            <button class="wheel-option" type="button">Sat 25</button>
                          </div>
                        </div>
                        <div class="wheel-column">
                          <span class="wheel-label">Time</span>
                          <div class="wheel-track" aria-label="time options">
                            <button class="wheel-option is-selected" type="button">11:00</button>
                            <button class="wheel-option" type="button">14:30</button>
                          </div>
                        </div>
                      </div>
                      <button class="kinetic-button primary-action" data-21st-pattern="button-with-icon material-ripple action-button" type="submit">Confirm consultation</button>
                    </form>
                  </section>
                </main>
                <style>
                  * { box-sizing: border-box; }
                  body { overflow-x: hidden; }
                  main { width: 100%; max-width: 100%; padding: 18px; }
                  .appointment-scheduler, .booking-form { min-width: 0; width: 100%; max-width: 100%; display: grid; gap: 12px; }
                  .wheel-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; max-width: 100%; }
                  .wheel-track { display: grid; gap: 8px; max-height: 132px; overflow: auto; scroll-snap-type: y mandatory; }
                  .wheel-option { scroll-snap-align: center; overflow-wrap: anywhere; }
                  .kinetic-button:active { transform: scale(.98); }
                  h1, p, button { overflow-wrap: anywhere; word-break: break-word; }
                  @media (max-width: 430px) { .wheel-grid { grid-template-columns: minmax(0, 1fr); } }
                  @media (min-width: 760px) { .appointment-scheduler { grid-template-columns: minmax(0, 1fr); } }
                </style>
              </body></html>\`;
          }
          module.exports = { renderScreen };
        `);

        const booking21stControlsResult = await runFrontendMobileQualityGate(booking21stControlsDir, bookingNode);
        expect(booking21stControlsResult.passed === true, `Expected scheduling frontend with translated 21st controls to pass. ${booking21stControlsResult.summary}`);

        await writeSource(vehicleNotesDir, `
          function renderScreen() {
            return \`<!doctype html>
              <html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
              <body>
                <main>
                  <section class="vehicle-record">
                    <h1>Vehicle Notes</h1>
                    <p class="long-note">Review customer context, appointment notes, service history, and inspection findings without opening a booking scheduler.</p>
                    <button type="button">Save vehicle note</button>
                  </section>
                </main>
                <style>
                  * { box-sizing: border-box; }
                  body { overflow-x: hidden; }
                  main { width: 100%; max-width: 100%; padding: 18px; }
                  .vehicle-record { min-width: 0; width: 100%; max-width: 100%; display: grid; gap: 12px; }
                  h1, p, button { overflow-wrap: anywhere; word-break: break-word; }
                  @media (min-width: 760px) { .vehicle-record { grid-template-columns: minmax(0, 1fr); } }
                </style>
              </body></html>\`;
          }
          module.exports = { renderScreen };
        `);

        const vehicleNotesResult = await runFrontendMobileQualityGate(vehicleNotesDir, {
          type: 'frontend',
          label: 'Vehicle Notes',
          description: 'Service advisors capture inspection notes, repair history, and appointment context for each vehicle record.',
          data_contract: 'Input: { vehicleId, customer, notes, serviceHistory, appointmentContext } -> Output: note cards and follow-up message',
          acceptance_criteria: ['Advisors can review service history without losing customer context'],
          error_handling: ['Keep the draft visible if note sync fails'],
        });
        expect(vehicleNotesResult.passed === true, `Expected vehicle notes with appointment context to avoid scheduling-control false positives. ${vehicleNotesResult.summary}`);

        await writeSource(gameTitleDir, `
          function renderScreen() {
            return \`<!doctype html>
              <html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
              <body>
                <main>
                  <section class="title-screen" data-game-screen="title-screen">
                    <h1>Trash Tape Ascension</h1>
                    <p class="long-note">Start a producer run, continue the save cassette, unlock beat pads, and climb from alley tapes to festival lights.</p>
                    <div class="actions">
                      <a class="kinetic-button" data-21st-pattern="button-with-icon material-ripple" href="#beat-lab">Start new run</a>
                      <button class="kinetic-button" type="button">Continue chapter</button>
                    </div>
                  </section>
                </main>
                <style>
                  * { box-sizing: border-box; }
                  body { overflow-x: hidden; }
                  main { width: 100%; max-width: 100%; padding: 18px; }
                  .title-screen, .actions { min-width: 0; width: 100%; max-width: 100%; display: grid; gap: 12px; }
                  .kinetic-button:active { transform: scale(.98); }
                  h1, p, button, a { overflow-wrap: anywhere; word-break: break-word; }
                  @media (min-width: 760px) { .title-screen { grid-template-columns: minmax(0, 1fr); } .actions { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
                </style>
              </body></html>\`;
          }
          module.exports = { renderScreen };
        `);

        const gameTitleResult = await runFrontendMobileQualityGate(gameTitleDir, {
          type: 'frontend',
          label: 'Opening Story Title Screen',
          description: 'A cinematic title screen for Trash Tape Ascension, a narrative rhythm game. It renders a distinct title screen, not a booking/CRM/site template.',
          data_contract: 'Input: { beatPads, stats, saveCassette, chapters } -> Output: playable title screen HTML with data-game-screen="title-screen".',
          acceptance_criteria: ['Player can start a run, continue a save cassette, and unlock beat pads from a 390px phone viewport'],
          error_handling: ['Falls back to text-only art panels if generated images are unavailable'],
        });
        expect(gameTitleResult.passed === true, `Expected game frontend with negative booking guardrail copy to avoid scheduling-control false positives. ${gameTitleResult.summary}`);

      await writeSource(safeFrontendDir, `
        function renderScreen() {
        return \`<!doctype html>
          <html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
          <body>
            <main>
              <section class="hero">
                <h1>Book a visit in under a minute</h1>
                <p class="long-note">A very long care note keeps wrapping inside the card instead of forcing horizontal scroll on a narrow phone screen.</p>
                <button type="button">Request appointment</button>
              </section>
            </main>
            <style>
              * { box-sizing: border-box; }
              body { overflow-x: hidden; }
              main { width: 100%; max-width: 100%; padding: 18px; }
              .hero { min-width: 0; width: 100%; max-width: 100%; display: grid; gap: 12px; }
              h1 { font-size: clamp(1.8rem, 8vw, 3.2rem); overflow-wrap: anywhere; }
              .long-note { min-width: 0; max-width: 100%; overflow-wrap: anywhere; word-break: break-word; }
              @media (min-width: 760px) { .hero { grid-template-columns: minmax(0, 1fr); } }
            </style>
          </body></html>\`;
      }
      module.exports = { renderScreen };
    `);

    await writeTestSource(safeFrontendDir, `
      const moduleContract = { dataContract: 'test-only', acceptanceCriteria: ['visible UI stays clean'] };
      JSON.stringify(moduleContract);
    `);

    const safeResult = await runFrontendMobileQualityGate(safeFrontendDir, { type: 'frontend', label: 'Safe Frontend' });
    expect(safeResult.passed === true, `Expected responsive frontend with overflow safeguards and test-only JSON diagnostics to pass. ${safeResult.summary}`);

    console.log('PASS omx frontend quality gate');
  } finally {
    await rm(backendDir, { recursive: true, force: true }).catch(() => {});
    await rm(riskyFrontendDir, { recursive: true, force: true }).catch(() => {});
    await rm(diagnosticFrontendDir, { recursive: true, force: true }).catch(() => {});
      await rm(genericFrontendDir, { recursive: true, force: true }).catch(() => {});
        await rm(moduleSpecFrontendDir, { recursive: true, force: true }).catch(() => {});
        await rm(domActionFrontendDir, { recursive: true, force: true }).catch(() => {});
        await rm(bookingMissingControlsDir, { recursive: true, force: true }).catch(() => {});
        await rm(booking21stControlsDir, { recursive: true, force: true }).catch(() => {});
        await rm(vehicleNotesDir, { recursive: true, force: true }).catch(() => {});
        await rm(gameTitleDir, { recursive: true, force: true }).catch(() => {});
      await rm(safeFrontendDir, { recursive: true, force: true }).catch(() => {});
  }
}

run().catch((error) => {
  console.error('FAIL omx frontend quality gate');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
