import { consolidatePresentationFrontendNodes } from './graph-composition.js';
import type { SessionDocument } from './session-store.js';

interface RootCompositionFile {
  path: string;
  content: string;
}

interface RuntimeChannelSummary {
  id: string;
  label: string;
  type: string;
  kind: 'mobile-web' | 'whatsapp' | 'intake';
  path: string;
}

function sanitizeSegment(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'module';
}

function detectPrimaryRunnableModule(session: SessionDocument) {
  const nodes = session.graph.nodes || [];
  return (
    nodes.find((node) => (node.type || '').toLowerCase() === 'frontend')
    || nodes.find((node) => ['backend', 'security', 'external'].includes((node.type || '').toLowerCase()))
    || nodes[0]
    || null
  );
}

function detectRuntimeChannels(session: SessionDocument): RuntimeChannelSummary[] {
  const channels = new Map<string, RuntimeChannelSummary>();

  for (const node of session.graph.nodes || []) {
    const id = node.id || node.label || 'module';
    const label = node.label || id;
    const type = (node.type || '').toLowerCase();
    const haystack = `${id} ${label} ${type}`.toLowerCase();
    const isWhatsApp = haystack.includes('whatsapp');
    const isBackoffice = ['admin', 'report', 'backoffice', 'internal'].some((term) => haystack.includes(term));
    const isFrontend = (type === 'frontend' || haystack.includes('mobile') || haystack.includes('web')) && !isBackoffice;
    const isExternalIntake = type === 'external' && (haystack.includes('intake') || haystack.includes('channel'));

    if (!isWhatsApp && !isFrontend && !isExternalIntake) {
      continue;
    }

    const kind: RuntimeChannelSummary['kind'] = isWhatsApp
      ? 'whatsapp'
      : isFrontend
        ? 'mobile-web'
        : 'intake';
    const path = `modules/${sanitizeSegment(id)}`;
    channels.set(path, { id, label, type: type || 'module', kind, path });
  }

  return Array.from(channels.values());
}

function buildRootPackageJson(session: SessionDocument) {
  const primaryModule = detectPrimaryRunnableModule(session);
  const modulePrefix = primaryModule ? `modules/${sanitizeSegment(primaryModule.id || primaryModule.label)}` : null;

  const scripts: Record<string, string> = {
    bootstrap: 'node scripts/bootstrap-workspace.cjs',
    verify: 'node scripts/verify-workspace.cjs',
  };

  if (modulePrefix) {
    scripts.dev = 'node scripts/dev-workspace.cjs';
    scripts.build = 'node scripts/build-workspace.cjs';
    scripts.start = 'node scripts/start-workspace.cjs';
    scripts.smoke = 'node scripts/smoke-workspace.cjs';
  }

  return JSON.stringify({
    name: '@retrobuilder/generated-workspace',
    private: true,
    workspaces: ['modules/*'],
    scripts,
    devDependencies: {
      typescript: '^5.8.3',
      tsx: '^4.19.3',
      '@types/node': '^22.14.1',
      '@types/react': '^19.1.2',
      '@types/react-dom': '^19.1.2',
    },
  }, null, 2);
}

function buildWorkspaceEntrypointScript(
  mode: 'dev' | 'start',
  modulePath: string,
  session?: SessionDocument,
) {
  if (mode === 'start') {
    return buildWorkspaceStartScript(modulePath, session);
  }

  return `#!/usr/bin/env node

const { spawn } = require("node:child_process");

const child = spawn("npm", ["--prefix", "${modulePath}", "run", "${mode}"], {
  stdio: "inherit",
  env: { ...process.env },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
`;
}

function buildWorkspaceBuildScript(modulePath: string) {
  return `#!/usr/bin/env node

const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

function readScripts(modulePath) {
  const pkgPath = join(process.cwd(), modulePath, "package.json");
  if (!existsSync(pkgPath)) {
    return {};
  }
  return JSON.parse(readFileSync(pkgPath, "utf8")).scripts || {};
}

const scripts = readScripts("${modulePath}");
const command = scripts.build
  ? ["npm", ["--prefix", "${modulePath}", "run", "build"]]
  : scripts.verify
    ? ["npm", ["--prefix", "${modulePath}", "run", "verify", "--silent"]]
    : scripts.test
      ? ["npm", ["--prefix", "${modulePath}", "test", "--silent"]]
      : ["npm", ["run", "verify", "--silent"]];

if (!scripts.build) {
  console.log("No primary module build script found; validating generated workspace instead.");
}

const result = spawnSync(command[0], command[1], {
  stdio: "inherit",
  env: { ...process.env },
});

process.exit(result.status ?? 1);
`;
}

function buildRuntimeDemoPayloads(session: SessionDocument | undefined, projectName: string) {
  const nodes = session?.graph.nodes || [];
  const productText = [
    projectName,
    session?.manifesto,
    session?.architecture,
    session?.projectContext,
    ...nodes.flatMap((node) => [
      node.id,
      node.label,
      node.description,
      node.type,
      node.data_contract,
      ...(node.acceptance_criteria || []),
      ...(node.error_handling || []),
    ]),
  ].filter(Boolean).join(' ').toLowerCase();

  const isBarbershop = /barber|barbershop|haircut|beard|fade|line-?up|clipper|cut\s*&\s*crown/.test(productText);
  const isTattoo = /tattoo|ink|aftercare|deposit|flash|cover-up|cover up/.test(productText) && !isBarbershop;
  const isDental = /dental|dentist|orthodont|patient|clinic|tooth|teeth/.test(productText);
  const isRestaurant = /restaurant|reservation|table|host stand|dining|cafe|bistro/.test(productText);
  const isGame = /\b(game|player|playable|rhythm|beat|producer|music|cassette|album|track|song|chapter|achievement|career map|story map|level|save cassette|save slot|web audio|festival headliner)\b/i.test(productText);

  if (isGame) {
    const siteInput = {
      productName: projectName,
      title: projectName.replace(/\s+\d{8,}$/, ''),
      subtitle: 'From broken alley tapes to festival lights.',
      premise: 'A narrative rhythm game where every beat choice shifts rent pressure, crew loyalty, reputation, integrity, and the producer path from trash to success.',
      currentChapter: 'Trash Alley',
      saveCassette: 'Cassette A / rain take',
      assetSeed: 'trash-tape-001',
      stats: {
        energy: 64,
        rentPressure: 72,
        reputation: 12,
        integrity: 94,
        beatQuality: 48,
      },
      beatPads: [
        { id: 'kick', label: 'KICK', tone: 'sub rust', key: 'A' },
        { id: 'snare', label: 'SNARE', tone: 'bin lid clap', key: 'S' },
        { id: 'hat', label: 'HAT', tone: 'spray-can hiss', key: 'D' },
        { id: 'bass', label: 'BASS', tone: 'bus-window hum', key: 'F' },
      ],
      crew: [
        { name: 'Mika Wire', role: 'crate digger', loyalty: 74 },
        { name: 'June Static', role: 'street vocalist', loyalty: 61 },
        { name: 'Omar Tape', role: 'flyer king', loyalty: 48 },
      ],
      chapters: [
        { id: 'trash-alley', title: 'Trash Alley', detail: 'Find broken tapes in a rain-glowing dumpster and hear a loop nobody else hears.', risk: 'No rent cushion', reward: 'First spark' },
        { id: 'bedroom-lab', title: 'Bedroom Lab', detail: 'Wire junk speakers into a cracked laptop and turn noise into a playable beat.', risk: 'Energy drain', reward: 'Beat quality +18' },
        { id: 'basement-show', title: 'Basement Show', detail: 'Test the track under bare bulbs while the crowd decides if you are real.', risk: 'Crew doubt', reward: 'Reputation unlock' },
        { id: 'viral-leak', title: 'Viral Leak', detail: 'A phone recording explodes online before the mix is finished.', risk: 'Integrity pressure', reward: 'New listeners' },
        { id: 'label-trap', title: 'Label Trap', detail: 'Choose between a shiny contract and owning your masters.', risk: 'Ownership loss', reward: 'Fast money' },
        { id: 'festival-headliner', title: 'Festival Headliner', detail: 'Bring the trash-tape melody to a field of lights without losing the alley ghosts.', risk: 'Final set', reward: 'Legacy ending' },
      ],
      achievements: ['First loop found', 'No samples stolen'],
      accessibility: { reducedMotion: false, keyboardPads: true, silentMode: true },
    };

    return {
      sampleInput: siteInput,
      siteInput,
      context: {
        apiState: {
          status: 'playable',
          currentChapter: 'Trash Alley',
          saveStatus: 'local cassette ready',
          beatEngine: 'silent visual mode available',
        },
        gameResult: { status: 'playable-ready', saveId: 'trash-tape-demo-save' },
        metadata: { runtime: 'retrobuilder-root-runtime', domain: 'narrative-rhythm-game' },
      },
    };
  }

  if (isTattoo) {
    const shopName = 'Ink Ledger';
    const siteInput = {
      productName: projectName,
      shopName,
      brandStory: `${shopName} coordinates consults, deposits, artist prep notes, and aftercare reminders in one studio-ready flow.`,
      services: [
        { id: 'flash-consult', name: 'Flash Consultation', duration: '30 min', price: '$40 deposit' },
        { id: 'custom-piece', name: 'Custom Piece Planning', duration: '60 min', price: '$80 deposit' },
        { id: 'cover-up', name: 'Cover-up Strategy', duration: '45 min', price: '$60 deposit' },
      ],
      artists: [
        { id: 'mara', name: 'Mara Vale', specialty: 'Fine-line florals and script', nextSlot: 'Today 6:20 PM' },
        { id: 'soren', name: 'Soren Fox', specialty: 'Bold blackwork and cover-ups', nextSlot: 'Tomorrow 11:10 AM' },
      ],
      testimonials: [
        'The consult felt private, prepared, and clear about deposit timing.',
        'Aftercare reminders arrived before I even had to ask.',
      ],
      location: { address: '88 Mercer Street, Studio 4', hours: 'Tue-Sat 11:00 AM - 8:00 PM' },
      availableSlots: ['Today 6:20 PM', 'Tomorrow 11:10 AM', 'Friday 2:30 PM'],
      serviceId: 'Flash Consultation',
      artistId: 'Mara Vale',
      date: '2026-04-24',
      displayDate: 'Apr 24',
      client: {
        name: 'Riley Stone',
        phone: '+1 555 0184',
        notes: 'Fine-line botanical piece on the forearm with two reference images.',
      },
      depositRequired: true,
      reminders: ['Deposit confirmation queued', 'Aftercare checklist scheduled'],
      lastSyncedAt: 'today 10:20',
    };

    return {
      sampleInput: siteInput,
      siteInput,
      context: {
        apiState: {
          booking_status: 'ready',
          artist_availability: [{ artist: 'Mara Vale', status: 'available at 6:20 PM' }],
          reminders: [{ label: 'Deposit confirmation queued' }],
        },
        bookingResult: { status: 'success', appointmentHoldId: 'ink-ledger-demo-hold' },
        metadata: { runtime: 'retrobuilder-root-runtime', domain: 'tattoo' },
      },
    };
  }

  if (isDental) {
    const shopName = 'Pearl Desk';
    const siteInput = {
      productName: projectName,
      shopName,
      brandStory: `${shopName} keeps patient requests, appointment reminders, and follow-up notes calm, clear, and connected.`,
      services: [
        { id: 'cleaning', name: 'Preventive Cleaning', duration: '50 min', price: '$120' },
        { id: 'whitening', name: 'Whitening Consult', duration: '30 min', price: '$70' },
        { id: 'urgent-check', name: 'Urgent Tooth Check', duration: '40 min', price: '$95' },
      ],
      clinicians: [
        { id: 'dr-lee', name: 'Dr. Lee', specialty: 'Preventive care and whitening', nextSlot: 'Today 3:40 PM' },
        { id: 'dr-park', name: 'Dr. Park', specialty: 'Urgent care and restorative planning', nextSlot: 'Tomorrow 9:30 AM' },
      ],
      testimonials: [
        'Scheduling felt clear, calm, and much faster than a phone tree.',
        'The reminder included everything I needed before arriving.',
      ],
      location: { address: '214 Pearl Avenue', hours: 'Mon-Fri 8:00 AM - 6:00 PM' },
      availableSlots: ['Today 3:40 PM', 'Tomorrow 9:30 AM'],
      serviceId: 'Preventive Cleaning',
      clinicianId: 'Dr. Lee',
      date: '2026-04-24',
      displayDate: 'Apr 24',
      client: { name: 'Sam Rivera', phone: '+1 555 0191', notes: 'New patient with sensitivity on the lower right side.' },
    };

    return {
      sampleInput: siteInput,
      siteInput,
      context: {
        apiState: {
          booking_status: 'ready',
          clinician_availability: [{ clinician: 'Dr. Lee', status: 'available at 3:40 PM' }],
          reminders: [{ label: 'Patient reminder queued' }],
        },
        bookingResult: { status: 'success', appointmentHoldId: 'pearl-desk-demo-hold' },
        metadata: { runtime: 'retrobuilder-root-runtime', domain: 'dental' },
      },
    };
  }

  if (isRestaurant) {
    const shopName = 'Table Signal';
    const siteInput = {
      productName: projectName,
      shopName,
      brandStory: `${shopName} manages table holds, guest preferences, host notes, and reminder flows without losing dining-room warmth.`,
      services: [
        { id: 'counter', name: 'Counter Tasting', duration: '90 min', price: '$85 pp' },
        { id: 'booth', name: 'Corner Booth', duration: '120 min', price: '$25 hold' },
        { id: 'patio', name: 'Patio Aperitivo', duration: '75 min', price: '$20 hold' },
      ],
      hosts: [
        { id: 'nina', name: 'Nina', specialty: 'VIP seating and wine notes', nextSlot: 'Tonight 7:30 PM' },
        { id: 'omar', name: 'Omar', specialty: 'Large parties and patio flow', nextSlot: 'Tonight 8:15 PM' },
      ],
      testimonials: [
        'The host remembered our notes and the table was ready.',
        'Changing the reservation took one tap instead of a call.',
      ],
      location: { address: '41 Orchard Lane', hours: 'Daily 5:00 PM - 12:00 AM' },
      availableSlots: ['Tonight 7:30 PM', 'Tonight 8:15 PM'],
      serviceId: 'Corner Booth',
      hostId: 'Nina',
      date: '2026-04-24',
      displayDate: 'Apr 24',
      client: { name: 'Morgan Vale', phone: '+1 555 0177', notes: 'Anniversary dinner, prefers quiet corner and sparkling water on arrival.' },
    };

    return {
      sampleInput: siteInput,
      siteInput,
      context: {
        apiState: {
          booking_status: 'ready',
          table_availability: [{ host: 'Nina', status: 'corner booth ready at 7:30 PM' }],
          reminders: [{ label: 'Guest reminder queued' }],
        },
        bookingResult: { status: 'success', appointmentHoldId: 'table-signal-demo-hold' },
        metadata: { runtime: 'retrobuilder-root-runtime', domain: 'restaurant' },
      },
    };
  }

  if (isBarbershop) {
    const shopName = 'Cut & Crown';
    const siteInput = {
      shopName,
      brandStory: `${shopName} blends sharp cuts, easy booking, and neighborhood hospitality into one premium seat-side experience.`,
      services: [
        { id: 'signature-cut', name: 'The Signature Cut', duration: '45 min', price: '$48' },
        { id: 'cut-beard', name: 'Cut + Beard Shape', duration: '60 min', price: '$62' },
        { id: 'lineup', name: 'Refresh Lineup', duration: '30 min', price: '$34' },
      ],
      barbers: [
        { id: 'milo', name: 'Milo', specialty: 'Skin fades and clean lines', nextSlot: 'Today 4:30 PM' },
        { id: 'jay', name: 'Jay', specialty: 'Beard sculpting and texture', nextSlot: 'Today 5:10 PM' },
      ],
      gallery: ['Warm brass stations', 'Precision clippers', 'Soft leather chair', 'Neighborhood walk-ins'],
      testimonials: [
        'Best fade in the neighborhood and the booking flow is fast.',
        'The shop feels premium without losing the local warmth.',
      ],
      location: { address: '1248 Maple Avenue, Suite 2', hours: 'Mon-Sat 9:00 AM - 7:00 PM' },
        availableSlots: ['4:30 PM today', '5:10 PM today', '10:00 AM tomorrow'],
        serviceId: 'The Signature Cut',
        barberId: 'Milo',
        date: '2026-04-24',
        displayDate: 'Apr 24',
        client: { name: 'Jordan Client', phone: '+1 555 0148', notes: 'Prefers a low fade and beard cleanup.' },
        depositRequired: true,
        appointmentsToday: [
          { time: '08:30', client: 'Marcus Ellis', service: 'Fade + Beard Shape', barber: 'Ari', status: 'On time' },
          { time: '09:10', client: 'Jayden Cole', service: 'Line-up', barber: 'Niko', status: 'Late' },
          { time: '09:40', client: 'Elena Reed', service: 'Scalp Treatment', barber: 'Ari', status: 'Walk-in' },
        ],
        clients: [
          {
            id: 'marcus-ellis',
            name: 'Marcus Ellis',
            phone: '+1 415 555 0142',
            lastVisit: '2 weeks ago',
            daysSinceVisit: 16,
            preferredBarber: 'Ari',
            favoriteService: 'Skin fade + beard line-up',
            loyaltyTier: 'VIP Gold',
            birthday: '2026-05-03',
            note: 'Prefers a low taper, beard edge-up, and 10:30 AM rebook reminders.',
            lifetimeValue: 1180,
          },
          {
            id: 'deshawn-king',
            name: 'DeShawn King',
            phone: '+1 415 555 0187',
            lastVisit: '5 days ago',
            daysSinceVisit: 5,
            preferredBarber: 'Niko',
            favoriteService: 'Beard sculpt + hot towel',
            loyaltyTier: 'Member',
            birthday: '2026-06-11',
            note: 'Usually books after work; offer the 5:10 PM chair before the weekend rush.',
            lifetimeValue: 860,
          },
          {
            id: 'elena-reed',
            name: 'Elena Reed',
            phone: '+1 415 555 0128',
            lastVisit: 'today',
            daysSinceVisit: 0,
            preferredBarber: 'Ari',
            favoriteService: 'Scalp treatment + precision trim',
            loyaltyTier: 'New Guest',
            birthday: '2026-04-29',
            note: 'First visit converted from walk-in; send a warm thank-you and next-care tip.',
            lifetimeValue: 420,
          },
        ],
        filters: { status: 'all', barber: 'all' },
        campaigns: [
          'VIP beard-shape refresh for Marcus before the weekend',
          'After-work hot towel upgrade for DeShawn',
          'First-visit thank-you with scalp-care tips for Elena',
        ],
        revenue: { today: 1840, week: 12650 },
        queue: [
          { client: 'Walk-in: Chris', waitMinutes: 7 },
          { client: 'Walk-in: Mateo', waitMinutes: 14 },
        ],
        reminders: ['Text Marcus about 10:30 follow-up', 'Call Jayden for late arrival', 'WhatsApp Elena after first visit'],
        lastSyncedAt: 'today 08:30',
      };

    return {
      sampleInput: siteInput,
      siteInput,
      context: {
        apiState: {
          booking_status: 'ready',
          chair_availability: [{ barber: 'Milo', status: 'available at 4:30 PM' }],
          reminders: [{ label: 'WhatsApp confirmation queued' }],
        },
        bookingResult: { status: 'success', appointmentHoldId: 'cut-crown-demo-hold' },
        metadata: { runtime: 'retrobuilder-root-runtime', domain: 'barbershop' },
      },
    };
  }

  const siteInput = {
    productName: projectName,
    brandStory: `${projectName} is a generated product surface with clear customer actions, resilient fallbacks, and production-minded runtime checks.`,
    services: [
      { id: 'starter', name: 'Starter Experience', duration: '30 min', price: '$49' },
      { id: 'team', name: 'Team Workflow', duration: '60 min', price: '$99' },
      { id: 'priority', name: 'Priority Support', duration: 'same day', price: '$149' },
    ],
    people: [
      { id: 'alex', name: 'Alex', specialty: 'Customer onboarding', nextSlot: 'Today 2:00 PM' },
      { id: 'sam', name: 'Sam', specialty: 'Operations and support', nextSlot: 'Tomorrow 9:30 AM' },
    ],
    gallery: ['Product overview', 'Workflow detail', 'Customer proof'],
    testimonials: ['The experience is clear, fast, and easy to trust.'],
    location: { address: 'Demo HQ', hours: 'Mon-Fri 9:00 AM - 5:00 PM' },
    availableSlots: ['Today 2:00 PM', 'Tomorrow 9:30 AM'],
    request: { intent: 'demo', channel: 'web' },
  };

  return {
    sampleInput: siteInput,
    siteInput,
    context: {
      apiState: {
        status: 'ready',
        availability: [{ label: 'Primary lane', status: 'available' }],
        reminders: [{ label: 'Follow-up reminder queued' }],
      },
      bookingResult: { status: 'success', requestId: 'generated-demo-request' },
      metadata: { runtime: 'retrobuilder-root-runtime', domain: 'generic' },
    },
  };
}

function buildWorkspaceStartScript(modulePath: string, session?: SessionDocument) {
  const projectName = session?.name || 'Generated Retrobuilder Runtime';
  const runtimeChannels = session ? detectRuntimeChannels(session) : [];
  const demoPayloads = buildRuntimeDemoPayloads(session, projectName);

  return `#!/usr/bin/env node

const { createServer } = require("node:http");
const { existsSync, readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const modulePath = "${modulePath}";
const projectName = ${JSON.stringify(projectName)};
const runtimeChannels = ${JSON.stringify(runtimeChannels, null, 2)};
const sampleInputPayload = ${JSON.stringify(demoPayloads.sampleInput, null, 2)};
const siteInputPayload = ${JSON.stringify(demoPayloads.siteInput, null, 2)};
const runtimeContextPayload = ${JSON.stringify(demoPayloads.context, null, 2)};
const port = Number(process.env.PORT || 7777);
const host = process.env.HOST || "127.0.0.1";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function listModules() {
  const modulesDir = join(process.cwd(), "modules");
  if (!existsSync(modulesDir)) {
    return [];
  }
  return readdirSync(modulesDir)
    .sort()
    .filter((name) => existsSync(join(modulesDir, name, "package.json")));
}

function resolveModuleEntry(targetModulePath) {
  const root = join(process.cwd(), targetModulePath);
  const pkgPath = join(root, "package.json");
  const candidates = [];
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      for (const field of [pkg.main, pkg.module]) {
        if (typeof field === "string" && field.trim()) {
          candidates.push(join(root, field));
        }
      }
    } catch {}
  }
  candidates.push(
    join(root, "src", "index.js"),
    join(root, "src", "main.js"),
    join(root, "index.js"),
    join(root, "dist", "index.js"),
    join(root, "dist", "main.js")
  );
  return candidates.find((entry) => existsSync(entry)) || null;
}

function loadModule(targetModulePath) {
  const entry = resolveModuleEntry(targetModulePath);
  if (!entry) {
    return null;
  }
  try {
    return require(entry);
  } catch (error) {
    return { loadError: error instanceof Error ? error.message : String(error) };
  }
}

function loadPrimaryModule() {
  return loadModule(modulePath);
}

function findRuntimeChannel(pathname) {
  const requested = decodeURIComponent(pathname || "/").replace(/^\\/+|\\/+$/g, "");
  if (!requested) {
    return null;
  }

  return runtimeChannels.find((channel) => (
    requested === channel.id
    || requested === channel.path
    || requested === "modules/" + channel.id
  )) || null;
}

function sampleInput() {
  return clone(sampleInputPayload);
}

function siteInput() {
  return clone(siteInputPayload);
}

function previewState(primaryModule) {
  const runtimeManifest = {
    projectName,
    runtimeChannels,
    primaryModule: modulePath
  };

  if (!primaryModule || primaryModule.loadError) {
    return {
      status: "unavailable",
      reason: primaryModule && primaryModule.loadError ? primaryModule.loadError : "primary module not found",
      ...runtimeManifest
    };
  }

  const context = clone(runtimeContextPayload);

  try {
    let payload;
    if (typeof primaryModule.createMobileBookingUi === "function") {
      payload = primaryModule.createMobileBookingUi().render(sampleInput(), context);
    } else if (typeof primaryModule.process === "function") {
      payload = primaryModule.process(sampleInput(), context);
    } else {
      payload = { status: "ready", exports: Object.keys(primaryModule) };
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { status: "ready", value: payload, ...runtimeManifest };
    }
    return { ...payload, ...runtimeManifest };
  } catch (error) {
    return { status: "error", reason: error instanceof Error ? error.message : String(error), ...runtimeManifest };
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

function sendHtml(response, html) {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}

function escapeHtml(value) {
  return String(value).replace(/[<>&]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[char]));
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function runtimeChannelHref(channel) {
  if (!channel || channel.path === modulePath) {
    return "/";
  }
  return "/" + encodeURIComponent(channel.id || channel.path);
}

function renderRuntimeChannelNav(activePath = modulePath) {
  if (!runtimeChannels.length) {
    return "";
  }

  const hasPrimaryChannel = runtimeChannels.some((channel) => channel.path === modulePath);
  const channels = hasPrimaryChannel ? runtimeChannels : [
    {
      id: "primary-runtime",
      label: "Primary Runtime",
      kind: "primary",
      type: "frontend",
      path: modulePath
    },
    ...runtimeChannels
  ];

  const items = channels.map((channel, index) => {
    const active = channel.path === activePath;
    return "<a class=\\"runtime-channel-nav__item\\" href=\\"" + escapeAttribute(runtimeChannelHref(channel)) + "\\" " + (active ? "aria-current=\\"page\\" data-active=\\"true\\"" : "data-active=\\"false\\"") + ">"
      + "<span class=\\"runtime-channel-nav__index\\">" + String(index + 1).padStart(2, "0") + "</span>"
      + "<span class=\\"runtime-channel-nav__copy\\"><strong>" + escapeHtml(channel.label || channel.id || channel.path) + "</strong><small>" + escapeHtml((channel.kind || "runtime") + " / " + (channel.type || "module")) + "</small></span>"
      + "</a>";
  }).join("");

  return "<nav class=\\"runtime-channel-nav\\" data-retrobuilder-runtime-nav=\\"true\\" aria-label=\\"Generated runtime channels\\">"
    + "<style data-retrobuilder-runtime-nav-style=\\"true\\">"
    + ".runtime-channel-nav{position:sticky;top:0;z-index:2147483000;display:block;width:min(940px,calc(100% - 24px));margin:0 auto;padding:12px 0 0;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;pointer-events:none}"
    + ".runtime-channel-nav__rail{display:flex;gap:7px;align-items:center;overflow-x:auto;padding:7px;border:1px solid rgba(255,255,255,.18);border-radius:20px;background:rgba(8,10,14,.84);box-shadow:0 18px 60px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.12);backdrop-filter:blur(18px) saturate(1.3);pointer-events:auto;scrollbar-width:none}"
    + ".runtime-channel-nav__rail::-webkit-scrollbar{display:none}"
    + ".runtime-channel-nav__label{flex:0 0 auto;padding:0 10px;color:rgba(255,255,255,.6);font-size:10px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;white-space:nowrap}"
    + ".runtime-channel-nav__item{display:flex;min-width:170px;align-items:center;gap:9px;padding:9px 11px;border:1px solid rgba(255,255,255,.12);border-radius:15px;color:rgba(255,255,255,.82);text-decoration:none;background:rgba(255,255,255,.06);transition:transform .18s ease,border-color .18s ease,background .18s ease;color-scheme:dark}"
    + ".runtime-channel-nav__item:hover{transform:translateY(-1px);border-color:rgba(51,230,255,.5);background:rgba(51,230,255,.12)}"
    + ".runtime-channel-nav__item[data-active=true]{border-color:rgba(51,230,255,.78);background:linear-gradient(135deg,rgba(51,230,255,.2),rgba(255,78,205,.12));box-shadow:0 0 0 1px rgba(51,230,255,.18),0 0 24px rgba(51,230,255,.16)}"
    + ".runtime-channel-nav__index{display:grid;place-items:center;flex:0 0 auto;width:28px;height:28px;border-radius:10px;background:rgba(255,255,255,.1);color:#48f1ff;font-size:11px;font-weight:900;font-variant-numeric:tabular-nums}"
    + ".runtime-channel-nav__copy{display:grid;gap:2px;min-width:0}"
    + ".runtime-channel-nav__copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:1.1;color:currentColor}"
    + ".runtime-channel-nav__copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;color:rgba(255,255,255,.48);text-transform:uppercase;letter-spacing:.08em}"
    + "@media(max-width:640px){.runtime-channel-nav{width:calc(100% - 14px);padding-top:8px}.runtime-channel-nav__rail{border-radius:18px;padding:6px}.runtime-channel-nav__label{display:none}.runtime-channel-nav__item{min-width:148px;padding:8px 9px}.runtime-channel-nav__copy strong{font-size:11px}.runtime-channel-nav__copy small{font-size:9px}.runtime-channel-nav__index{width:26px;height:26px}}"
    + "</style>"
    + "<div class=\\"runtime-channel-nav__rail\\"><span class=\\"runtime-channel-nav__label\\">Runtime</span>" + items + "</div>"
    + "</nav>";
}

function injectRuntimeChannelNav(html, activePath = modulePath) {
  if (!html || typeof html !== "string" || html.includes('data-retrobuilder-runtime-nav="true"')) {
    return html;
  }
  const nav = renderRuntimeChannelNav(activePath);
  if (!nav) {
    return html;
  }
  const bodyOpen = html.match(/<body\\b[^>]*>/i);
  if (bodyOpen) {
    return html.replace(bodyOpen[0], bodyOpen[0] + nav);
  }
  if (html.includes("</body>")) {
    return html.replace("</body>", nav + "</body>");
  }
  return nav + html;
}

function renderRuntimeChannels() {
  if (!runtimeChannels.length) {
    return "<p>No explicit runtime channels declared.</p>";
  }

  return "<ul class=\\"channels\\">" + runtimeChannels.map((channel) => (
    "<li><strong>" + escapeHtml(channel.label) + "</strong><span>" + escapeHtml(channel.kind) + " · " + escapeHtml(channel.type) + "</span><code>" + escapeHtml(channel.path) + "</code><a href=\\"" + escapeAttribute(runtimeChannelHref(channel)) + "\\">Open channel</a></li>"
  )).join("") + "</ul>";
}

function renderRuntimeHtml(payload) {
  return "<!doctype html><html><head><meta charset=\\"utf-8\\"><meta name=\\"viewport\\" content=\\"width=device-width,initial-scale=1\\"><title>" + escapeHtml(projectName) + " Runtime</title><style>body{margin:0;font-family:ui-sans-serif,system-ui;background:#f7f1e8;color:#231f20}.shell{max-width:430px;margin:0 auto;padding:28px 20px 40px}.hero{border-radius:28px;background:#fffaf2;padding:24px;box-shadow:0 20px 60px #0002}.eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8a5b24}h1{font-size:34px;line-height:1;margin:12px 0 8px}.lede{color:#5d5147;line-height:1.55}.card{margin-top:14px;border:1px solid #ead9c0;border-radius:18px;padding:14px;background:white}.status{display:inline-flex;border-radius:999px;background:#1f7a4d;color:white;padding:7px 12px;font-size:13px}.channels{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:10px}.channels li{border-radius:14px;background:#f7f1e8;padding:12px;display:grid;gap:4px}.channels span{font-size:12px;color:#7b6048}a{color:#8f3d18;font-weight:700}code{font-size:12px;color:#4b3828;word-break:break-word}pre{white-space:pre-wrap;word-break:break-word;font-size:12px}</style></head><body><main class=\\"shell\\"><section class=\\"hero\\"><p class=\\"eyebrow\\">Generated Retrobuilder Runtime</p><h1>" + escapeHtml(projectName) + "</h1><p class=\\"lede\\">Runtime certification with explicit intake channel contracts. <a href=\\"/\\">Open generated site</a>.</p><p class=\\"status\\">ready on port " + port + "</p><div class=\\"card\\"><strong>Runtime channels</strong>" + renderRuntimeChannels() + "</div><div class=\\"card\\"><strong>Primary module</strong><p>" + escapeHtml(modulePath) + "</p></div><div class=\\"card\\"><strong>Preview payload</strong><pre>" + escapeHtml(JSON.stringify(payload, null, 2)) + "</pre></div></section></main></body></html>";
}

function renderGeneratedSite(primaryModule, activePath = modulePath) {
  if (!primaryModule || primaryModule.loadError) {
    return null;
  }
  const input = siteInput();
  try {
    if (typeof primaryModule.renderApp === "function") {
      return injectRuntimeChannelNav(primaryModule.renderApp(input), activePath);
    }
    if (typeof primaryModule.renderPortal === "function") {
      return injectRuntimeChannelNav(primaryModule.renderPortal(input), activePath);
    }
    if (typeof primaryModule.createService === "function") {
      const service = primaryModule.createService();
      if (service && typeof service.render === "function") {
        return injectRuntimeChannelNav(service.render(input), activePath);
      }
      if (service && typeof service.renderApp === "function") {
        return injectRuntimeChannelNav(service.renderApp(input), activePath);
      }
    }
  } catch (error) {
    return null;
  }
  return null;
}

const primaryModule = loadPrimaryModule();
const primaryModuleReady = Boolean(primaryModule && !primaryModule.loadError);

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname === "/api/health") {
    sendJson(response, primaryModuleReady ? 200 : 503, {
      status: primaryModuleReady ? "ready" : "unavailable",
      ok: primaryModuleReady,
      primaryModule: modulePath,
      reason: primaryModuleReady ? undefined : (primaryModule && primaryModule.loadError ? primaryModule.loadError : "primary module not found"),
      projectName,
      runtimeChannels,
      modules: listModules(),
      generatedBy: "retrobuilder-root-runtime"
    });
    return;
  }
  if (url.pathname === "/api/modules") {
    sendJson(response, 200, { modules: listModules() });
    return;
  }
  if (url.pathname === "/api/preview") {
    sendJson(response, 200, previewState(primaryModule));
    return;
  }
  const runtimeChannel = findRuntimeChannel(url.pathname);
  if (runtimeChannel) {
    const runtimeModule = loadModule(runtimeChannel.path);
    sendHtml(response, renderGeneratedSite(runtimeModule, runtimeChannel.path) || renderRuntimeHtml({
      ...previewState(runtimeModule),
      selectedChannel: runtimeChannel
    }));
    return;
  }
  if (url.pathname === "/runtime") {
    sendHtml(response, renderRuntimeHtml(previewState(primaryModule)));
    return;
  }
  if (url.pathname === "/") {
    sendHtml(response, renderGeneratedSite(primaryModule, modulePath) || renderRuntimeHtml(previewState(primaryModule)));
    return;
  }
  sendJson(response, 404, { error: "not_found" });
});

server.listen(port, host, () => {
  console.log("Retrobuilder generated runtime listening on http://" + host + ":" + port);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
`;
}

function buildWorkspaceBootstrapScript() {
  return `#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const result = spawnSync("npm", ["install"], {
  stdio: "inherit",
  env: { ...process.env },
});

process.exit(result.status ?? 1);
`;
}

function buildWorkspaceSmokeScript() {
  return `#!/usr/bin/env node

const { spawn } = require("node:child_process");
const { createServer } = require("node:net");

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("No free port")));
        return;
      }
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function main() {
  const port = Number(process.env.SMOKE_PORT || await reservePort());
  const child = spawn("node", ["scripts/start-workspace.cjs"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(port) },
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });

  try {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(stderr.trim() || stdout.trim() || "workspace start exited early");
      }
      try {
        const response = await fetch(\`http://127.0.0.1:\${port}/api/health\`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) {
          const body = await response.text().catch(() => "");
          console.log(body || \`Runtime smoke passed on port \${port}\`);
          process.exit(0);
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(stderr.trim() || stdout.trim() || "timed out waiting for /api/health");
  } finally {
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 1000);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
`;
}

function buildWorkspaceVerifyScript() {
  return `#!/usr/bin/env node

const { readdirSync, existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const modulesDir = join(process.cwd(), "modules");
const modules = readdirSync(modulesDir)
  .sort()
  .filter((name) => existsSync(join(modulesDir, name, "package.json")));

let failures = 0;

for (const name of modules) {
  const pkgPath = join(modulesDir, name, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const scripts = pkg.scripts || {};

  const command = scripts.verify
    ? ["npm", ["run", "verify", "--silent"]]
    : scripts.test
      ? ["npm", ["test", "--silent"]]
      : scripts.build
        ? ["npm", ["run", "build", "--silent"]]
        : null;

  if (!command) {
    console.log(name + ': SKIP');
    continue;
  }

  const [bin, args] = command;
  const result = spawnSync(bin, args, {
    cwd: join(modulesDir, name),
    stdio: "inherit",
    env: { ...process.env },
  });

  if (result.status === 0) {
    console.log(name + ': PASS');
    continue;
  }

  failures += 1;
  console.log(name + ': FAIL');
}

process.exit(failures === 0 ? 0 : 1);
`;
}

function buildEnvExample(session: SessionDocument) {
  const hasDatabase = session.graph.nodes.some((node) => (node.type || '').toLowerCase() === 'database');
  const hasSecurity = session.graph.nodes.some((node) => (node.type || '').toLowerCase() === 'security');
  const lines = [
    '# Generated by OMX root composition',
    'NODE_ENV=development',
    'PORT=7777',
  ];

  if (hasDatabase) {
    lines.push('DATABASE_URL=postgresql://user:password@localhost:5432/app');
  }

  if (hasSecurity) {
    lines.push('JWT_SECRET=replace-me');
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

function buildWorkspaceReadme(session: SessionDocument) {
  const primaryModule = detectPrimaryRunnableModule(session);
  const projectName = session.name || 'Generated OMX Workspace';
  const moduleName = primaryModule ? (primaryModule.label || primaryModule.id) : 'primary module';

  return `# ${projectName}

Generated OMX Workspace produced by RETROBUILDER OMX.

## Available root commands

- \`npm run verify\`
- \`npm run bootstrap\`
- \`npm run build\`
- \`npm run dev\`
- \`npm run start\`
- \`npm run smoke\`

## Primary runnable module

- ${moduleName}

## Environment

Copy \`.env.example\` to \`.env.local\` and adjust any placeholders before running the workspace.
`;
}

export function buildOmxRootComposition(session: SessionDocument): RootCompositionFile[] {
  const deliverySession = {
    ...session,
    graph: consolidatePresentationFrontendNodes(session.graph),
  };
  const primaryModule = detectPrimaryRunnableModule(deliverySession);
  const primaryModulePath = primaryModule ? `modules/${sanitizeSegment(primaryModule.id || primaryModule.label)}` : null;

  const files: RootCompositionFile[] = [
    {
      path: 'package.json',
      content: buildRootPackageJson(deliverySession),
    },
    {
      path: 'scripts/bootstrap-workspace.cjs',
      content: buildWorkspaceBootstrapScript(),
    },
    {
      path: 'scripts/verify-workspace.cjs',
      content: buildWorkspaceVerifyScript(),
    },
    {
      path: '.env.example',
      content: buildEnvExample(deliverySession),
    },
  ];

  if (primaryModulePath) {
    files.push(
      {
        path: 'scripts/dev-workspace.cjs',
        content: buildWorkspaceEntrypointScript('dev', primaryModulePath),
      },
      {
        path: 'scripts/build-workspace.cjs',
        content: buildWorkspaceBuildScript(primaryModulePath),
      },
      {
        path: 'scripts/start-workspace.cjs',
        content: buildWorkspaceEntrypointScript('start', primaryModulePath, deliverySession),
      },
      {
        path: 'scripts/smoke-workspace.cjs',
        content: buildWorkspaceSmokeScript(),
      },
    );
  }

  files.push({
    path: 'README.md',
    content: buildWorkspaceReadme(deliverySession),
  });

  return files;
}
