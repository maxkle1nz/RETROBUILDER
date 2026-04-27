import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, stat, cp, copyFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { assertTaskOwnership, suggestOwnerCandidates, type OmxOwnershipManifest } from './omx-ownership.js';
import type { OmxExecutionTask } from './omx-scheduler.js';

export interface OmxWorkerLease {
  workerId: string;
  taskId: string;
  nodeId: string;
  overlayPath: string;
  taskRuntimeDir: string;
  startedAt: string;
  heartbeatAt: string;
  state: 'starting' | 'running' | 'verifying' | 'idle' | 'failed';
}

export interface OmxArtifactManifestEntry {
  relativePath: string;
  lines: number;
}

export interface OmxArtifactManifest {
  taskId: string;
  entries: OmxArtifactManifestEntry[];
  totalFiles: number;
  totalLines: number;
}

export interface OmxVerifyReceipt {
  taskId: string;
  passed: boolean;
  command: string;
  summary: string;
  verifiedAt: string;
}

export interface OmxMergeReceipt {
  taskId: string;
  applied: boolean;
  appliedPaths: string[];
  rejectedPaths: string[];
  reason?: string;
  ownerCandidates?: string[];
  mergedAt: string;
}

export interface PrepareTaskWorkspaceOptions {
  copyOmxState?: boolean;
  externalRuntimeRoot?: string;
}

interface WorkerCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

function sanitizeSegment(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'module';
}

function nowIso() {
  return new Date().toISOString();
}

function modulePrefix(task: OmxExecutionTask) {
  const pattern = task.writeSet[0] || `modules/${sanitizeSegment(task.nodeId)}/**`;
  return pattern.replace(/\/\*\*$/, '');
}

function packageNameForTask(task: OmxExecutionTask) {
  return `@retrobuilder/${sanitizeSegment(task.nodeId || task.label)}`;
}

function buildFallbackIndexSource() {
  return `'use strict';

const moduleSpec = require('../module.spec.json');

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function validateInput(input) {
  const errors = [];
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    errors.push('input must be an object');
  }
  return { ok: errors.length === 0, errors };
}

function process(input = {}, context = {}) {
  const validation = validateInput(input);
  return {
    moduleId: moduleSpec.id,
    label: moduleSpec.label,
    type: moduleSpec.type,
    status: validation.ok ? 'ready' : 'rejected',
    accepted: validation.ok,
    reason: validation.ok ? 'accepted by deterministic Retrobuilder fallback' : validation.errors.join('; '),
    input: clone(input),
    dataContract: moduleSpec.dataContract,
    acceptanceCriteria: moduleSpec.acceptanceCriteria,
    errorHandling: moduleSpec.errorHandling,
    metadata: clone(context.metadata || {}),
    timestamp: context.now || new Date().toISOString(),
  };
}

function createService(options = {}) {
  const history = [];
  return {
    spec: moduleSpec,
    process(input = {}, context = {}) {
      const result = process(input, { ...context, now: context.now || options.now });
      history.push(result);
      return result;
    },
    getHistory() {
      return history.slice();
    },
    health() {
      return {
        ok: true,
        moduleId: moduleSpec.id,
        label: moduleSpec.label,
        generatedBy: 'retrobuilder-deterministic-fallback',
      };
    },
  };
}

module.exports = {
  moduleSpec,
  validateInput,
  process,
  createService,
};
`;
}

function buildFallbackFrontendIndexSource() {
  return `'use strict';

const moduleSpec = require('../module.spec.json');

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[<>&"']/g, (char) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function toArray(value, fallback = []) {
  return Array.isArray(value) && value.length > 0 ? value : fallback;
}

function extractShopName() {
  const label = String(moduleSpec.label || '').trim();
  const cleaned = label
    .replace(/\\b(booking|site|website|public|frontend|crm|scheduler|scheduling|app|system|studio|barbershop|tattoo|dental|restaurant)\\b/gi, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
  return cleaned.length >= 2 ? cleaned : '';
}

function inferDomainProfile() {
  const text = [moduleSpec.label, moduleSpec.description, moduleSpec.dataContract].join(' ').toLowerCase();
  const explicitShopName = extractShopName();
  if (/barber|barbershop|haircut|beard|fade|line-?up|clipper|cut\\s*&\\s*crown/.test(text)) {
    return {
      shopName: explicitShopName || 'Cut & Crown',
      eyebrow: 'Barbershop CRM + booking',
      headline: 'Book a sharper cut before the chair cools.',
      story: 'A warm neighborhood barbershop experience with clean scheduling, client notes, WhatsApp confirmations, and a premium public site in one place.',
      primaryCta: 'Reserve a chair',
      secondaryCta: 'See services',
      bookingTitle: 'Hold your next appointment.',
      serviceLabel: 'Service',
      personLabel: 'Barber',
      notesLabel: 'Client notes',
      peopleSectionLabel: 'Barbers',
      callLabel: 'Call the shop',
      mapLabel: 'Map',
      confirmLabel: 'Confirm booking',
      contactLabel: 'Send WhatsApp request',
      reminderCopy: 'WhatsApp confirmation after booking',
      services: [
        { id: 'signature-cut', name: 'Signature Cut', duration: '45 min', price: '$48' },
        { id: 'beard-shape', name: 'Cut + Beard Shape', duration: '60 min', price: '$62' },
        { id: 'lineup', name: 'Refresh Lineup', duration: '30 min', price: '$34' },
      ],
      people: [
        { id: 'milo', name: 'Milo', specialty: 'Skin fades and clean lines', nextSlot: 'Today 4:30 PM' },
        { id: 'jay', name: 'Jay', specialty: 'Beard sculpting and texture', nextSlot: 'Today 5:10 PM' },
      ],
      clientNotes: 'Prefers a low fade, clean neckline, and beard cleanup.',
      proof: [
        'Best fade in the neighborhood and the booking flow is fast.',
        'Premium shop energy without losing the local warmth.',
      ],
    };
  }
  if (/tattoo|ink|artist|aftercare|deposit/.test(text)) {
    return {
      shopName: explicitShopName || 'Ink Ledger',
      eyebrow: 'Private tattoo booking + artist CRM',
      headline: 'Book the right artist for the piece.',
      story: 'A studio-grade intake surface for style, placement, deposit, artist prep notes, and aftercare reminders.',
      primaryCta: 'Reserve consultation',
      secondaryCta: 'Meet artists',
      bookingTitle: 'Shape the consultation.',
      serviceLabel: 'Style',
      personLabel: 'Artist',
      notesLabel: 'Tattoo idea',
      peopleSectionLabel: 'Artists',
      callLabel: 'Call the studio',
      mapLabel: 'Studio map',
      confirmLabel: 'Confirm consultation',
      contactLabel: 'Send deposit request',
      reminderCopy: 'Deposit confirmation and aftercare follow-up',
      services: [
        { id: 'flash-consult', name: 'Flash Consultation', duration: '30 min', price: '$40 deposit' },
        { id: 'custom-piece', name: 'Custom Piece Planning', duration: '60 min', price: '$80 deposit' },
        { id: 'cover-up', name: 'Cover-up Strategy', duration: '45 min', price: '$60 deposit' },
      ],
      people: [
        { id: 'mara', name: 'Mara Vale', specialty: 'Fine-line florals and script', nextSlot: 'Today 6:20 PM' },
        { id: 'soren', name: 'Soren Fox', specialty: 'Bold blackwork and cover-ups', nextSlot: 'Tomorrow 11:10 AM' },
      ],
      clientNotes: 'Fine-line botanical piece on the forearm with two reference images.',
      proof: [
        'The consult felt private, prepared, and clear about deposit timing.',
        'Aftercare reminders arrived before I even had to ask.',
      ],
    };
  }
  if (/dental|dentist|orthodont|patient/.test(text)) {
    return {
      shopName: 'Pearl Desk',
      eyebrow: 'Dental scheduling + patient CRM',
      headline: 'Book care before the calendar fills.',
      story: 'A calm patient intake surface for visits, insurance notes, reminders, and follow-up care.',
      primaryCta: 'Request appointment',
      secondaryCta: 'See care options',
      bookingTitle: 'Schedule the visit.',
      serviceLabel: 'Care',
      personLabel: 'Clinician',
      notesLabel: 'Patient notes',
      peopleSectionLabel: 'Clinicians',
      callLabel: 'Call the clinic',
      mapLabel: 'Clinic map',
      confirmLabel: 'Confirm request',
      contactLabel: 'Send patient request',
      reminderCopy: 'SMS confirmation and care follow-up',
      services: [
        { id: 'cleaning', name: 'Preventive Cleaning', duration: '50 min', price: '$120' },
        { id: 'whitening', name: 'Whitening Consult', duration: '30 min', price: '$70' },
        { id: 'emergency', name: 'Urgent Tooth Check', duration: '40 min', price: '$95' },
      ],
      people: [
        { id: 'dr-lee', name: 'Dr. Lee', specialty: 'Preventive care and whitening', nextSlot: 'Today 3:40 PM' },
        { id: 'dr-park', name: 'Dr. Park', specialty: 'Urgent care and restorative planning', nextSlot: 'Tomorrow 9:30 AM' },
      ],
      clientNotes: 'New patient with sensitivity on the lower right side.',
      proof: [
        'Scheduling felt clear, calm, and much faster than a phone tree.',
        'The reminder included everything I needed before arriving.',
      ],
    };
  }
  if (/restaurant|cafe|reservation|table|host stand|dining|bistro/.test(text)) {
    return {
      shopName: 'Table Signal',
      eyebrow: 'Reservations + guest CRM',
      headline: 'Hold the table before the night gets loud.',
      story: 'A dining-room booking surface for party size, seating notes, VIP memory, and reminder flows.',
      primaryCta: 'Reserve a table',
      secondaryCta: 'View experiences',
      bookingTitle: 'Seat the party.',
      serviceLabel: 'Experience',
      personLabel: 'Host',
      notesLabel: 'Guest notes',
      peopleSectionLabel: 'Hosts',
      callLabel: 'Call the host stand',
      mapLabel: 'Restaurant map',
      confirmLabel: 'Confirm reservation',
      contactLabel: 'Send reservation request',
      reminderCopy: 'Guest reminder and host notes sync',
      services: [
        { id: 'counter', name: 'Counter Tasting', duration: '90 min', price: '$85 pp' },
        { id: 'booth', name: 'Corner Booth', duration: '120 min', price: '$25 hold' },
        { id: 'patio', name: 'Patio Aperitivo', duration: '75 min', price: '$20 hold' },
      ],
      people: [
        { id: 'nina', name: 'Nina', specialty: 'VIP seating and wine notes', nextSlot: 'Tonight 7:30 PM' },
        { id: 'omar', name: 'Omar', specialty: 'Large parties and patio flow', nextSlot: 'Tonight 8:15 PM' },
      ],
      clientNotes: 'Anniversary dinner, prefers quiet corner and sparkling water on arrival.',
      proof: [
        'The host remembered our notes and the table was ready.',
        'Changing the reservation took one tap instead of a call.',
      ],
    };
  }
  return {
    shopName: explicitShopName || moduleSpec.label || 'Generated Product',
    eyebrow: 'Generated product workspace',
    headline: 'Launch the product flow with a clear first action.',
    story: moduleSpec.description || 'A responsive generated surface with a focused action flow, follow-up state, customer-safe copy, and mobile containment built in.',
    primaryCta: 'Start flow',
    secondaryCta: 'Review options',
    bookingTitle: 'Prepare the request.',
    serviceLabel: 'Option',
    personLabel: 'Owner',
    notesLabel: 'Request notes',
    peopleSectionLabel: 'Team',
    callLabel: 'Call team',
    mapLabel: 'Location',
    confirmLabel: 'Send request',
    contactLabel: 'Contact team',
    reminderCopy: 'Follow-up queued after submission',
    actionNoun: 'request',
    pageTitleNoun: 'workspace',
    readyStatus: 'request-ready',
    reasonText: 'product request prepared',
    nextActions: ['confirm request', 'notify owner', 'update project record'],
    followupSectionLabel: 'Follow-up signals',
    proofLabel: 'Project notes',
    services: [
      { id: 'primary-flow', name: 'Primary Flow', duration: 'Guided', price: 'Ready' },
      { id: 'priority-review', name: 'Priority Review', duration: '15 min', price: 'Queued' },
      { id: 'handoff-check', name: 'Handoff Check', duration: '10 min', price: 'Included' },
    ],
    people: [
      { id: 'owner', name: 'Product Owner', specialty: 'Primary experience', nextSlot: 'Today 4:30 PM' },
      { id: 'ops', name: 'Operations Lead', specialty: 'Follow-up and fulfillment', nextSlot: 'Today 5:10 PM' },
    ],
    clientNotes: 'Capture the request, preferred timing, and any context the team needs before handoff.',
    proof: [
      'The generated surface keeps the first action clear and the follow-up state visible.',
      'Long notes, labels, and responsive controls stay contained on mobile.',
    ],
  };
}

function normalizeService(service, index) {
  if (typeof service === 'string') {
    return { id: String(index), name: service, duration: '45 min', price: 'Quoted' };
  }
  return {
    id: service?.id || String(index),
    name: service?.name || service?.label || 'Featured Service',
    duration: service?.duration || '45 min',
    price: service?.price || service?.deposit || 'Quoted',
  };
}

function normalizePerson(person, index) {
  if (typeof person === 'string') {
    return { id: String(index), name: person, specialty: 'Guest experience', nextSlot: 'Today 4:30 PM' };
  }
  return {
    id: person?.id || String(index),
    name: person?.name || person?.label || 'Primary Host',
    specialty: person?.specialty || person?.role || 'Guest experience',
    nextSlot: person?.nextSlot || person?.availability || 'Today 4:30 PM',
  };
}

function normalizeViewModel(input = {}) {
  const domain = inferDomainProfile();
  const services = toArray(input.services, domain.services).map(normalizeService);
  const people = toArray(input.artists || input.clinicians || input.hosts || input.barbers || input.people, domain.people).map(normalizePerson);
  const client = input.client || {};
  const location = input.location || {};
  const availableSlots = toArray(input.availableSlots, ['Today 4:30 PM', 'Today 5:10 PM', 'Tomorrow 10:00 AM']);
  const shopName = input.shopName || input.productName || domain.shopName;
  const contactPhone = client.phone || input.phone || '+1 555 0148';
  const schedulingLanguage = /booking|book|appointment|reservation|schedule|consultation/i.test([
    domain.eyebrow,
    domain.bookingTitle,
    domain.confirmLabel,
    domain.primaryCta,
  ].filter(Boolean).join(' '));
  const actionNoun = input.actionNoun || domain.actionNoun || (schedulingLanguage ? 'booking' : 'request');
  const contactMessage = encodeURIComponent('I want to request ' + shopName + ' - ' + (input.serviceId || services[0]?.name || services[0]?.id || actionNoun));

  return {
    shopName,
    pageTitleNoun: input.pageTitleNoun || domain.pageTitleNoun || (schedulingLanguage ? 'booking' : 'workspace'),
    brandInitial: String(shopName).trim().slice(0, 1).toUpperCase() || 'R',
    eyebrow: input.eyebrow || domain.eyebrow,
    headline: input.headline || domain.headline,
    story: input.brandStory || input.description || domain.story || moduleSpec.description,
    primaryCta: input.primaryCta || domain.primaryCta,
    secondaryCta: input.secondaryCta || domain.secondaryCta,
    bookingTitle: input.bookingTitle || domain.bookingTitle,
    serviceLabel: input.serviceLabel || domain.serviceLabel,
    personLabel: input.personLabel || domain.personLabel,
    notesLabel: input.notesLabel || domain.notesLabel,
    peopleSectionLabel: input.peopleSectionLabel || domain.peopleSectionLabel,
    callLabel: input.callLabel || domain.callLabel,
    mapLabel: input.mapLabel || domain.mapLabel,
    confirmLabel: input.confirmLabel || domain.confirmLabel,
    contactLabel: input.contactLabel || domain.contactLabel,
    reminderCopy: input.reminderCopy || domain.reminderCopy,
    actionNoun,
    schedulerLabel: input.schedulerLabel || domain.schedulerLabel || (schedulingLanguage ? 'Appointment Scheduler' : 'Action Timeline'),
    followupSectionLabel: input.followupSectionLabel || domain.followupSectionLabel || (schedulingLanguage ? 'CRM reminders' : 'Follow-up signals'),
    proofLabel: input.proofLabel || domain.proofLabel || (schedulingLanguage ? 'Customer proof' : 'Project notes'),
    readyStatus: input.readyStatus || domain.readyStatus || (schedulingLanguage ? 'booking-ready' : 'request-ready'),
    reasonText: input.reasonText || domain.reasonText || (schedulingLanguage ? 'appointment request prepared' : 'product request prepared'),
    nextActions: toArray(input.nextActions, domain.nextActions || (schedulingLanguage
      ? ['confirm booking', 'send WhatsApp reminder', 'update customer CRM profile']
      : ['confirm request', 'notify owner', 'update project record'])),
    services,
    people,
    barbers: people,
    availableSlots,
    selectedService: input.serviceId || services[0]?.name || 'Featured Service',
    selectedPerson: input.personId || input.ownerId || input.artistId || input.clinicianId || input.hostId || input.barberId || people[0]?.name || 'Primary Host',
    selectedBarber: input.personId || input.ownerId || input.artistId || input.clinicianId || input.hostId || input.barberId || people[0]?.name || 'Primary Host',
    displayDate: input.displayDate || input.date || 'Today',
    clientName: client.name || 'New guest',
    clientPhone: contactPhone,
    contactHref: 'https://wa.me/15550148?text=' + contactMessage,
    clientNotes: client.notes || domain.clientNotes,
    address: location.address || '1248 Maple Avenue, Suite 2',
    hours: location.hours || 'Mon-Sat 9:00 AM - 7:00 PM',
    proof: toArray(input.testimonials, domain.proof),
  };
}

function validateInput(input) {
  const errors = [];
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    errors.push('input must be an object');
  }
  return { ok: errors.length === 0, errors };
}

function renderService(service) {
  return [
    '<article class="service-tile">',
    '<span>' + escapeHtml(service.duration) + '</span>',
    '<strong>' + escapeHtml(service.name) + '</strong>',
    '<em>' + escapeHtml(service.price) + '</em>',
    '</article>',
  ].join('');
}

function renderPerson(person) {
  return [
    '<article class="person-row">',
    '<div class="avatar">' + escapeHtml(String(person.name).slice(0, 1)) + '</div>',
    '<div class="person-copy">',
    '<strong>' + escapeHtml(person.name) + '</strong>',
    '<span>' + escapeHtml(person.specialty) + '</span>',
    '</div>',
    '<time>' + escapeHtml(person.nextSlot) + '</time>',
    '</article>',
  ].join('');
}

function renderSlot(slot) {
  return '<button class="slot-pill wheel-option" type="button" data-21st-pattern="time-slot-button">' + escapeHtml(slot) + '</button>';
}

function normalizeSlotLabel(value, fallback = '') {
  const label = String(value || fallback || '').trim();
  if (!label) return String(fallback || '').trim();
  return label
    .replace(/\\b(am|pm)\\b/g, (match) => match.toUpperCase())
    .replace(/\\b(today|tomorrow)\\b/gi, (match) => match.charAt(0).toUpperCase() + match.slice(1).toLowerCase());
}

function splitSlot(slot, index, fallbackDate = 'Today') {
  const raw = String(slot || '').trim();
  const leadingTime = raw.match(/^(\\d{1,2}(?::\\d{2})?)\\s*(AM|PM)\\b\\s*(.*)$/i);
  if (leadingTime) {
    return {
      id: String(index),
      date: normalizeSlotLabel(leadingTime[3], fallbackDate),
      time: normalizeSlotLabel(leadingTime[1] + ' ' + leadingTime[2]),
    };
  }
  const trailingTime = raw.match(/^(.*?)\\s+(\\d{1,2}(?::\\d{2})?)\\s*(AM|PM)$/i);
  if (trailingTime) {
    return {
      id: String(index),
      date: normalizeSlotLabel(trailingTime[1], fallbackDate),
      time: normalizeSlotLabel(trailingTime[2] + ' ' + trailingTime[3]),
    };
  }
  return {
    id: String(index),
    date: normalizeSlotLabel(fallbackDate, 'Today'),
    time: normalizeSlotLabel(raw, 'Next slot'),
  };
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function renderWheelOption(value, selected = false) {
  return [
    '<button class="wheel-option' + (selected ? ' is-selected' : '') + '" type="button" aria-pressed="' + (selected ? 'true' : 'false') + '">',
    escapeHtml(value),
    '</button>',
  ].join('');
}

function renderWheelColumn(label, values, selectedValue) {
  return [
    '<div class="wheel-column" role="listbox" aria-label="' + escapeHtml(label) + '">',
    '<span class="wheel-label">' + escapeHtml(label) + '</span>',
    '<div class="wheel-track">',
    values.map((value) => renderWheelOption(value, value === selectedValue)).join(''),
    '</div>',
    '</div>',
  ].join('');
}

function renderAppointmentScheduler(view) {
  const slots = view.availableSlots.map((slot, index) => splitSlot(slot, index, view.displayDate));
  const selectedSlot = slots[0] || splitSlot(view.displayDate, 0, view.displayDate);
  const dateOptions = uniqueValues([view.displayDate, ...slots.map((slot) => slot.date)]).slice(0, 4);
  const timeOptions = uniqueValues(slots.map((slot) => slot.time)).slice(0, 4);
  const peopleOptions = view.people.map((person) => person.name).slice(0, 4);

  return [
    '<section class="appointment-scheduler date-wheel-picker" data-21st-pattern="appointment-scheduler date-wheel-picker" aria-label="' + escapeHtml(view.schedulerLabel) + '">',
    '<input class="sr-only" name="date" value="' + escapeHtml(view.displayDate) + '" aria-label="Selected appointment date" />',
    '<div class="scheduler-head">',
    '<span>' + escapeHtml(view.schedulerLabel) + '</span>',
    '<strong>' + escapeHtml(selectedSlot.date) + ' · ' + escapeHtml(selectedSlot.time) + '</strong>',
    '</div>',
    '<div class="wheel-grid">',
    renderWheelColumn('Date', dateOptions, view.displayDate),
    renderWheelColumn('Time', timeOptions, selectedSlot.time),
    renderWheelColumn(view.personLabel, peopleOptions, view.selectedPerson),
    '</div>',
    '<div class="slot-list" aria-label="Available ' + escapeHtml(view.actionNoun) + ' slots">' + view.availableSlots.map(renderSlot).join('') + '</div>',
    '</section>',
  ].join('');
}

function renderApp(input = {}) {
  const view = normalizeViewModel(input);
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<title>' + escapeHtml(view.shopName) + ' ' + escapeHtml(view.pageTitleNoun) + '</title>',
    '<style>',
    ':root{--ink:#211916;--paper:#f4ead9;--cream:#fff8ec;--brass:#b8782f;--rust:#b43b2e;--moss:#1f6b4b;--line:#ddc8aa;}',
    '*{box-sizing:border-box;}',
    'html,body{margin:0;min-width:0;width:100%;max-width:100%;overflow-x:hidden;background:var(--paper);color:var(--ink);font-family:"Cabinet Grotesk","Avenir Next",Inter,system-ui,sans-serif;}',
    'body{background-image:radial-gradient(circle at 18% 12%,rgba(180,59,46,.16),transparent 26rem),linear-gradient(135deg,rgba(33,25,22,.05) 25%,transparent 25%,transparent 50%,rgba(33,25,22,.05) 50%,rgba(33,25,22,.05) 75%,transparent 75%);background-size:auto,18px 18px;}',
    'a,button,input,select,textarea{font:inherit;}',
    'main{width:100%;max-width:100%;min-width:0;}',
    '.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}',
    '.shell{width:100%;max-width:1180px;margin:0 auto;padding:18px clamp(16px,4vw,42px) 44px;min-width:0;}',
    '.topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 0 24px;}',
    '.brand{display:flex;align-items:center;gap:10px;min-width:0;text-decoration:none;color:inherit;}',
    '.mark{display:grid;place-items:center;width:44px;height:44px;border-radius:999px;background:var(--ink);color:var(--cream);font-weight:900;letter-spacing:-.08em;}',
    '.brand span{font-weight:900;letter-spacing:-.04em;font-size:clamp(1.15rem,5vw,1.7rem);overflow-wrap:anywhere;}',
    '.nav-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0;}',
    '.nav-actions a,.primary-action,.slot-pill,.kinetic-button{min-width:0;border:0;border-radius:999px;padding:11px 16px;text-decoration:none;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease,background .18s ease;}',
    '.nav-actions a{background:rgba(255,248,236,.76);color:var(--ink);border:1px solid var(--line);}',
    '.kinetic-button{position:relative;isolation:isolate;overflow:hidden;}',
    '.kinetic-button:after{content:"";position:absolute;inset:50%;width:0;height:0;border-radius:999px;background:currentColor;opacity:.16;transform:translate(-50%,-50%);transition:width .32s ease,height .32s ease,opacity .32s ease;z-index:-1;}',
    '.kinetic-button:hover{transform:translateY(-1px);}',
    '.kinetic-button:active{transform:scale(.97);}',
    '.kinetic-button:active:after{width:140%;height:260%;opacity:.22;}',
    '.primary-action{display:inline-flex;align-items:center;justify-content:center;gap:10px;background:var(--rust);color:#fff;box-shadow:0 15px 35px rgba(180,59,46,.25);}',
    '.button-state-icon{display:grid;place-items:center;width:1.35rem;height:1.35rem;border-radius:999px;background:rgba(255,248,236,.16);font-size:.82rem;}',
    '.hero{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(280px,.95fr);gap:clamp(20px,5vw,46px);align-items:stretch;min-width:0;}',
    '.hero-copy,.booking-card,.crm-strip,.proof-card{width:100%;max-width:100%;min-width:0;border:1px solid var(--line);box-shadow:0 24px 70px rgba(45,30,18,.16);}',
    '.hero-copy{position:relative;overflow:hidden;border-radius:38px;padding:clamp(24px,6vw,64px);background:linear-gradient(145deg,var(--cream),#ecd5b5);}',
    '.hero-copy:after{content:"";position:absolute;right:-70px;bottom:-90px;width:240px;height:240px;border-radius:50%;border:38px solid rgba(180,59,46,.18);}',
    '.eyebrow{display:inline-flex;align-items:center;gap:8px;margin:0 0 18px;text-transform:uppercase;letter-spacing:.16em;font-size:.76rem;color:#815224;overflow-wrap:anywhere;}',
    '.eyebrow:before{content:"";width:9px;height:9px;border-radius:99px;background:var(--moss);box-shadow:18px 0 0 var(--rust),36px 0 0 var(--brass);}',
    'h1{margin:0;font-size:clamp(2.6rem,7vw,5.1rem);line-height:.94;letter-spacing:-.07em;max-width:min(100%,13.5ch);text-wrap:balance;overflow-wrap:break-word;}',
    '.lede{max-width:62ch;color:#5f4b3a;font-size:clamp(1rem,3.4vw,1.22rem);line-height:1.62;overflow-wrap:anywhere;}',
    '.hero-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:26px;}',
    '.secondary-action{color:var(--ink);text-decoration-color:var(--rust);text-decoration-thickness:2px;text-underline-offset:5px;font-weight:800;overflow-wrap:anywhere;}',
    '.booking-card{border-radius:34px;background:#221a16;color:var(--cream);padding:clamp(18px,4vw,26px);}',
    '.booking-card h2{font-size:clamp(1.8rem,8vw,3.1rem);line-height:.96;letter-spacing:-.06em;margin:0 0 14px;overflow-wrap:anywhere;}',
    '.booking-form{display:grid;gap:12px;min-width:0;}',
    '.field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;min-width:0;}',
    'label{display:grid;gap:6px;min-width:0;font-size:.76rem;letter-spacing:.08em;text-transform:uppercase;color:#d9b989;}',
    'input,select,textarea{width:100%;max-width:100%;min-width:0;border:1px solid rgba(255,248,236,.18);border-radius:18px;background:rgba(255,248,236,.08);color:var(--cream);padding:13px 14px;outline:none;}',
    'textarea{resize:vertical;min-height:84px;overflow-wrap:anywhere;word-break:break-word;}',
    '.appointment-scheduler{display:grid;gap:12px;min-width:0;border:1px solid rgba(255,248,236,.18);border-radius:24px;background:linear-gradient(180deg,rgba(255,248,236,.1),rgba(255,248,236,.045));padding:12px;}',
    '.scheduler-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;min-width:0;}',
    '.scheduler-head span{font-size:.7rem;letter-spacing:.16em;text-transform:uppercase;color:#d9b989;}',
    '.scheduler-head strong{max-width:52%;text-align:right;color:#fff8ec;overflow-wrap:anywhere;}',
    '.wheel-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;min-width:0;}',
    '.wheel-column{min-width:0;border:1px solid rgba(255,248,236,.14);border-radius:18px;background:rgba(16,11,9,.22);padding:8px;}',
    '.wheel-label{display:block;margin:0 0 7px;font-size:.64rem;letter-spacing:.14em;text-transform:uppercase;color:#d9b989;}',
    '.wheel-track{display:grid;gap:6px;max-height:118px;overflow:auto;scroll-snap-type:y mandatory;padding-right:2px;}',
    '.wheel-option{min-width:0;width:100%;border:1px solid rgba(255,248,236,.16);border-radius:14px;background:rgba(255,248,236,.08);color:var(--cream);padding:9px 10px;text-align:left;scroll-snap-align:center;overflow-wrap:anywhere;transition:transform .16s ease,background .16s ease,border-color .16s ease;}',
    '.wheel-option.is-selected{background:var(--cream);color:var(--ink);border-color:var(--brass);box-shadow:0 10px 26px rgba(0,0,0,.22);}',
    '.wheel-option:active{transform:scale(.97);}',
    '.slot-list{display:flex;flex-wrap:wrap;gap:8px;min-width:0;}',
    '.slot-pill{width:auto;text-align:center;background:rgba(255,248,236,.12);color:var(--cream);border:1px solid rgba(255,248,236,.18);overflow-wrap:anywhere;}',
    '.confirm-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:4px;min-width:0;}',
    '.confirm-row .primary-action{flex:1 1 180px;}',
    '.whatsapp-link{display:inline-flex;align-items:center;justify-content:center;min-width:0;border:1px solid rgba(185,246,212,.22);border-radius:999px;padding:10px 12px;color:#b9f6d4;text-decoration:none;font-weight:800;overflow-wrap:anywhere;}',
    '.service-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:18px;min-width:0;}',
    '.service-tile{display:grid;gap:8px;min-width:0;border:1px solid var(--line);border-radius:24px;background:rgba(255,248,236,.78);padding:16px;}',
    '.service-tile span,.service-tile em,.person-row span{color:#73553d;font-style:normal;overflow-wrap:anywhere;}',
    '.service-tile strong{font-size:1.1rem;overflow-wrap:anywhere;}',
    '.person-stack{display:grid;gap:10px;margin-top:14px;min-width:0;}',
    '.person-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;border:1px solid var(--line);border-radius:22px;background:#fffaf2;padding:12px;min-width:0;}',
    '.avatar{display:grid;place-items:center;width:44px;height:44px;border-radius:16px;background:var(--brass);color:#fff;font-weight:900;}',
    '.person-copy{display:grid;gap:2px;min-width:0;overflow-wrap:anywhere;}',
    '.person-row time{font-size:.82rem;color:var(--rust);font-weight:900;text-align:right;overflow-wrap:anywhere;}',
    '.crm-strip{margin-top:16px;border-radius:28px;background:#fffaf2;padding:18px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;}',
    '.crm-strip div{min-width:0;border-left:4px solid var(--rust);padding-left:12px;overflow-wrap:anywhere;}',
    '.proof-card{margin-top:16px;border-radius:28px;background:linear-gradient(135deg,#fffaf2,#ead2ad);padding:18px;display:grid;gap:10px;overflow-wrap:anywhere;}',
    '.mobile-note{display:none;margin-top:14px;color:#725840;line-height:1.5;overflow-wrap:anywhere;}',
    '@media (max-width: 860px){.hero{grid-template-columns:minmax(0,1fr);}.service-grid,.crm-strip{grid-template-columns:minmax(0,1fr);}.booking-card{order:-1;}.mobile-note{display:block;}}',
    '@media (max-width: 430px){.shell{padding-inline:14px;}.topbar{align-items:flex-start;}.nav-actions{width:100%;}.nav-actions a,.nav-actions .primary-action{width:100%;justify-content:center;}.hero-copy,.booking-card{border-radius:26px;}.field-grid,.wheel-grid{grid-template-columns:minmax(0,1fr);}.scheduler-head{display:grid;}.scheduler-head strong{max-width:100%;text-align:left;}h1{font-size:clamp(2.55rem,17vw,4.4rem);}}',
    '</style>',
    '</head>',
    '<body>',
    '<main class="shell">',
    '<header class="topbar">',
    '<a class="brand" href="#top" aria-label="' + escapeHtml(view.shopName) + ' home"><span class="mark">' + escapeHtml(view.brandInitial) + '</span><span>' + escapeHtml(view.shopName) + '</span></a>',
    '<nav class="nav-actions" aria-label="' + escapeHtml(view.actionNoun) + ' shortcuts">',
    '<a href="tel:' + escapeHtml(view.clientPhone.replace(/\\s+/g, '')) + '">' + escapeHtml(view.callLabel) + '</a>',
    '<a href="https://wa.me/15550148">WhatsApp</a>',
    '<a href="https://maps.google.com/?q=' + encodeURIComponent(view.address) + '">' + escapeHtml(view.mapLabel) + '</a>',
    '</nav>',
    '</header>',
    '<section id="top" class="hero">',
    '<div class="hero-copy">',
    '<p class="eyebrow">' + escapeHtml(view.eyebrow) + '</p>',
    '<h1>' + escapeHtml(view.headline) + '</h1>',
    '<p class="lede">' + escapeHtml(view.story) + '</p>',
    '<div class="hero-actions">',
    '<a class="primary-action kinetic-button" data-21st-pattern="button-with-icon action-button" href="#booking"><span class="button-state-icon">↗</span>' + escapeHtml(view.primaryCta) + '</a>',
    '<a class="secondary-action" href="#services">' + escapeHtml(view.secondaryCta) + '</a>',
    '</div>',
    '<p class="mobile-note">Designed for a 390px phone: long notes wrap, forms stay contained, and the ' + escapeHtml(view.actionNoun) + ' actions remain thumb-ready.</p>',
    '<div id="services" class="service-grid">' + view.services.map(renderService).join('') + '</div>',
    '</div>',
    '<aside id="booking" class="booking-card" aria-label="' + escapeHtml(view.bookingTitle) + '">',
    '<h2>' + escapeHtml(view.bookingTitle) + '</h2>',
    '<form class="booking-form" method="post" action="#booking">',
    '<div class="field-grid">',
    '<label>' + escapeHtml(view.serviceLabel) + '<select name="service">' + view.services.map((service) => '<option' + (service.name === view.selectedService ? ' selected' : '') + '>' + escapeHtml(service.name) + '</option>').join('') + '</select></label>',
    '<label>' + escapeHtml(view.personLabel) + '<select name="person">' + view.people.map((person) => '<option' + (person.name === view.selectedPerson ? ' selected' : '') + '>' + escapeHtml(person.name) + '</option>').join('') + '</select></label>',
    '</div>',
    '<label>Phone<input name="phone" value="' + escapeHtml(view.clientPhone) + '" /></label>',
    renderAppointmentScheduler(view),
    '<label>' + escapeHtml(view.notesLabel) + '<textarea name="notes">' + escapeHtml(view.clientNotes) + '</textarea></label>',
    '<div class="confirm-row"><button class="primary-action kinetic-button" data-21st-pattern="button-with-icon material-ripple action-button" type="submit"><span class="button-state-icon">✓</span>' + escapeHtml(view.confirmLabel) + '</button><a class="whatsapp-link kinetic-button" data-21st-pattern="action-button material-ripple" href="' + escapeHtml(view.contactHref) + '">' + escapeHtml(view.contactLabel) + '</a></div>',
    '</form>',
    '</aside>',
    '</section>',
    '<section class="person-stack" aria-label="' + escapeHtml(view.peopleSectionLabel) + '">' + view.people.map(renderPerson).join('') + '</section>',
    '<section class="crm-strip" aria-label="' + escapeHtml(view.followupSectionLabel) + '">',
    '<div><strong>Client</strong><br />' + escapeHtml(view.clientName) + '</div>',
    '<div><strong>Reminder</strong><br />' + escapeHtml(view.reminderCopy) + '</div>',
    '<div><strong>Hours</strong><br />' + escapeHtml(view.hours) + '</div>',
    '</section>',
    '<section class="proof-card" aria-label="' + escapeHtml(view.proofLabel) + '"><strong>' + escapeHtml(view.proofLabel) + '</strong>' + view.proof.map((quote) => '<p>' + escapeHtml(quote) + '</p>').join('') + '</section>',
    '</main>',
    '</body>',
    '</html>',
  ].join('');
}

function process(input = {}, context = {}) {
  const validation = validateInput(input);
  const view = validation.ok ? normalizeViewModel(input) : normalizeViewModel({});
  return {
    moduleId: moduleSpec.id,
    label: moduleSpec.label,
    type: moduleSpec.type,
    status: validation.ok ? view.readyStatus : 'rejected',
    accepted: validation.ok,
    request: {
      service: view.selectedService,
      person: view.selectedPerson,
      date: view.displayDate,
      client: view.clientName,
      phone: view.clientPhone,
      channel: input.channel || context.channel || 'public-site',
    },
    booking: {
      service: view.selectedService,
      person: view.selectedPerson,
      barber: view.selectedBarber,
      date: view.displayDate,
      client: view.clientName,
      phone: view.clientPhone,
      channel: input.channel || context.channel || 'public-site',
    },
    nextActions: view.nextActions,
    reason: validation.ok ? view.reasonText : validation.errors.join('; '),
    input: validation.ok ? clone(input) : null,
    timestamp: context.now || new Date().toISOString(),
  };
}

function createService(options = {}) {
  const history = [];
  return {
    spec: moduleSpec,
    render(input = {}) {
      return renderApp(input);
    },
    renderApp(input = {}) {
      return renderApp(input);
    },
    process(input = {}, context = {}) {
      const result = process(input, { ...context, now: context.now || options.now });
      history.push(result);
      return result;
    },
    getHistory() {
      return history.slice();
    },
    health() {
      return {
        ok: true,
        moduleId: moduleSpec.id,
        label: moduleSpec.label,
        generatedBy: 'retrobuilder-product-frontend-baseline',
      };
    },
  };
}

module.exports = {
  moduleSpec,
  normalizeViewModel,
  validateInput,
  renderApp,
  renderPortal: renderApp,
  process,
  createService,
};
`;
}

function buildGameFrontendIndexSource() {
  return `'use strict';

const moduleSpec = require('../module.spec.json');

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[<>&"']/g, (char) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function toArray(value, fallback = []) {
  return Array.isArray(value) && value.length > 0 ? value : fallback;
}

function clamp(value, min = 0, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function cleanPlayerFacingCopy(value, fallback) {
  const raw = String(value || '').replace(/\\s+/g, ' ').trim();
  if (!raw) return fallback;

  const blockedProductTerms = /\\b(booking|scheduling|calendar|crm|saas|restaurant|mechanic|tattoo|barbershop|appointment|reservation)\\b/i;
  const guardrailTerms = /\\b(not|never|avoid|without|must not|nothing like|nada de)\\b/i;
  const cleaned = raw
    .split(/(?:[.!?]\\s+|\\n+)/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !(blockedProductTerms.test(part) && guardrailTerms.test(part)))
    .join('. ')
    .replace(/\\s+/g, ' ')
    .trim();

  return cleaned || fallback;
}

function inferGameScreenVariant(input = {}) {
  const explicitVariant = String(input.screenVariant || input.variant || '').toLowerCase();
  if (/^(title-screen|beat-lab|career-map)$/.test(explicitVariant)) {
    return explicitVariant;
  }

  const contract = String(moduleSpec.dataContract || moduleSpec.data_contract || '').toLowerCase();
  const declaredScreen = contract.match(/data-game-screen=["']?(title-screen|beat-lab|career-map)/);
  if (declaredScreen) {
    return declaredScreen[1];
  }

  const identityText = [
    moduleSpec.id,
    moduleSpec.label,
  ].filter(Boolean).join(' ').toLowerCase();

  if (/beat lab|beat-lab|play surface|mix surface|pad surface/.test(identityText)) return 'beat-lab';
  if (/opening|title|start screen|launch screen|boot screen/.test(identityText)) return 'title-screen';
  if (/career|story map|campaign|route/.test(identityText)) return 'career-map';

  const descriptiveText = [
    moduleSpec.description,
  ].filter(Boolean).join(' ').toLowerCase();

  if (/beat lab|beat-lab|play surface|combo feedback/.test(descriptiveText)) return 'beat-lab';
  if (/opening|title screen|start screen|launch screen|boot sequence/.test(descriptiveText)) return 'title-screen';
  if (/career map|story map|campaign screen|progression map/.test(descriptiveText)) return 'career-map';
  return 'title-screen';
}

const DEFAULT_CHAPTERS = [
  { id: 'trash-alley', title: 'Trash Alley', detail: 'Find broken tapes in a rain-glowing dumpster and hear a loop nobody else hears.', risk: 'No rent cushion', reward: 'First spark' },
  { id: 'bedroom-lab', title: 'Bedroom Lab', detail: 'Wire junk speakers into a cracked laptop and turn noise into a playable beat.', risk: 'Energy drain', reward: 'Beat quality +18' },
  { id: 'basement-show', title: 'Basement Show', detail: 'Test the track under bare bulbs while the crowd decides if you are real.', risk: 'Crew doubt', reward: 'Reputation unlock' },
  { id: 'viral-leak', title: 'Viral Leak', detail: 'A phone recording explodes online before the mix is finished.', risk: 'Integrity pressure', reward: 'New listeners' },
  { id: 'label-trap', title: 'Label Trap', detail: 'Choose between a shiny contract and owning your masters.', risk: 'Ownership loss', reward: 'Fast money' },
  { id: 'festival-headliner', title: 'Festival Headliner', detail: 'Bring the trash-tape melody to a field of lights without losing the alley ghosts.', risk: 'Final set', reward: 'Legacy ending' },
];

const DEFAULT_PADS = [
  { id: 'kick', label: 'KICK', tone: 'sub rust', key: 'A' },
  { id: 'snare', label: 'SNARE', tone: 'bin lid clap', key: 'S' },
  { id: 'hat', label: 'HAT', tone: 'spray-can hiss', key: 'D' },
  { id: 'bass', label: 'BASS', tone: 'bus-window hum', key: 'F' },
];

const DEFAULT_CREW = [
  { name: 'Mika Wire', role: 'crate digger', loyalty: 74 },
  { name: 'June Static', role: 'street vocalist', loyalty: 61 },
  { name: 'Omar Tape', role: 'flyer king', loyalty: 48 },
];

function statBar(label, value) {
  const safe = clamp(value);
  return [
    '<div class="meter">',
    '<span>' + escapeHtml(label) + '</span>',
    '<strong>' + safe + '%</strong>',
    '<i style="--value:' + safe + '%"></i>',
    '</div>',
  ].join('');
}

function renderGeneratedAsset(label, seed) {
  const safeLabel = escapeHtml(label);
  const safeSeed = escapeHtml(seed);
  return [
    '<svg class="cover-art" data-generated-asset="inline-svg" viewBox="0 0 420 420" role="img" aria-label="' + safeLabel + ' generated cover art">',
    '<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#00f0ff"/><stop offset=".52" stop-color="#ff3df2"/><stop offset="1" stop-color="#ffe14d"/></linearGradient></defs>',
    '<rect width="420" height="420" rx="44" fill="#08070d"/>',
    '<path d="M46 308 C98 210 137 352 204 236 C272 116 301 278 376 102" fill="none" stroke="url(#g)" stroke-width="22" stroke-linecap="round"/>',
    '<circle cx="118" cy="126" r="42" fill="#ffe14d" opacity=".92"/>',
    '<rect x="248" y="62" width="96" height="146" rx="18" fill="#00f0ff" opacity=".22"/>',
    '<text x="36" y="372" fill="#f8f7ff" font-family="monospace" font-size="22" font-weight="800">' + safeLabel + '</text>',
    '<text x="36" y="396" fill="#8ef9ff" font-family="monospace" font-size="11">' + safeSeed + '</text>',
    '</svg>',
  ].join('');
}

function normalizeGameViewModel(input = {}) {
  const title = input.title || input.productName || moduleSpec.label || 'Trash Tape Ascension';
  const stats = input.stats || input.playerStats || {};
  const fallbackPremise = 'Start in an alley with broken cassettes, build beats under rent pressure, protect your crew, and decide what success costs.';
  return {
    mode: 'game',
    screenVariant: inferGameScreenVariant(input),
    title,
    subtitle: input.subtitle || 'A narrative rhythm game about turning discarded tapes into a life-changing sound.',
    premise: cleanPlayerFacingCopy(input.premise || input.brandStory || moduleSpec.description, fallbackPremise),
    currentChapter: input.currentChapter || 'Trash Alley',
    saveName: input.saveName || input.saveCassette || 'Cassette A / rain take',
    reducedMotion: Boolean(input.reducedMotion),
    stats: {
      energy: clamp(stats.energy ?? 64),
      rentPressure: clamp(stats.rentPressure ?? 72),
      reputation: clamp(stats.reputation ?? 12),
      integrity: clamp(stats.integrity ?? 94),
      beatQuality: clamp(stats.beatQuality ?? 48),
    },
    beatPads: toArray(input.beatPads || input.controls, DEFAULT_PADS),
    chapters: toArray(input.chapters, DEFAULT_CHAPTERS),
    crew: toArray(input.crew, DEFAULT_CREW),
    achievements: toArray(input.achievements, ['First loop found', 'No samples stolen']),
    assetSeed: input.assetSeed || input.seed || 'trash-tape-001',
  };
}

function renderPad(pad, index) {
  return [
    '<button class="beat-pad kinetic-button" data-21st-pattern="material-ripple animated-state-icon" type="button" aria-label="Trigger beat pad ' + escapeHtml(pad.label || pad.id || index) + '">',
    '<span>' + escapeHtml(pad.key || String(index + 1)) + '</span>',
    '<strong>' + escapeHtml(pad.label || pad.id || 'PAD') + '</strong>',
    '<em>' + escapeHtml(pad.tone || pad.description || 'generated tone') + '</em>',
    '</button>',
  ].join('');
}

function renderChapter(chapter, index, currentChapter) {
  const active = String(chapter.title || chapter.id) === String(currentChapter);
  return [
    '<article class="chapter' + (active ? ' is-active' : '') + '">',
    '<span>0' + (index + 1) + '</span>',
    '<strong>' + escapeHtml(chapter.title || chapter.id || 'Chapter') + '</strong>',
    '<p>' + escapeHtml(chapter.detail || chapter.description || 'A story branch waiting for a beat decision.') + '</p>',
    '<small>' + escapeHtml(chapter.risk || 'Risk unknown') + ' / ' + escapeHtml(chapter.reward || 'Reward hidden') + '</small>',
    '</article>',
  ].join('');
}

function renderCrew(member) {
  return [
    '<li>',
    '<span>' + escapeHtml(String(member.name || '?').slice(0, 1)) + '</span>',
    '<strong>' + escapeHtml(member.name || 'Unknown crew') + '</strong>',
    '<em>' + escapeHtml(member.role || 'crew') + ' / loyalty ' + clamp(member.loyalty ?? 50) + '%</em>',
    '</li>',
  ].join('');
}

function renderVariantLead(view) {
  if (view.screenVariant === 'beat-lab') {
    return [
      '<section class="variant-lead beat-lab-focus" aria-label="Beat lab command deck">',
      '<p class="section-kicker">Playable surface</p>',
      '<h2>Build the hook before rent pressure peaks.</h2>',
      '<p>Trigger pads, watch the meters, and turn alley noise into a loop strong enough to unlock the next chapter.</p>',
      '<div class="transport-strip"><span>REC</span><strong>' + escapeHtml(view.currentChapter) + '</strong><em>' + escapeHtml(view.saveName) + '</em></div>',
      '</section>',
    ].join('');
  }

  if (view.screenVariant === 'career-map') {
    return [
      '<section class="variant-lead career-map-campaign" aria-label="Career campaign overview">',
      '<p class="section-kicker">Campaign climb</p>',
      '<h2>Every branch costs something.</h2>',
      '<p>Track the rise from dumpster tapes to festival lights while reputation, ownership, crew loyalty, and integrity pull against each other.</p>',
      '<div class="campaign-stats"><span>Chapters ' + view.chapters.length + '</span><span>Achievements ' + view.achievements.length + '</span><span>Integrity ' + view.stats.integrity + '%</span></div>',
      '</section>',
    ].join('');
  }

  return [
    '<section class="variant-lead title-screen-cinematic" aria-label="Title screen cinematic layer">',
    '<p class="section-kicker">Boot sequence</p>',
    '<h2>Press start on the bootleg future.</h2>',
    '<p>The title card frames the whole fantasy first: cassette grit, neon ambition, and one producer deciding what success is allowed to cost.</p>',
    '</section>',
  ].join('');
}

function renderApp(input = {}) {
  const view = normalizeGameViewModel(input);
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<title>' + escapeHtml(view.title) + ' playable preview</title>',
    '<style>',
    ':root{--bg:#070710;--panel:#11111d;--ink:#f7f3ff;--muted:#a7a0c0;--cyan:#00f0ff;--pink:#ff3df2;--gold:#ffe14d;--line:rgba(255,255,255,.14);}',
    '*{box-sizing:border-box}html,body{margin:0;min-width:0;max-width:100%;overflow-x:hidden;background:var(--bg);color:var(--ink);font-family:"Space Grotesk","IBM Plex Mono",ui-monospace,monospace;}',
    'body{background-image:radial-gradient(circle at 18% 8%,rgba(0,240,255,.2),transparent 24rem),radial-gradient(circle at 82% 14%,rgba(255,61,242,.18),transparent 24rem),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px);background-size:auto,auto,22px 22px,22px 22px;}',
    'button{font:inherit}.game-shell{width:min(1180px,100%);margin:0 auto;padding:clamp(16px,4vw,42px);display:grid;gap:18px;min-width:0;}',
    '.title-card,.beat-lab,.career-map,.side-card,.variant-lead{border:1px solid var(--line);background:linear-gradient(145deg,rgba(17,17,29,.96),rgba(7,7,16,.92));box-shadow:0 28px 100px rgba(0,0,0,.38);border-radius:32px;min-width:0;overflow:hidden;}',
    '.variant-lead{position:relative;padding:clamp(18px,4vw,34px);isolation:isolate}.variant-lead:after{content:"";position:absolute;inset:auto -8% -50% 18%;height:90%;background:linear-gradient(90deg,rgba(0,240,255,.2),rgba(255,61,242,.2),rgba(255,225,77,.16));filter:blur(34px);opacity:.55;z-index:-1}.variant-lead h2{margin:0;font-size:clamp(1.8rem,6vw,4.2rem);line-height:.9;letter-spacing:-.08em;text-transform:uppercase}.variant-lead p{max-width:64ch;color:var(--muted);line-height:1.6;overflow-wrap:anywhere}.screen-beat-lab .title-card{display:none}.screen-beat-lab .grid{grid-template-columns:minmax(0,1.25fr) minmax(280px,.75fr)}.screen-beat-lab .beat-lab{border-color:rgba(0,240,255,.42);box-shadow:0 0 0 1px rgba(0,240,255,.12),0 34px 110px rgba(0,0,0,.42)}.screen-career-map .title-card{display:none}.screen-career-map .career-map{grid-template-columns:repeat(2,minmax(0,1fr));border-color:rgba(255,225,77,.34)}.screen-career-map .career-map .section-kicker{grid-column:1/-1}.screen-title-screen .title-screen-cinematic{display:block}.screen-title-screen .title-screen-cinematic h2{max-width:16ch}.screen-title-screen .title-screen-cinematic p:not(.section-kicker){max-width:54ch}.transport-strip,.campaign-stats{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.transport-strip span,.transport-strip strong,.transport-strip em,.campaign-stats span{border:1px solid var(--line);border-radius:999px;padding:8px 11px;background:rgba(255,255,255,.06);color:var(--ink);font-style:normal;overflow-wrap:anywhere}.transport-strip span{color:var(--pink);font-weight:900}.campaign-stats span{color:var(--gold)}',
    '.title-card{position:relative;padding:clamp(22px,6vw,68px);isolation:isolate;}.title-card:before{content:"";position:absolute;inset:auto -10% -22% -10%;height:48%;background:repeating-linear-gradient(90deg,rgba(0,240,255,.22) 0 8px,transparent 8px 22px);filter:blur(.3px);opacity:.65;z-index:-1;}',
    '.eyebrow{display:inline-flex;gap:10px;align-items:center;border:1px solid rgba(0,240,255,.32);border-radius:999px;padding:8px 12px;color:#9cfaff;background:rgba(0,240,255,.08);font-size:12px;text-transform:uppercase;letter-spacing:.18em}.eyebrow:before{content:"";width:9px;height:9px;border-radius:50%;background:var(--pink);box-shadow:16px 0 0 var(--gold),32px 0 0 var(--cyan)}',
    'h1{margin:18px 0 14px;max-width:10ch;font-size:clamp(3.2rem,14vw,8.8rem);line-height:.78;letter-spacing:-.09em;text-transform:uppercase;text-wrap:balance;overflow-wrap:anywhere;text-shadow:0 0 34px rgba(0,240,255,.18)}',
    '.premise{max-width:67ch;color:var(--muted);font-size:clamp(1rem,2.5vw,1.22rem);line-height:1.65;overflow-wrap:anywhere}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}.kinetic-button{position:relative;isolation:isolate;overflow:hidden;border:0;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease}.kinetic-button:after{content:"";position:absolute;inset:50%;width:0;height:0;border-radius:999px;background:currentColor;opacity:.16;transform:translate(-50%,-50%);transition:width .32s ease,height .32s ease;z-index:-1}.kinetic-button:hover{transform:translateY(-2px)}.kinetic-button:active{transform:scale(.97)}.kinetic-button:active:after{width:180%;height:260%}',
    '.primary,.ghost{border-radius:999px;padding:13px 18px;font-weight:900;text-decoration:none}.primary{background:linear-gradient(90deg,var(--cyan),var(--pink));color:#05050a;box-shadow:0 18px 44px rgba(0,240,255,.18)}.ghost{background:rgba(255,255,255,.08);color:var(--ink);border:1px solid var(--line)}',
    '.grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(280px,.9fr);gap:18px}.beat-lab,.side-card,.career-map{padding:clamp(16px,3vw,28px)}.section-kicker{margin:0 0 10px;color:var(--gold);font-size:12px;letter-spacing:.16em;text-transform:uppercase}',
    '.beat-pad-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.beat-pad{min-width:0;min-height:116px;border-radius:24px;border:1px solid rgba(255,255,255,.16);background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.03));color:var(--ink);padding:14px;text-align:left;display:grid;align-content:space-between}.beat-pad span{color:var(--cyan);font-weight:900}.beat-pad strong{font-size:clamp(1.25rem,5vw,2.1rem);letter-spacing:-.05em}.beat-pad em{color:var(--muted);font-style:normal;overflow-wrap:anywhere}',
    '.meter{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;margin:12px 0;color:var(--muted)}.meter i{grid-column:1/-1;height:10px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}.meter i:before{content:"";display:block;width:var(--value);height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--cyan),var(--pink),var(--gold))}',
    '.career-map{display:grid;gap:12px}.chapter{border:1px solid var(--line);border-radius:22px;padding:14px;background:rgba(255,255,255,.045);display:grid;gap:7px}.chapter.is-active{border-color:rgba(0,240,255,.6);box-shadow:inset 0 0 0 1px rgba(0,240,255,.18),0 0 34px rgba(0,240,255,.1)}.chapter span{color:var(--pink);font-size:12px}.chapter p{margin:0;color:var(--muted);line-height:1.45}.chapter small{color:var(--gold);overflow-wrap:anywhere}',
    '.side-card{display:grid;gap:16px}.cover-art{width:100%;height:auto;border-radius:24px;border:1px solid var(--line);background:#08070d}.crew{list-style:none;margin:0;padding:0;display:grid;gap:10px}.crew li{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;align-items:center;border:1px solid var(--line);border-radius:18px;padding:10px;background:rgba(255,255,255,.04)}.crew li span{grid-row:1/3;display:grid;place-items:center;width:36px;height:36px;border-radius:12px;background:var(--gold);color:#09090f;font-weight:900}.crew em{color:var(--muted);font-style:normal}.save-line{display:flex;gap:8px;flex-wrap:wrap;color:var(--muted)}.save-line strong{color:var(--cyan)}',
    '@media (max-width: 860px){.grid{grid-template-columns:minmax(0,1fr)}.beat-pad-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:430px){.game-shell{padding-inline:12px}.title-card,.beat-lab,.career-map,.side-card{border-radius:24px}.beat-pad-grid{grid-template-columns:minmax(0,1fr)}h1{font-size:clamp(3rem,20vw,5.2rem)}}@media (prefers-reduced-motion: reduce){*,*:before,*:after{animation:none!important;transition:none!important}}',
    '</style>',
    '</head>',
    '<body>',
    '<main class="game-shell screen-' + escapeHtml(view.screenVariant) + '" data-product-domain="narrative-rhythm-game" data-game-screen="' + escapeHtml(view.screenVariant) + '">',
    renderVariantLead(view),
    '<section class="title-card" aria-label="Title screen">',
    '<p class="eyebrow">ANSI story cartridge / playable prototype</p>',
    '<h1>' + escapeHtml(view.title) + '</h1>',
    '<p class="premise">' + escapeHtml(view.premise) + '</p>',
    '<div class="actions"><a class="primary kinetic-button" data-21st-pattern="button-with-icon material-ripple" href="#beat-lab">Start new run</a><a class="ghost kinetic-button" data-21st-pattern="animated-state-icons action-button" href="#career-map">Continue ' + escapeHtml(view.saveName) + '</a><button class="ghost kinetic-button" type="button">Reduced motion ' + (view.reducedMotion ? 'on' : 'ready') + '</button></div>',
    '<p class="save-line">Current chapter <strong>' + escapeHtml(view.currentChapter) + '</strong> / save cassette <strong>' + escapeHtml(view.saveName) + '</strong></p>',
    '</section>',
    '<div class="grid">',
    '<section id="beat-lab" class="beat-lab" aria-label="Beat lab play surface">',
    '<p class="section-kicker">Beat lab</p>',
    '<h2>Tap junk into gold.</h2>',
    '<div class="beat-pad-grid">' + view.beatPads.map(renderPad).join('') + '</div>',
    '<div class="meters">' + statBar('Energy', view.stats.energy) + statBar('Rent pressure', view.stats.rentPressure) + statBar('Reputation', view.stats.reputation) + statBar('Integrity', view.stats.integrity) + statBar('Beat quality', view.stats.beatQuality) + '</div>',
    '</section>',
    '<aside class="side-card" aria-label="Generated assets and crew">',
    '<p class="section-kicker">Generated assets</p>',
    renderGeneratedAsset('TRASH TAPE 001', view.assetSeed),
    '<ul class="crew">' + view.crew.map(renderCrew).join('') + '</ul>',
    '</aside>',
    '</div>',
    '<section id="career-map" class="career-map" aria-label="Career story map">',
    '<p class="section-kicker">From trash to headline</p>',
    view.chapters.map((chapter, index) => renderChapter(chapter, index, view.currentChapter)).join(''),
    '</section>',
    '</main>',
    '</body>',
    '</html>',
  ].join('');
}

function validateInput(input) {
  const errors = [];
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    errors.push('input must be an object');
  }
  return { ok: errors.length === 0, errors };
}

function process(input = {}, context = {}) {
  const validation = validateInput(input);
  const view = validation.ok ? normalizeGameViewModel(input) : normalizeGameViewModel({});
  return {
    moduleId: moduleSpec.id,
    label: moduleSpec.label,
    type: moduleSpec.type,
    status: validation.ok ? 'playable-ready' : 'rejected',
    accepted: validation.ok,
    game: {
      title: view.title,
      screenVariant: view.screenVariant,
      currentChapter: view.currentChapter,
      saveName: view.saveName,
      stats: clone(view.stats),
      beatPads: view.beatPads.map((pad) => pad.id || pad.label),
    },
    nextActions: ['start run', 'open beat lab', 'save cassette', 'choose career branch'],
    reason: validation.ok ? 'narrative rhythm game state prepared' : validation.errors.join('; '),
    input: validation.ok ? clone(input) : null,
    timestamp: context.now || new Date().toISOString(),
  };
}

function createService(options = {}) {
  const history = [];
  return {
    spec: moduleSpec,
    render(input = {}) {
      return renderApp(input);
    },
    renderApp(input = {}) {
      return renderApp(input);
    },
    process(input = {}, context = {}) {
      const result = process(input, { ...context, now: context.now || options.now });
      history.push(result);
      return result;
    },
    getHistory() {
      return history.slice();
    },
    health() {
      return {
        ok: true,
        moduleId: moduleSpec.id,
        label: moduleSpec.label,
        generatedBy: 'retrobuilder-game-frontend-baseline',
      };
    },
  };
}

module.exports = {
  moduleSpec,
  normalizeGameViewModel,
  cleanPlayerFacingCopy,
  validateInput,
  renderApp,
  renderPortal: renderApp,
  process,
  createService,
};
`;
}

function buildFallbackTestSource() {
  return `'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const moduleApi = require('./index.js');

test('exposes the generated module contract', () => {
  assert.ok(moduleApi.moduleSpec.id);
  assert.ok(moduleApi.moduleSpec.label);
  assert.ok(Array.isArray(moduleApi.moduleSpec.acceptanceCriteria));
});

test('processes structured input deterministically', () => {
  const result = moduleApi.process({ requestId: 'req-1', channel: 'whatsapp' }, { now: '2026-01-01T00:00:00.000Z' });
  assert.equal(result.accepted, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.timestamp, '2026-01-01T00:00:00.000Z');
  assert.equal(result.input.requestId, 'req-1');
});

test('rejects unsafe non-object input', () => {
  const result = moduleApi.process(null);
  assert.equal(result.accepted, false);
  assert.equal(result.status, 'rejected');
});

test('service facade records processing history', () => {
  const service = moduleApi.createService({ now: '2026-01-02T00:00:00.000Z' });
  service.process({ idempotencyKey: 'key-1' });
  service.process({ idempotencyKey: 'key-2' });
  assert.equal(service.health().ok, true);
  assert.equal(service.getHistory().length, 2);
});
`;
}

function buildGameFrontendTestSource() {
  return `'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const moduleApi = require('./index.js');

test('renders a narrative rhythm game surface without booking leakage', () => {
  const variant = moduleApi.normalizeGameViewModel({}).screenVariant;
  const html = moduleApi.renderApp({
    productName: 'Trash Tape Ascension',
    currentChapter: 'Bedroom Lab',
    saveCassette: 'Cassette B / rooftop take',
  });
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /name="viewport"/);
  assert.match(html, /data-product-domain="narrative-rhythm-game"/);
  assert.match(html, new RegExp('data-game-screen="' + variant + '"'));
  assert.match(html, /beat-pad-grid/);
  assert.match(html, /career-map/);
  assert.match(html, /data-generated-asset="inline-svg"/);
  assert.match(html, /data-21st-pattern="button-with-icon material-ripple"/);
  assert.match(html, /@media \\(max-width:430px\\)/);
  if (variant === 'beat-lab') {
    assert.match(html, /beat-lab-focus/);
    assert.match(html, /transport-strip/);
  }
  if (variant === 'career-map') {
    assert.match(html, /career-map-campaign/);
    assert.match(html, /campaign-stats/);
  }
  if (variant === 'title-screen') {
    assert.match(html, /title-screen-cinematic/);
  }
  assert.doesNotMatch(html, /class="booking-form"|class="appointment-scheduler"|date-wheel-picker|Barbershop CRM|Confirm booking|CRM reminders|Signature Cut|Cut \\+ Beard/i);
  assert.doesNotMatch(html, /not booking|without any booking|must not|avoid all/i);
});

test('prepares playable game state deterministically', () => {
  const result = moduleApi.process({
    productName: 'Trash Tape Ascension',
    currentChapter: 'Basement Show',
    stats: { energy: 71, rentPressure: 64, reputation: 28, integrity: 96, beatQuality: 82 },
  }, { now: '2026-04-24T09:00:00.000Z' });
  assert.equal(result.accepted, true);
  assert.equal(result.status, 'playable-ready');
  assert.ok(['title-screen', 'beat-lab', 'career-map'].includes(result.game.screenVariant));
  assert.equal(result.game.currentChapter, 'Basement Show');
  assert.equal(result.game.stats.beatQuality, 82);
  assert.equal(result.timestamp, '2026-04-24T09:00:00.000Z');
});

test('service facade renders and records game history', () => {
  const service = moduleApi.createService({ now: '2026-04-24T10:00:00.000Z' });
  const html = service.render({ productName: 'Trash Tape Ascension' });
  service.process({ currentChapter: 'Trash Alley' });
  assert.match(html, /Trash Tape Ascension/);
  assert.equal(service.health().ok, true);
  assert.equal(service.health().generatedBy, 'retrobuilder-game-frontend-baseline');
  assert.equal(service.getHistory().length, 1);
});
`;
}

function buildFallbackFrontendTestSource() {
  return `'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const moduleApi = require('./index.js');

test('renders a product-grade booking surface', () => {
    const html = moduleApi.renderApp({
      client: { name: 'Jordan Client', phone: '+1 555 0148', notes: 'A long customer note that must wrap safely on mobile screens.' },
      displayDate: 'Apr 24',
      availableSlots: ['Today 4:30 PM', 'Today 5:10 PM', '10:00 AM tomorrow'],
    });
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /name="viewport"/);
  assert.match(html, /<form class="booking-form"/);
  assert.match(html, /<button class="primary-action kinetic-button" data-21st-pattern="button-with-icon material-ripple action-button" type="submit">/);
  assert.match(html, /appointment-scheduler date-wheel-picker/);
  assert.match(html, /scroll-snap-type:y mandatory/);
  assert.match(html, /<span class="wheel-label">Date<\\/span>[\\s\\S]*Apr 24[\\s\\S]*Today[\\s\\S]*Tomorrow/);
  assert.match(html, /<span class="wheel-label">Time<\\/span>[\\s\\S]*4:30 PM[\\s\\S]*5:10 PM[\\s\\S]*10:00 AM/);
  assert.match(html, /WhatsApp/);
  assert.match(html, /@media \\(max-width: 430px\\)/);
  assert.match(html, /clamp\\(/);
  assert.match(html, /overflow-wrap:anywhere/);
  assert.match(html, /word-break:break-word/);
  assert.match(html, /max-width:100%/);
});

test('prepares product requests deterministically', () => {
  const result = moduleApi.process({
    serviceId: 'Priority Review',
    personId: 'Operations Lead',
    displayDate: 'Apr 24',
    client: { name: 'Nico Rivera', phone: '+1 555 0160' },
    channel: 'handoff',
  }, { now: '2026-04-24T09:00:00.000Z' });
  assert.equal(result.accepted, true);
  assert.ok(['booking-ready', 'request-ready'].includes(result.status));
  assert.equal(result.request.service, 'Priority Review');
  assert.equal(result.request.channel, 'handoff');
  assert.equal(result.booking.service, 'Priority Review');
  assert.equal(result.booking.channel, 'handoff');
  assert.equal(result.timestamp, '2026-04-24T09:00:00.000Z');
});

test('service facade renders and records request history', () => {
  const service = moduleApi.createService({ now: '2026-04-24T10:00:00.000Z' });
  const html = service.render({ shopName: 'Project Workspace' });
  service.process({ client: { name: 'Mina Wells' } });
  assert.match(html, /Project Workspace/);
  assert.equal(service.health().ok, true);
  assert.equal(service.getHistory().length, 1);
});
`;
}

function buildFallbackVerifySource() {
  return `#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const moduleRoot = path.join(__dirname, '..');
const result = spawnSync(process.execPath, ['--test', 'src/index.test.js'], {
  cwd: moduleRoot,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
`;
}

async function pathExists(targetPath: string) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyPattern(buildWorkspacePath: string, overlayPath: string, pattern: string) {
  const relativeBase = pattern.replace(/\/\*\*$/, '');
  const sourcePath = path.join(buildWorkspacePath, relativeBase);
  const destinationPath = path.join(overlayPath, relativeBase);
  await mkdir(path.dirname(destinationPath), { recursive: true });
  if (!(await pathExists(sourcePath))) {
    await mkdir(destinationPath, { recursive: true }).catch(() => {});
    return;
  }
  await cp(sourcePath, destinationPath, { recursive: true, force: true });
}

function isGameFrontendNode(node: {
  id: string;
  label: string;
  type?: string;
  description?: string;
  acceptance_criteria?: string[];
  data_contract?: string;
  error_handling?: string[];
}) {
  const productText = [
    node.id,
    node.label,
    node.type,
    node.description,
    node.data_contract,
    ...(node.acceptance_criteria || []),
    ...(node.error_handling || []),
  ].filter(Boolean).join(' ').toLowerCase();

  return /\b(game|player|playable|rhythm|beat|producer|music|cassette|album|track|song|chapter|achievement|career map|story map|level|save cassette|save slot|web audio)\b/i.test(productText);
}

export async function prepareTaskWorkspace(
  buildWorkspacePath: string,
  runtimeDir: string,
  task: OmxExecutionTask,
  options: PrepareTaskWorkspaceOptions = {},
): Promise<OmxWorkerLease> {
  const workerId = `worker-${sanitizeSegment(task.taskId)}`;
  const taskRuntimeDir = path.join(options.externalRuntimeRoot || path.join(runtimeDir, 'workers'), sanitizeSegment(task.taskId));
  const overlayPath = path.join(taskRuntimeDir, 'overlay');

  await rm(taskRuntimeDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(path.join(overlayPath, 'modules'), { recursive: true });

  if (options.copyOmxState !== false) {
    await copyPattern(buildWorkspacePath, overlayPath, '.omx/**');
  }
  for (const pattern of new Set([...task.readSet, ...task.writeSet, ...task.sharedArtifacts])) {
    if (options.copyOmxState === false && pattern.startsWith('.omx/')) {
      continue;
    }
    await copyPattern(buildWorkspacePath, overlayPath, pattern);
  }

  const readmeSource = path.join(buildWorkspacePath, 'README.md');
  if (await pathExists(readmeSource)) {
    await cp(readmeSource, path.join(overlayPath, 'README.md'), { force: true });
  }

  return {
    workerId,
    taskId: task.taskId,
    nodeId: task.nodeId,
    overlayPath,
    taskRuntimeDir,
    startedAt: nowIso(),
    heartbeatAt: nowIso(),
    state: 'starting',
  };
}

export async function materializeTaskScaffold(
  overlayPath: string,
  task: OmxExecutionTask,
	  node: {
	    id: string;
	    label: string;
	    type?: string;
	    description?: string;
	    acceptance_criteria?: string[];
	    data_contract?: string;
	    error_handling?: string[];
	    designProfile?: string;
	    referenceCandidates?: unknown[];
	    selectedReferenceIds?: string[];
	    previewArtifact?: unknown;
	    previewState?: unknown;
	    designVerdict?: unknown;
	  },
	) {
  const moduleDir = path.join(overlayPath, modulePrefix(task));
  await mkdir(moduleDir, { recursive: true });
  const specPath = path.join(moduleDir, 'module.spec.json');
  const readmePath = path.join(moduleDir, 'README.md');
  const packagePath = path.join(moduleDir, 'package.json');
  const srcDir = path.join(moduleDir, 'src');
  const scriptsDir = path.join(moduleDir, 'scripts');
  const indexPath = path.join(srcDir, 'index.js');
  const testPath = path.join(srcDir, 'index.test.js');
  const verifyPath = path.join(scriptsDir, 'verify.cjs');

  await readFile(specPath, 'utf8').catch(async () => {
    await mkdir(path.dirname(specPath), { recursive: true });
    return null;
  });

  const isFrontend = (node.type || '').toLowerCase() === 'frontend';
  const isGameFrontend = isFrontend && isGameFrontendNode(node);
  const materialization = {
    strategy: 'deterministic-fallback',
    baselineKind: isGameFrontend ? 'game-frontend' : isFrontend ? 'product-frontend' : 'module',
    generatedBy: isGameFrontend
      ? 'retrobuilder-game-frontend-baseline'
      : isFrontend
        ? 'retrobuilder-product-frontend-baseline'
        : 'retrobuilder-deterministic-fallback',
  };

  const spec = {
	    id: node.id,
	    label: node.label,
	    type: node.type || 'module',
	    description: node.description || '',
	    dataContract: node.data_contract || '',
	    acceptanceCriteria: node.acceptance_criteria || [],
	    errorHandling: node.error_handling || [],
	    design: {
	      profile: node.designProfile || null,
	      referenceCandidates: node.referenceCandidates || [],
	      selectedReferenceIds: node.selectedReferenceIds || [],
	      previewArtifact: node.previewArtifact || null,
	      previewState: node.previewState || null,
	      verdict: node.designVerdict || null,
	    },
	    executionTask: task.taskId,
	    waveId: task.waveId,
	    materialization,
	  };

  await writeFile(specPath, JSON.stringify(spec, null, 2), 'utf8');
  await writeFile(readmePath, [
    `# ${node.label}`,
    '',
    node.description || 'No description provided.',
    '',
    '## Data Contract',
    node.data_contract || 'No data contract provided.',
    '',
    '## Acceptance Criteria',
    ...(node.acceptance_criteria?.length ? node.acceptance_criteria.map((entry) => `- ${entry}`) : ['- none']),
    '',
    '## Error Handling',
    ...(node.error_handling?.length ? node.error_handling.map((entry) => `- ${entry}`) : ['- none']),
    '',
  ].join('\n'), 'utf8');

  await mkdir(srcDir, { recursive: true });
  await mkdir(scriptsDir, { recursive: true });
  await writeFile(packagePath, JSON.stringify({
    name: packageNameForTask(task),
    version: '0.1.0',
    private: true,
    type: 'commonjs',
    main: 'src/index.js',
    scripts: {
      test: 'node --test src/index.test.js',
      verify: 'node scripts/verify.cjs',
    },
  }, null, 2), 'utf8');
  await writeFile(indexPath, isFrontend ? (isGameFrontend ? buildGameFrontendIndexSource() : buildFallbackFrontendIndexSource()) : buildFallbackIndexSource(), 'utf8');
  await writeFile(testPath, isFrontend ? (isGameFrontend ? buildGameFrontendTestSource() : buildFallbackFrontendTestSource()) : buildFallbackTestSource(), 'utf8');
  await writeFile(verifyPath, buildFallbackVerifySource(), 'utf8');

  return { moduleDir, specPath, readmePath, packagePath, indexPath, testPath, verifyPath };
}

async function runCommand(cwd: string, command: string, args: string[]): Promise<WorkerCommandResult> {
  return await new Promise<WorkerCommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.once('error', reject);
    child.once('exit', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export async function resolveVerifyCommand(overlayPath: string, task: OmxExecutionTask) {
  const prefix = modulePrefix(task);
  const moduleDir = path.join(overlayPath, prefix);
  const packageJsonPath = path.join(moduleDir, 'package.json');
  if (await pathExists(packageJsonPath)) {
    try {
      const parsed = JSON.parse(await readFile(packageJsonPath, 'utf8'));
      if (parsed?.scripts?.verify) {
        return {
          display: `npm run verify --prefix ${prefix}`,
          command: 'npm',
          args: ['run', 'verify', '--prefix', prefix],
          cwd: overlayPath,
          fallback: false,
        };
      }
      if (parsed?.scripts?.test) {
        return {
          display: `npm run test --prefix ${prefix}`,
          command: 'npm',
          args: ['run', 'test', '--prefix', prefix],
          cwd: overlayPath,
          fallback: false,
        };
      }
      if (parsed?.scripts?.build) {
        return {
          display: `npm run build --prefix ${prefix}`,
          command: 'npm',
          args: ['run', 'build', '--prefix', prefix],
          cwd: overlayPath,
          fallback: false,
        };
      }
    } catch {
      // fall through to structural fallback
    }
  }

  const verifyScript = path.join(moduleDir, 'scripts', 'verify.cjs');
  if (await pathExists(verifyScript)) {
    return {
      display: `node ${path.join(prefix, 'scripts/verify.cjs')}`,
      command: 'node',
      args: [path.join(prefix, 'scripts/verify.cjs')],
      cwd: overlayPath,
      fallback: false,
    };
  }

  return {
    display: 'fallback structural verify',
    command: '',
    args: [],
    cwd: overlayPath,
    fallback: true,
  };
}

export async function runVerifyInOverlay(overlayPath: string, task: OmxExecutionTask): Promise<OmxVerifyReceipt> {
  const resolved = await resolveVerifyCommand(overlayPath, task);
  if (resolved.fallback) {
    const manifest = await collectArtifactManifest(overlayPath, task);
    const passed = manifest.totalFiles >= 2;
    return {
      taskId: task.taskId,
      passed,
      command: resolved.display,
      summary: passed
        ? `Structural verify passed with ${manifest.totalFiles} files.`
        : 'Structural verify failed: no module artifacts beyond scaffold.',
      verifiedAt: nowIso(),
    };
  }

  const result = await runCommand(resolved.cwd, resolved.command, resolved.args);
  return {
    taskId: task.taskId,
    passed: result.code === 0,
    command: resolved.display,
    summary: result.code === 0
      ? (result.stdout.trim() || 'Verify command passed.')
      : (result.stderr.trim() || result.stdout.trim() || `Verify command failed with code ${result.code}.`),
    verifiedAt: nowIso(),
  };
}

async function walkFiles(rootPath: string): Promise<string[]> {
  const entries = await import('node:fs/promises').then(({ readdir }) => readdir(rootPath, { withFileTypes: true })).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const targetPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(targetPath));
    } else if (entry.isFile()) {
      files.push(targetPath);
    }
  }
  return files;
}

function patternBase(pattern: string) {
  return pattern.replace(/\/\*\*$/, '');
}

export async function collectArtifactManifest(overlayPath: string, task: OmxExecutionTask): Promise<OmxArtifactManifest> {
  const roots = new Set<string>([
    modulePrefix(task),
    ...task.sharedArtifacts.map(patternBase),
  ]);
  const entries: OmxArtifactManifestEntry[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    const absoluteRoot = path.join(overlayPath, root);
    const files = await walkFiles(absoluteRoot);
    for (const filePath of files) {
      const relativePath = path.relative(overlayPath, filePath);
      if (seen.has(relativePath)) continue;
      seen.add(relativePath);
      const content = await readFile(filePath, 'utf8').catch(() => '');
      entries.push({
        relativePath,
        lines: content.length > 0 ? content.split(/\r?\n/).length : 0,
      });
    }
  }

  return {
    taskId: task.taskId,
    entries,
    totalFiles: entries.length,
    totalLines: entries.reduce((sum, entry) => sum + entry.lines, 0),
  };
}

export async function mergeTaskArtifacts(
  buildWorkspacePath: string,
  overlayPath: string,
  task: OmxExecutionTask,
  manifest: OmxArtifactManifest,
  ownership: OmxOwnershipManifest,
): Promise<OmxMergeReceipt> {
  const ownershipCheck = assertTaskOwnership(
    ownership,
    task.taskId,
    manifest.entries.map((entry) => entry.relativePath),
  );
  if (ownershipCheck.rejectedPaths.length > 0) {
    const ownerCandidates = suggestOwnerCandidates(ownership, task.taskId, ownershipCheck.rejectedPaths);
    return {
      taskId: task.taskId,
      applied: false,
      appliedPaths: ownershipCheck.allowedPaths,
      rejectedPaths: ownershipCheck.rejectedPaths,
      reason: ownershipCheck.violations.join(' | '),
      ownerCandidates,
      mergedAt: nowIso(),
    };
  }

  const exclusiveRoots = new Set<string>([modulePrefix(task)]);
  for (const root of exclusiveRoots) {
    const sourceDir = path.join(overlayPath, root);
    const destinationDir = path.join(buildWorkspacePath, root);
    await rm(destinationDir, { recursive: true, force: true }).catch(() => {});
    await mkdir(path.dirname(destinationDir), { recursive: true });
    if (await pathExists(sourceDir)) {
      await cp(sourceDir, destinationDir, { recursive: true, force: true });
    }
  }

  for (const entry of manifest.entries) {
    const sourcePath = path.join(overlayPath, entry.relativePath);
    const destinationPath = path.join(buildWorkspacePath, entry.relativePath);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    if (await pathExists(sourcePath)) {
      await copyFile(sourcePath, destinationPath);
    }
  }

  return {
    taskId: task.taskId,
    applied: true,
    appliedPaths: manifest.entries.map((entry) => entry.relativePath),
    rejectedPaths: [],
    mergedAt: nowIso(),
  };
}

export async function cleanupTaskWorkspace(taskRuntimeDir: string) {
  await rm(taskRuntimeDir, { recursive: true, force: true }).catch(() => {});
}
