#!/usr/bin/env tsx
import { buildOmxRootComposition } from '../src/server/omx-root-composition.ts';
import type { SessionDocument } from '../src/server/session-store.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function createSession(): SessionDocument {
  return {
    id: 'session-root-compose',
    name: 'Root Composition',
    source: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    manifesto: 'Generate a runnable root wrapper.',
    architecture: 'Modules plus root composition layer.',
    projectContext: 'test',
    graph: {
      nodes: [
        { id: 'main-frontend', label: 'Main Frontend', type: 'frontend', group: 1, status: 'pending', priority: 1 },
        { id: 'whatsapp-intake', label: 'WhatsApp Intake Channel', type: 'external', group: 1, status: 'pending', priority: 2 },
        { id: 'admin-reporting', label: 'Admin Panel and Operational Reporting', type: 'frontend', group: 1, status: 'pending', priority: 2 },
        { id: 'artist-service', label: 'Artist Service', type: 'backend', group: 1, status: 'pending', priority: 2 },
      ],
      links: [],
    },
  } as SessionDocument;
}

function createBackendOnlySession(): SessionDocument {
  return {
    id: 'session-root-compose-backend',
    name: 'Root Composition Backend',
    source: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    manifesto: 'Generate a runnable root wrapper for backend-only graph.',
    architecture: 'Backend modules plus root composition layer.',
    projectContext: 'test',
    graph: {
      nodes: [
        { id: 'api-core', label: 'API Core', type: 'backend', group: 1, status: 'pending', priority: 1 },
        { id: 'audit-log', label: 'Audit Log', type: 'backend', group: 1, status: 'pending', priority: 2 },
      ],
      links: [],
    },
  } as SessionDocument;
}

function createBarbershopSession(): SessionDocument {
  return {
    id: 'session-root-compose-barbershop',
    name: 'Cut & Crown Barbershop CRM + Booking',
    source: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    manifesto: 'Barbershop CRM, public booking, appointment holds, and WhatsApp reminders.',
    architecture: 'A mobile-first barbershop site with CRM, scheduler, booking API, database, reminders, and privacy.',
    projectContext: 'barbershop runtime demo payload test',
    graph: {
      nodes: [
        {
          id: 'public-site',
          label: 'Cut & Crown Public Booking Site',
          type: 'frontend',
          group: 1,
          status: 'pending',
          priority: 1,
          description: 'A premium public website for a neighborhood barbershop.',
          data_contract: 'Input: { services: Array<{name: string}>, barbers: Array<{name: string}>, availableSlots: string[] }',
        },
        { id: 'reminders-channel', label: 'SMS and WhatsApp Reminder Channel', type: 'external', group: 1, status: 'pending', priority: 2 },
      ],
      links: [],
    },
  } as SessionDocument;
}

function createTattooSession(): SessionDocument {
  return {
    id: 'session-root-compose-tattoo',
    name: 'Ink Ledger Tattoo Studio CRM + Booking',
    source: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    manifesto: 'Tattoo studio CRM, artist consult booking, deposit reminders, aftercare, and public site.',
    architecture: 'A mobile-first tattoo studio site with artist scheduling, intake, reminders, and CRM notes.',
    projectContext: 'tattoo runtime demo payload test',
    graph: {
      nodes: [
        {
          id: 'public-site',
          label: 'Ink Ledger Tattoo Booking Site',
          type: 'frontend',
          group: 1,
          status: 'pending',
          priority: 1,
          description: 'A premium public website for a tattoo studio.',
          data_contract: 'Input: { services: Array<{name: string}>, artists: Array<{name: string}>, availableSlots: string[] }',
        },
        { id: 'deposit-reminders', label: 'Deposit and Aftercare Reminder Channel', type: 'external', group: 1, status: 'pending', priority: 2 },
      ],
      links: [],
    },
  } as SessionDocument;
}

function createGameSession(): SessionDocument {
  return {
    id: 'session-root-compose-game',
    name: 'Trash Tape Ascension Game',
    source: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    manifesto: 'Narrative rhythm game about a music producer rising from alley trash tapes to festival success.',
    architecture: 'Playable title screen, beat lab, career map, progression engine, generated assets, and save cassettes.',
    projectContext: 'game runtime demo payload test',
    graph: {
      nodes: [
        {
          id: 'opening-story-title-screen',
          label: 'Opening Story Title Screen',
          type: 'frontend',
          group: 1,
          status: 'pending',
          priority: 1,
          description: 'A cinematic game title screen with beat pads, save cassette state, generated cover art, and chapter selection.',
          data_contract: 'Input: { beatPads, stats, saveCassette, chapters } -> Output: playable game title screen',
        },
        { id: 'beat-lab-play-surface', label: 'Beat Lab Play Surface', type: 'frontend', group: 1, status: 'pending', priority: 2 },
        { id: 'save-achievement-storage', label: 'Save and Achievement Storage', type: 'database', group: 1, status: 'pending', priority: 3 },
      ],
      links: [],
    },
  } as SessionDocument;
}

function run() {
  const files = buildOmxRootComposition(createSession());
  const backendFiles = buildOmxRootComposition(createBackendOnlySession());
  const barbershopFiles = buildOmxRootComposition(createBarbershopSession());
  const tattooFiles = buildOmxRootComposition(createTattooSession());
  const gameFiles = buildOmxRootComposition(createGameSession());
  const pkg = files.find((file) => file.path === 'package.json');
  const bootstrap = files.find((file) => file.path === 'scripts/bootstrap-workspace.cjs');
  const verify = files.find((file) => file.path === 'scripts/verify-workspace.cjs');
  const dev = files.find((file) => file.path === 'scripts/dev-workspace.cjs');
  const build = files.find((file) => file.path === 'scripts/build-workspace.cjs');
  const start = files.find((file) => file.path === 'scripts/start-workspace.cjs');
  const smoke = files.find((file) => file.path === 'scripts/smoke-workspace.cjs');
  const envExample = files.find((file) => file.path === '.env.example');
  const readme = files.find((file) => file.path === 'README.md');
  expect(pkg, 'Expected root composition to generate package.json.');
  expect(bootstrap, 'Expected root composition to generate bootstrap-workspace.cjs.');
  expect(verify, 'Expected root composition to generate verify-workspace.cjs.');
  expect(dev, 'Expected root composition to generate dev-workspace.cjs when a primary frontend exists.');
  expect(build, 'Expected root composition to generate build-workspace.cjs when a primary frontend exists.');
  expect(start, 'Expected root composition to generate start-workspace.cjs when a primary frontend exists.');
  expect(smoke, 'Expected root composition to generate smoke-workspace.cjs when a primary frontend exists.');
  expect(envExample, 'Expected root composition to generate .env.example.');
  expect(readme, 'Expected root composition to generate README.md.');
  expect(pkg!.content.includes('"workspaces"'), 'Expected root package to declare workspaces.');
  expect(pkg!.content.includes('"bootstrap": "node scripts/bootstrap-workspace.cjs"'), 'Expected root package to expose workspace bootstrap.');
  expect(pkg!.content.includes('"dev": "node scripts/dev-workspace.cjs"'), 'Expected root package to proxy dev through the workspace entrypoint wrapper.');
  expect(pkg!.content.includes('"build": "node scripts/build-workspace.cjs"'), 'Expected root package to proxy build through the workspace entrypoint wrapper.');
  expect(pkg!.content.includes('"start": "node scripts/start-workspace.cjs"'), 'Expected root package to proxy start through the workspace entrypoint wrapper.');
  expect(pkg!.content.includes('"smoke": "node scripts/smoke-workspace.cjs"'), 'Expected root package to expose runtime smoke.');
  expect(pkg!.content.includes('"verify": "node scripts/verify-workspace.cjs"'), 'Expected root package to expose workspace verify.');
  expect(bootstrap!.content.includes('spawnSync("npm", ["install"]'), 'Expected bootstrap workspace wrapper to run npm install at the workspace root.');
  expect(verify!.content.includes('modulesDir'), 'Expected verify workspace script to scan modules/.');
  expect(verify!.content.includes('scripts.verify'), 'Expected verify workspace script to prefer module verify scripts.');
  expect(dev!.content.includes('npm", ["--prefix", "modules/main-frontend", "run", "dev"]'), 'Expected dev workspace wrapper to proxy to the primary frontend module.');
  expect(build!.content.includes('No primary module build script found; validating generated workspace instead.'), 'Expected build workspace wrapper to fall back when a primary module has no build script.');
  expect(build!.content.includes('"--prefix", "modules/main-frontend"'), 'Expected build workspace wrapper to target the primary frontend module when possible.');
  expect(start!.content.includes('createServer'), 'Expected start workspace wrapper to expose a guaranteed HTTP runtime.');
    expect(start!.content.includes('/api/health'), 'Expected start workspace wrapper to expose /api/health.');
    expect(start!.content.includes('function resolveModuleEntry(targetModulePath)'), 'Expected start workspace wrapper to resolve package main/module and common generated entrypoints.');
    expect(start!.content.includes('join(root, "src", "main.js")'), 'Expected start workspace wrapper to support src/main.js entrypoints, not only src/index.js.');
    expect(start!.content.includes('primaryModuleReady ? 200 : 503'), 'Expected health to fail when the primary generated module cannot actually load.');
    expect(start!.content.includes('url.pathname === "/runtime"'), 'Expected start workspace wrapper to keep runtime certification on /runtime.');
    expect(start!.content.includes('renderGeneratedSite(primaryModule, modulePath)'), 'Expected root route to serve the generated site when renderApp is available.');
    expect(start!.content.includes('function renderRuntimeChannelNav(activePath = modulePath)'), 'Expected generated sites to receive a runtime channel switcher.');
    expect(start!.content.includes('data-retrobuilder-runtime-nav="true"'), 'Expected generated runtime channel switcher to mark itself for idempotent injection.');
    expect(start!.content.includes('position:sticky;top:0'), 'Expected generated runtime channel switcher to stay in document flow instead of covering generated UI.');
    expect(start!.content.includes('html.match(/<body\\b[^>]*>/i)'), 'Expected generated runtime channel switcher to use a literal word-boundary escape when matching <body>.');
    expect(start!.content.includes('html.replace(bodyOpen[0], bodyOpen[0] + nav)'), 'Expected generated runtime channel switcher to inject immediately after the body opens.');
    expect(start!.content.includes('function injectRuntimeChannelNav(html, activePath = modulePath)'), 'Expected generated site rendering to inject the runtime channel switcher.');
    expect(start!.content.includes('function findRuntimeChannel(pathname)'), 'Expected start workspace wrapper to route generated runtime channels by URL.');
    expect(start!.content.includes('loadModule(runtimeChannel.path)'), 'Expected generated runtime channel routes to load each channel module.');
    expect(start!.content.includes('renderGeneratedSite(runtimeModule, runtimeChannel.path)'), 'Expected generated runtime channel routes to mark the active channel in the switcher.');
    expect(start!.content.includes('requested === "modules/" + channel.id'), 'Expected runtime channel routes to support /modules/:id aliases.');
    expect(start!.content.includes('typeof primaryModule.renderApp === "function"'), 'Expected root route to prefer renderApp when a module exposes it.');
  expect(start!.content.includes('typeof primaryModule.renderPortal === "function"'), 'Expected root route to support renderPortal as a generated product fallback.');
  expect(start!.content.includes('typeof primaryModule.createService === "function"'), 'Expected root route to support createService().render as a generated product fallback.');
  expect(start!.content.includes('typeof service.render === "function"'), 'Expected root route to render service-backed product HTML before falling back to runtime diagnostics.');
  expect(start!.content.includes('modules/main-frontend'), 'Expected start workspace wrapper to load the primary frontend module.');
  expect(start!.content.includes('projectName = "Root Composition"'), 'Expected start workspace wrapper to expose the generated project name.');
    expect(start!.content.includes('Runtime channels'), 'Expected start workspace wrapper to render runtime channels in the preview UI.');
    expect(start!.content.includes('modules/whatsapp-intake'), 'Expected start workspace wrapper to expose WhatsApp as a runtime channel.');
    expect(start!.content.includes('mobile-web'), 'Expected start workspace wrapper to expose mobile/web as a runtime channel.');
    expect(!start!.content.includes('"path": "modules/admin-reporting"'), 'Expected backoffice frontends to stay out of the public intake channel summary.');
    expect(!/patient|CasaCare|Bakery IT|daily warm bread|caregiver|Cliente Bakery/.test(start!.content), 'Expected generic root runtime demo payloads to avoid stale domain copy.');
    expect(start!.content.includes('runtimeChannels'), 'Expected start workspace wrapper APIs to expose runtime channels.');
  expect(smoke!.content.includes("fetch(`http://127.0.0.1:${port}/api/health`"), 'Expected workspace smoke wrapper to probe /api/health.');
  expect(envExample!.content.includes('NODE_ENV=development'), 'Expected .env.example to include NODE_ENV.');
  expect(envExample!.content.includes('PORT=7777'), 'Expected .env.example to include PORT.');
  expect(readme!.content.startsWith('# Root Composition\n'), 'Expected README.md to use the project name as its title.');
  expect(readme!.content.includes('Generated OMX Workspace'), 'Expected README.md to explain the generated workspace entrypoint.');
  expect(readme!.content.includes('npm run bootstrap'), 'Expected README.md to document the bootstrap command.');
  expect(readme!.content.includes('npm run smoke'), 'Expected README.md to document the runtime smoke command.');
  const backendPkg = backendFiles.find((file) => file.path === 'package.json');
  const backendDev = backendFiles.find((file) => file.path === 'scripts/dev-workspace.cjs');
  const backendBuild = backendFiles.find((file) => file.path === 'scripts/build-workspace.cjs');
  const backendStart = backendFiles.find((file) => file.path === 'scripts/start-workspace.cjs');
  const backendReadme = backendFiles.find((file) => file.path === 'README.md');
  expect(backendPkg!.content.includes('"dev": "node scripts/dev-workspace.cjs"'), 'Expected backend-only root package to expose dev wrapper.');
  expect(backendPkg!.content.includes('"start": "node scripts/start-workspace.cjs"'), 'Expected backend-only root package to expose start wrapper.');
  expect(backendBuild!.content.includes('modules/api-core'), 'Expected backend-only build wrapper to target the first runnable backend module.');
  expect(backendDev!.content.includes('modules/api-core'), 'Expected backend-only dev wrapper to target the first runnable backend module.');
  expect(backendStart!.content.includes('modules/api-core'), 'Expected backend-only start wrapper to load the first runnable backend module.');
    expect(backendStart!.content.includes('/api/health'), 'Expected backend-only start wrapper to expose health even when the module is not a server.');
    expect(backendReadme!.content.includes('Primary runnable module'), 'Expected backend-only README to describe the primary runnable module.');
    expect(backendReadme!.content.includes('API Core'), 'Expected backend-only README to point at the first runnable backend module.');
    const barbershopStart = barbershopFiles.find((file) => file.path === 'scripts/start-workspace.cjs');
    expect(barbershopStart, 'Expected barbershop root composition to generate start-workspace.cjs.');
      expect(barbershopStart!.content.includes('The Signature Cut'), 'Expected barbershop runtime demo payload to include a domain-specific service.');
      expect(barbershopStart!.content.includes('"shopName": "Cut & Crown"'), 'Expected barbershop runtime demo payload to pass a clean customer-facing brand name.');
      expect(barbershopStart!.content.includes('Cut & Crown blends sharp cuts'), 'Expected barbershop runtime demo payload to keep generated test names out of brand story copy.');
      expect(barbershopStart!.content.includes('"serviceId": "The Signature Cut"'), 'Expected barbershop runtime demo payload to pass customer-facing service copy to generated modules.');
      expect(barbershopStart!.content.includes('"barberId": "Milo"'), 'Expected barbershop runtime demo payload to pass customer-facing barber copy to generated modules.');
      expect(barbershopStart!.content.includes('"date": "2026-04-24"'), 'Expected barbershop runtime demo payload to use a valid HTML date input value.');
      expect(barbershopStart!.content.includes('"displayDate": "Apr 24"'), 'Expected barbershop runtime demo payload to keep concise customer-facing date copy available.');
      expect(barbershopStart!.content.includes('"appointmentsToday"'), 'Expected barbershop runtime demo payload to populate CRM appointment arrays.');
      expect(barbershopStart!.content.includes('"revenue"'), 'Expected barbershop runtime demo payload to populate CRM revenue data.');
      expect(barbershopStart!.content.includes('"reminders"'), 'Expected barbershop runtime demo payload to populate reminder/channel data.');
      expect(barbershopStart!.content.includes('"phone": "+1 415 555 0142"'), 'Expected barbershop retention payload to include client phone data.');
      expect(barbershopStart!.content.includes('"preferredBarber": "Ari"'), 'Expected barbershop retention payload to include preferred barber data.');
      expect(barbershopStart!.content.includes('"favoriteService": "Skin fade + beard line-up"'), 'Expected barbershop retention payload to include favorite service data.');
      expect(barbershopStart!.content.includes('"filters": {'), 'Expected barbershop retention payload to satisfy generated retention filter contracts.');
      expect(barbershopStart!.content.includes('"barber": "all"'), 'Expected barbershop retention payload to default to all barbers.');
      expect(barbershopStart!.content.includes('"campaigns"'), 'Expected barbershop retention payload to include campaign suggestions.');
      expect(barbershopStart!.content.includes('WhatsApp confirmation queued'), 'Expected barbershop runtime context to include domain-specific reminders.');
    expect(!/patient|CasaCare|Bakery IT|daily warm bread|caregiver|Cliente Bakery/.test(barbershopStart!.content), 'Expected barbershop runtime demo payload to avoid stale domain copy.');
    const tattooStart = tattooFiles.find((file) => file.path === 'scripts/start-workspace.cjs');
    expect(tattooStart, 'Expected tattoo root composition to generate start-workspace.cjs.');
    expect(tattooStart!.content.includes('Flash Consultation'), 'Expected tattoo runtime demo payload to include tattoo-domain service copy.');
    expect(tattooStart!.content.includes('"shopName": "Ink Ledger"'), 'Expected tattoo runtime demo payload to pass a clean customer-facing brand name.');
    expect(tattooStart!.content.includes('Ink Ledger coordinates consults'), 'Expected tattoo runtime demo payload to keep generated test names out of brand story copy.');
    expect(tattooStart!.content.includes('"artistId": "Mara Vale"'), 'Expected tattoo runtime demo payload to pass artist selection to generated modules.');
    expect(tattooStart!.content.includes('"domain": "tattoo"'), 'Expected tattoo runtime context to identify the tattoo domain.');
    expect(tattooStart!.content.includes('Aftercare checklist scheduled'), 'Expected tattoo runtime demo payload to include aftercare reminder data.');
    expect(!/The Signature Cut|Cut \+ Beard|low fade|beard cleanup|preferredBarber/i.test(tattooStart!.content), 'Expected tattoo runtime demo payload not to leak barbershop copy.');
    const gameStart = gameFiles.find((file) => file.path === 'scripts/start-workspace.cjs');
    expect(gameStart, 'Expected game root composition to generate start-workspace.cjs.');
    expect(gameStart!.content.includes('modules/product-web-app'), 'Expected section-heavy game root runtime to target the consolidated product web app module.');
    expect(!gameStart!.content.includes('modules/opening-story-title-screen'), 'Expected section-heavy game root runtime not to target the fragmented title-screen section module.');
    expect(gameStart!.content.includes('"domain": "narrative-rhythm-game"'), 'Expected game runtime context to identify the game domain.');
    expect(gameStart!.content.includes('"beatPads"'), 'Expected game runtime demo payload to include beat-pad controls.');
    expect(gameStart!.content.includes('"saveCassette": "Cassette A / rain take"'), 'Expected game runtime demo payload to include save cassette state.');
    expect(gameStart!.content.includes('"currentChapter": "Trash Alley"'), 'Expected game runtime demo payload to include chapter state.');
    expect(gameStart!.content.includes('From broken alley tapes to festival lights.'), 'Expected game runtime demo payload to include game-specific story copy.');
    expect(!/The Signature Cut|Flash Consultation|Corner Booth|appointmentHoldId|booking_status|preferredBarber/i.test(gameStart!.content), 'Expected game runtime demo payload not to leak service booking copy.');
    console.log('PASS omx root composition contract');
  }

run();
