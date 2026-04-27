#!/usr/bin/env tsx
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runFrontendMobileQualityGate } from '../src/server/omx-frontend-quality.ts';
import { materializeTaskScaffold, runVerifyInOverlay } from '../src/server/omx-worker.ts';
import type { OmxExecutionTask } from '../src/server/omx-scheduler.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function run() {
  const require = createRequire(import.meta.url);
  const overlayPath = await mkdtemp(path.join(tmpdir(), 'omx-worker-scaffold-'));
  const task: OmxExecutionTask = {
    taskId: 'task:resilience_retry_manager',
    nodeId: 'resilience_retry_manager',
    waveId: 'wave-1',
    label: 'Resilience and Retry Manager',
    type: 'backend',
    priority: 1,
    dependsOnTaskIds: [],
    readSet: ['.omx/**'],
    writeSet: ['modules/resilience-retry-manager/**'],
    sharedArtifacts: [],
    verifyCommand: 'auto',
    completionGate: { verify: true, ownership: true, artifacts: true },
    estimatedCost: 3,
    status: 'pending',
  };
  const node = {
    id: 'resilience_retry_manager',
    label: 'Resilience and Retry Manager',
    type: 'backend',
    description: 'Coordinates retries, backoff, circuit breakers, and dead-letter handling.',
    data_contract: 'Input: {failed_job, retry_policy} -> Output: {retry_decision}',
    acceptance_criteria: ['Transient failures are retried according to policy'],
    error_handling: ['Invalid retry policy fails closed'],
  };

  const scaffold = await materializeTaskScaffold(overlayPath, task, node);
  const required = [
    'module.spec.json',
    'README.md',
    'package.json',
    'src/index.js',
    'src/index.test.js',
    'scripts/verify.cjs',
  ];

  for (const relativePath of required) {
    expect(await exists(path.join(scaffold.moduleDir, relativePath)), `Expected scaffold to create ${relativePath}.`);
  }

  const packageJson = JSON.parse(await readFile(path.join(scaffold.moduleDir, 'package.json'), 'utf8'));
  expect(packageJson.scripts.verify === 'node scripts/verify.cjs', 'Expected scaffold package to expose verify script.');
  const moduleSpec = JSON.parse(await readFile(path.join(scaffold.moduleDir, 'module.spec.json'), 'utf8'));
  expect(moduleSpec.materialization?.strategy === 'deterministic-fallback', 'Expected scaffold module spec to expose fallback materialization strategy.');
  expect(moduleSpec.materialization?.generatedBy === 'retrobuilder-deterministic-fallback', 'Expected backend scaffold module spec to identify deterministic fallback generator.');

  const indexSource = await readFile(path.join(scaffold.moduleDir, 'src/index.js'), 'utf8');
  expect(indexSource.includes('retrobuilder-deterministic-fallback'), 'Expected generated module to identify deterministic fallback.');

  const verifyReceipt = await runVerifyInOverlay(overlayPath, task);
  expect(verifyReceipt.passed, `Expected generated scaffold verify to pass: ${verifyReceipt.summary}`);
  expect(verifyReceipt.command.includes('verify'), 'Expected generated scaffold verify command to be used.');

  const frontendOverlayPath = await mkdtemp(path.join(tmpdir(), 'omx-worker-frontend-scaffold-'));
  const frontendTask: OmxExecutionTask = {
      ...task,
      taskId: 'task:public-site',
      nodeId: 'public_site',
      label: 'Cut & Crown Booking Site',
    type: 'frontend',
    readSet: [],
    writeSet: ['modules/public-site/**'],
    sharedArtifacts: [],
  };
  const frontendNode = {
      id: 'public_site',
      label: 'Cut & Crown Booking Site',
      type: 'frontend',
      description: 'Premium tattoo and barbershop public site for booking, WhatsApp contact, CRM reminders, and customer conversion.',
    data_contract: 'Input: {services, barbers, client, availableSlots} -> Output: responsive booking page',
    acceptance_criteria: ['Guests can book appointments from a 390px phone viewport'],
    error_handling: ['Long customer notes stay inside the mobile layout'],
  };

  const frontendScaffold = await materializeTaskScaffold(frontendOverlayPath, frontendTask, frontendNode);
  const frontendSpec = JSON.parse(await readFile(path.join(frontendScaffold.moduleDir, 'module.spec.json'), 'utf8'));
  expect(frontendSpec.materialization?.baselineKind === 'product-frontend', 'Expected product frontend scaffold spec to identify the frontend baseline kind.');
  expect(frontendSpec.materialization?.generatedBy === 'retrobuilder-product-frontend-baseline', 'Expected product frontend scaffold spec to identify the frontend fallback generator.');
  const frontendIndexSource = await readFile(path.join(frontendScaffold.moduleDir, 'src/index.js'), 'utf8');
  expect(frontendIndexSource.includes('function renderApp'), 'Expected frontend scaffold to expose renderApp.');
  expect(frontendIndexSource.includes('function inferDomainProfile'), 'Expected frontend scaffold to infer a domain-specific baseline.');
  expect(frontendIndexSource.includes('<form class="booking-form"'), 'Expected frontend scaffold to include a booking form.');
  expect(frontendIndexSource.includes('function renderAppointmentScheduler'), 'Expected frontend scaffold to render a translated 21st appointment scheduler.');
  expect(frontendIndexSource.includes('data-21st-pattern="appointment-scheduler date-wheel-picker"'), 'Expected frontend scaffold to carry Date Wheel Picker/Appointment Scheduler provenance.');
  expect(frontendIndexSource.includes('data-21st-pattern="button-with-icon material-ripple action-button"'), 'Expected frontend scaffold submit button to carry 21st action-button/ripple provenance.');
  expect(frontendIndexSource.includes('kinetic-button'), 'Expected frontend scaffold to include translated action-button press behavior.');
  expect(frontendIndexSource.includes('scroll-snap-type:y mandatory'), 'Expected frontend scaffold date/time picker to include wheel-style snap behavior.');
  expect(frontendIndexSource.includes('view.confirmLabel'), 'Expected frontend scaffold to render domain-specific submit actions.');
  expect(frontendIndexSource.includes('WhatsApp'), 'Expected frontend scaffold to include WhatsApp contact flow language.');
  expect(frontendIndexSource.includes('@media (max-width: 430px)'), 'Expected frontend scaffold to include narrow mobile media query.');
  expect(frontendIndexSource.includes('clamp('), 'Expected frontend scaffold to include responsive typography.');
  expect(frontendIndexSource.includes('overflow-wrap:anywhere'), 'Expected frontend scaffold to include long-copy wrapping safeguards.');
  expect(frontendIndexSource.includes('max-width:100%'), 'Expected frontend scaffold to include width containment safeguards.');

    const frontendVerifyReceipt = await runVerifyInOverlay(frontendOverlayPath, frontendTask);
    expect(frontendVerifyReceipt.passed, `Expected frontend scaffold verify to pass: ${frontendVerifyReceipt.summary}`);

    const frontendQuality = await runFrontendMobileQualityGate(frontendScaffold.moduleDir, frontendNode);
    expect(frontendQuality.passed, `Expected frontend scaffold to pass mobile product quality gate: ${frontendQuality.summary}`);
    const frontendApi = require(path.join(frontendScaffold.moduleDir, 'src/index.js'));
    const frontendHtml = frontendApi.renderApp({});
    expect(/Cut &amp; Crown|Cut & Crown/.test(frontendHtml), 'Expected mixed tattoo/barbershop wording to preserve the explicit Cut & Crown brand.');
    expect(/Barbershop CRM \+ booking/.test(frontendHtml), 'Expected barbershop intent to win for Cut & Crown even when tattoo appears in the brief.');
    expect(!/Ink Ledger/.test(frontendHtml), 'Expected mixed tattoo/barbershop Cut & Crown brief not to leak Ink Ledger fallback copy.');

  const tattooOverlayPath = await mkdtemp(path.join(tmpdir(), 'omx-worker-tattoo-scaffold-'));
  const tattooTask: OmxExecutionTask = {
    ...frontendTask,
    taskId: 'task:tattoo-public-site',
    nodeId: 'tattoo_public_site',
    label: 'Ink Ledger Tattoo Booking Site',
    writeSet: ['modules/tattoo-public-site/**'],
  };
  const tattooNode = {
    id: 'tattoo_public_site',
    label: 'Ink Ledger Tattoo Booking Site',
    type: 'frontend',
    description: 'Public tattoo studio site with artist consultation booking, deposits, aftercare reminders, and CRM intake.',
    data_contract: 'Input: {services, artists, client, availableSlots} -> Output: responsive tattoo consultation page',
    acceptance_criteria: ['Guests can request tattoo consultations from a 390px phone viewport'],
    error_handling: ['Long tattoo idea notes stay inside the mobile layout'],
  };

  const tattooScaffold = await materializeTaskScaffold(tattooOverlayPath, tattooTask, tattooNode);
  const tattooApi = require(path.join(tattooScaffold.moduleDir, 'src/index.js'));
  const tattooHtml = tattooApi.renderApp({});
  const tattooHtmlWithRuntimeName = tattooApi.renderApp({
    productName: 'Ink Ledger Tattoo Studio CRM + Booking 1777128443350',
    shopName: 'Ink Ledger',
  });
  expect(/Ink Ledger/.test(tattooHtml), 'Expected tattoo scaffold to render tattoo-domain brand copy.');
  expect(/Private tattoo booking \+ artist CRM/.test(tattooHtml), 'Expected tattoo scaffold to render tattoo-domain eyebrow copy.');
  expect(/Flash Consultation/.test(tattooHtml), 'Expected tattoo scaffold to render tattoo-domain services.');
  expect(/Artist<select name="person">/.test(tattooHtml), 'Expected tattoo scaffold to label providers as artists.');
  expect(/date-wheel-picker/.test(tattooHtml), 'Expected tattoo scaffold to render Date Wheel Picker/Appointment Scheduler UI.');
  expect(/data-21st-pattern="button-with-icon material-ripple action-button"/.test(tattooHtml), 'Expected tattoo scaffold to render translated 21st action button UI.');
  expect(/kinetic-button/.test(tattooHtml), 'Expected tattoo scaffold to render kinetic action-button press behavior.');
  expect(/Confirm consultation/.test(tattooHtml), 'Expected tattoo scaffold to render tattoo-domain submit copy.');
  expect(/Deposit confirmation and aftercare follow-up/.test(tattooHtml), 'Expected tattoo scaffold to render tattoo-domain reminder copy.');
  expect(/<title>Ink Ledger booking<\/title>/.test(tattooHtmlWithRuntimeName), 'Expected explicit shopName to win over runtime project names in the browser title.');
  expect(!/1777128443350/.test(tattooHtmlWithRuntimeName), 'Expected generated runtime suffixes to stay out of customer-facing tattoo HTML.');
  expect(!/Signature Cut|Cut \+ Beard|low fade|beard cleanup|Barbershop CRM/i.test(tattooHtml), 'Expected tattoo scaffold not to leak barbershop copy.');

  const tattooResult = tattooApi.process({
    serviceId: 'Flash Consultation',
    artistId: 'Mara Vale',
    client: { name: 'Riley Stone' },
  }, { now: '2026-04-24T11:00:00.000Z' });
  expect(tattooResult.booking.person === 'Mara Vale', 'Expected tattoo process result to preserve artist selection.');
  expect(tattooResult.booking.service === 'Flash Consultation', 'Expected tattoo process result to preserve tattoo service selection.');

  const tattooVerifyReceipt = await runVerifyInOverlay(tattooOverlayPath, tattooTask);
  expect(tattooVerifyReceipt.passed, `Expected tattoo frontend scaffold verify to pass: ${tattooVerifyReceipt.summary}`);

  const tattooQuality = await runFrontendMobileQualityGate(tattooScaffold.moduleDir, tattooNode);
  expect(tattooQuality.passed, `Expected tattoo frontend scaffold to pass mobile product quality gate: ${tattooQuality.summary}`);

  const gameOverlayPath = await mkdtemp(path.join(tmpdir(), 'omx-worker-game-scaffold-'));
  const gameTask: OmxExecutionTask = {
    ...frontendTask,
    taskId: 'task:beat-lab-play-surface',
    nodeId: 'beat_lab_play_surface',
    label: 'Beat Lab Play Surface',
    writeSet: ['modules/beat-lab-play-surface/**'],
  };
  const gameNode = {
    id: 'beat_lab_play_surface',
    label: 'Beat Lab Play Surface',
    type: 'frontend',
    description: 'Playable rhythm game surface for a music producer rising from trash tapes to festival success, with beat pads, save cassette, generated cover art, career chapters, achievements, and Web Audio fallback.',
    data_contract: 'Input: { beatPads, playerStats, chapters, saveCassette } -> Output: playable rhythm game screen',
    acceptance_criteria: ['Player can trigger beat pads and see game stats without any booking or CRM language'],
    error_handling: ['If Web Audio is unavailable, preserve silent visual rhythm mode'],
  };

  const gameScaffold = await materializeTaskScaffold(gameOverlayPath, gameTask, gameNode);
  const gameSpec = JSON.parse(await readFile(path.join(gameScaffold.moduleDir, 'module.spec.json'), 'utf8'));
  expect(gameSpec.materialization?.baselineKind === 'game-frontend', 'Expected game frontend scaffold spec to identify the game baseline kind.');
  expect(gameSpec.materialization?.generatedBy === 'retrobuilder-game-frontend-baseline', 'Expected game frontend scaffold spec to identify the game fallback generator.');
  const gameApi = require(path.join(gameScaffold.moduleDir, 'src/index.js'));
  const gameHtml = gameApi.renderApp({ productName: 'Trash Tape Ascension', currentChapter: 'Bedroom Lab' });
  expect(/data-product-domain="narrative-rhythm-game"/.test(gameHtml), 'Expected game scaffold to render a narrative rhythm game surface.');
  expect(/data-game-screen="beat-lab"/.test(gameHtml), 'Expected beat lab scaffold to identify the beat-lab screen variant.');
  expect(/beat-lab-focus/.test(gameHtml), 'Expected beat lab scaffold to render a beat-focused command deck.');
  expect(/transport-strip/.test(gameHtml), 'Expected beat lab scaffold to render play-session transport state.');
  expect(/beat-pad-grid/.test(gameHtml), 'Expected game scaffold to render beat-pad controls.');
  expect(/career-map/.test(gameHtml), 'Expected game scaffold to render a career progression map.');
  expect(/data-generated-asset="inline-svg"/.test(gameHtml), 'Expected game scaffold to render self-contained generated SVG assets.');
  expect(!/class="booking-form"|class="appointment-scheduler"|date-wheel-picker|Barbershop CRM|Confirm booking|CRM reminders|Signature Cut|Cut \+ Beard/i.test(gameHtml), 'Expected game scaffold not to leak booking/barbershop UI.');
  expect(!/not booking|without any booking|must not|avoid all/i.test(gameHtml), 'Expected game scaffold not to leak negative prompt guardrails into player-facing copy.');

  const gameResult = gameApi.process({ currentChapter: 'Basement Show', stats: { beatQuality: 88 } }, { now: '2026-04-24T11:30:00.000Z' });
  expect(gameResult.status === 'playable-ready', 'Expected game process result to expose playable-ready status.');
  expect(gameResult.game.currentChapter === 'Basement Show', 'Expected game process result to preserve game chapter.');

  const gameVerifyReceipt = await runVerifyInOverlay(gameOverlayPath, gameTask);
  expect(gameVerifyReceipt.passed, `Expected game frontend scaffold verify to pass: ${gameVerifyReceipt.summary}`);

  const titleOverlayPath = await mkdtemp(path.join(tmpdir(), 'omx-worker-game-title-scaffold-'));
  const titleTask: OmxExecutionTask = {
    ...frontendTask,
    taskId: 'task:opening-story-title-screen',
    nodeId: 'opening_story_title_screen',
    label: 'Trash Tape Ascension Title Screen',
    writeSet: ['modules/opening-story-title-screen/**'],
  };
  const titleNode = {
    ...gameNode,
    id: 'opening_story_title_screen',
    label: 'Trash Tape Ascension Title Screen',
    description: 'Playable title screen for a narrative rhythm game with start run, continue cassette, cinematic story boot sequence, chapter selection, generated cover-art panels, career pressure, and achievements.',
    data_contract: 'Input: { beatPads, stats, saveCassette, chapters, generatedAssets } -> Output: playable title screen HTML with data-game-screen="title-screen".',
  };
  const titleScaffold = await materializeTaskScaffold(titleOverlayPath, titleTask, titleNode);
  const titleApi = require(path.join(titleScaffold.moduleDir, 'src/index.js'));
  const titleHtml = titleApi.renderApp({
    productName: 'Trash Tape Ascension',
    chapters: [{ id: 'trash-alley', title: 'Trash Alley' }],
    achievements: ['First loop found'],
  });
  expect(/data-game-screen="title-screen"/.test(titleHtml), 'Expected title scaffold to identify the title-screen variant.');
  expect(/title-screen-cinematic/.test(titleHtml), 'Expected title scaffold to render a cinematic boot layer.');

  const careerOverlayPath = await mkdtemp(path.join(tmpdir(), 'omx-worker-game-career-scaffold-'));
  const careerTask: OmxExecutionTask = {
    ...frontendTask,
    taskId: 'task:career-story-map',
    nodeId: 'career_story_map',
    label: 'Career Story Map',
    writeSet: ['modules/career-story-map/**'],
  };
  const careerNode = {
    ...gameNode,
    id: 'career_story_map',
    label: 'Career Story Map',
    description: 'Career map campaign screen with chapters, achievements, crew consequences, and story branch progression.',
  };
  const careerScaffold = await materializeTaskScaffold(careerOverlayPath, careerTask, careerNode);
  const careerApi = require(path.join(careerScaffold.moduleDir, 'src/index.js'));
  const careerHtml = careerApi.renderApp({ productName: 'Trash Tape Ascension' });
  expect(/data-game-screen="career-map"/.test(careerHtml), 'Expected career scaffold to identify the career-map variant.');
  expect(/career-map-campaign/.test(careerHtml), 'Expected career scaffold to render a campaign overview.');
  expect(/campaign-stats/.test(careerHtml), 'Expected career scaffold to render campaign stats.');

  console.log('PASS omx worker scaffold contract');
}

run();
