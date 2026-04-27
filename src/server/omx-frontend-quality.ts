import { readdir, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { needsSchedulingControls } from './scheduling-intent.js';

export interface FrontendMobileQualityGateResult {
  passed: boolean;
  summary: string;
  issues: string[];
}

interface FrontendGateNode {
  type?: string;
  label?: string;
  description?: string;
  data_contract?: string;
  acceptance_criteria?: string[];
  error_handling?: string[];
}

const SOURCE_EXTENSIONS = new Set(['.css', '.html', '.js', '.jsx', '.ts', '.tsx']);
const IGNORED_SEGMENTS = new Set(['node_modules', '.next', 'dist', 'build', 'coverage']);

function isIgnoredSourceFile(rootPath: string, targetPath: string) {
  const relativeSegments = path.relative(rootPath, targetPath).split(path.sep);
  if (relativeSegments.some((segment) => IGNORED_SEGMENTS.has(segment) || segment === '__tests__')) {
    return true;
  }
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(path.basename(targetPath));
}

async function walkSourceFiles(rootPath: string, currentPath = rootPath): Promise<string[]> {
  const entries = await readdir(currentPath, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];

  for (const entry of entries) {
    const targetPath = path.join(currentPath, entry.name);
    const relativeSegments = path.relative(rootPath, targetPath).split(path.sep);
    if (relativeSegments.some((segment) => IGNORED_SEGMENTS.has(segment))) continue;

    if (entry.isDirectory()) {
      files.push(...await walkSourceFiles(rootPath, targetPath));
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name)) && !isIgnoredSourceFile(rootPath, targetPath)) {
      files.push(targetPath);
    }
  }

  return files;
}

async function readModuleSourceCorpus(moduleDir: string) {
  const files = await walkSourceFiles(moduleDir);
  const chunks = await Promise.all(files.map(async (filePath) => {
    const content = await readFile(filePath, 'utf8').catch(() => '');
    return `\n/* ${path.relative(moduleDir, filePath)} */\n${content}`;
  }));
  return chunks.join('\n');
}

function hasFrontendSurface(corpus: string) {
  return /<html|<main|<section|className=|renderScreen|createService|export default function|function\s+\w+\s*\([^)]*\)\s*{[\s\S]*return\s*\(/.test(corpus);
}

function hasViewportContract(corpus: string) {
  return /name=["']viewport["']|export\s+const\s+viewport|viewport\s*:\s*{/.test(corpus);
}

function hasResponsiveLayout(corpus: string) {
  return /@media\s*\(|clamp\s*\(|minmax\s*\(|flex-wrap|grid-template-columns|grid-cols-|sm:|md:|lg:|max-w-|w-full/.test(corpus);
}

function hasWrappingProtection(corpus: string) {
  return /overflow-wrap\s*:|word-break\s*:|break-words|break-all|whitespace-normal/.test(corpus);
}

function hasWidthContainment(corpus: string) {
  return /min-width\s*:\s*0|min-w-0|max-width\s*:\s*100%|max-w-full|width\s*:\s*100%|w-full|inline-size\s*:/.test(corpus);
}

function extractLikelyVisibleSurface(corpus: string) {
  const snippets: string[] = [];
  const looksRenderable = (snippet: string) => /<!doctype|<html|<body|<main|<section|<div|<article|<header|<form|<button|class=|className=/.test(snippet);
  const patterns = [
    /return\s+`[\s\S]*?`/g,
    /return\s*\([\s\S]*?\);/g,
    /innerHTML\s*=\s*`[\s\S]*?`/g,
    /document\.body\.innerHTML\s*=\s*`[\s\S]*?`/g,
  ];

  for (const pattern of patterns) {
    for (const match of corpus.matchAll(pattern)) {
      if (looksRenderable(match[0])) {
        snippets.push(match[0]);
      }
    }
  }
  if (/\/\* [^*]+\.html \*\//.test(corpus)) {
    snippets.push(corpus);
  }
  return snippets.join('\n');
}

function hasDeveloperDiagnosticUi(corpus: string) {
  const visibleSurface = extractLikelyVisibleSurface(corpus);
  if (!visibleSurface.trim()) return false;
  const visibleText = visibleSurface.replace(/\$\{[\s\S]*?\}/g, '');
  return [
    /\$\{[\s\S]{0,240}JSON\.stringify\s*\(/,
    /<pre\b/i,
    /<code\b/i,
    />\s*\{\s*["'][A-Za-z0-9_-]+["']\s*:/,
    /\bmodule\s+(spec|contract|id)\b/i,
    /\bdata\s+contract\b/i,
    /\bacceptance\s+criteria\b/i,
    /\bgenerated[-\s]?by\b/i,
    /\b(workflow state|preview payload|pending payload|debug payload|debug panel|debug dashboard|worker status)\b/i,
    /\braw\s+(payload|json|response)\b/i,
  ].some((pattern) => pattern.test(visibleSurface) || pattern.test(visibleText));
}

function hasGenericVisualFallback(corpus: string) {
  const visibleSurface = extractLikelyVisibleSurface(corpus);
  if (!visibleSurface.trim()) return false;
  return [
    /\bEditorial Signal\b/i,
    /\bControl Room\s+(?:\u2014|-)\s+a denser\b/i,
    /\bFocused Flow\b/i,
    /\bbg-black\/30\b/,
    /\bbg-white\/5\b/,
    /\btext-slate-[0-9]/,
    /\bradial-gradient\(circle_at_top_left/i,
    /\bgeneric (placeholder|scaffold|dashboard|card)/i,
    /\bdark glass\b/i,
    /\bflat card pile\b/i,
  ].some((pattern) => pattern.test(visibleSurface));
}

function hasProductActionPrimitive(corpus: string) {
  return /<form\b|<button\b|<a\s+[^>]*href=|role=["']button["']|onClick\s*=|onclick\s*=|addEventListener\s*\(|createElement\s*\(\s*["'](?:button|a|form)["']\s*\)/.test(corpus);
}

function hasProductFlowLanguage(corpus: string) {
  return /\b(order|book|booking|checkout|schedule|subscribe|request|reserve|confirm|cart|customer|client|delivery|appointment|whatsapp|message|contact|play|player|start|continue|chapter|level|save|score|combo|beat|unlock|achievement|mission|quest|story)\b/i.test(corpus);
}

function nodeProductText(node: FrontendGateNode) {
  return [
    node.label,
    node.description,
    node.data_contract,
    ...(node.acceptance_criteria || []),
    ...(node.error_handling || []),
  ].filter(Boolean).join('\n');
}

function needsSchedulingControl(node: FrontendGateNode) {
  return needsSchedulingControls(nodeProductText(node));
}

function hasTranslatedDateTimeControl(corpus: string) {
  return /data-21st-pattern=["'][^"']*(appointment-scheduler|date-wheel-picker|calendar|date-time)|\b(appointment-scheduler|date-wheel-picker|calendar-rac|time-slot-grid)\b|scroll-snap-type\s*:|aria-label=["'][^"']*(date|time|appointment|slot)/i.test(corpus);
}

function hasTranslatedActionControl(corpus: string) {
  return /data-21st-pattern=["'][^"']*(action-button|button-with-icon|material-ripple|liquid-metal-button|ripple|radio-group-dashed|choice-control|state-icon|animated-state|time-slot-button)|\b(kinetic-button|button-with-icon|material-ripple|liquid-metal-button|radio-group-dashed|choice-control|animated-state-icons|buttonVariants)\b|active:scale-|:active\s*{/i.test(corpus);
}

export async function runFrontendMobileQualityGate(
  moduleDir: string,
  node: FrontendGateNode,
): Promise<FrontendMobileQualityGateResult> {
  if ((node.type || '').toLowerCase() !== 'frontend') {
    return {
      passed: true,
      issues: [],
      summary: 'Frontend mobile quality gate skipped: module is not frontend.',
    };
  }

  const corpus = await readModuleSourceCorpus(moduleDir);
  const issues: string[] = [];

  if (!hasFrontendSurface(corpus)) {
    issues.push('No renderable frontend surface was detected.');
  }
  if (!hasViewportContract(corpus)) {
    issues.push('Missing mobile viewport contract.');
  }
  if (!hasResponsiveLayout(corpus)) {
    issues.push('Missing responsive layout primitives such as @media, clamp(), flex-wrap, or responsive width utilities.');
  }
  if (!hasWrappingProtection(corpus)) {
    issues.push('Missing long-content wrapping safeguards such as overflow-wrap, word-break, break-words, or whitespace-normal.');
  }
  if (!hasWidthContainment(corpus)) {
    issues.push('Missing width containment safeguards such as min-width: 0, max-width: 100%, max-w-full, or width: 100%.');
  }
  if (hasDeveloperDiagnosticUi(corpus)) {
    issues.push('Visible frontend appears to expose developer diagnostics such as raw JSON, module contracts, acceptance criteria, or debug payloads.');
  }
  if (hasGenericVisualFallback(corpus)) {
    issues.push('Visible frontend appears to use generic dark/glass/card fallback vocabulary instead of a distinctive product design pattern.');
  }
  if (!hasProductActionPrimitive(corpus)) {
    issues.push('Missing product action primitives such as forms, buttons, links, or event-driven controls.');
  }
  if (!hasProductFlowLanguage(corpus)) {
    issues.push('Missing domain product-flow language such as order, booking, schedule, subscribe, request, customer, delivery, WhatsApp, or contact.');
  }
  if (needsSchedulingControl(node) && !hasTranslatedDateTimeControl(corpus)) {
    issues.push('Booking/scheduling frontend is missing a translated 21st date/time control such as Appointment Scheduler, Calendar, or Date Wheel Picker.');
  }
    if (needsSchedulingControl(node) && !hasTranslatedActionControl(corpus)) {
      issues.push('Booking/scheduling frontend is missing translated 21st interaction behavior such as icon CTA, radio choice, material ripple, state icon, or active press state.');
    }

  if (issues.length > 0) {
    return {
      passed: false,
      issues,
      summary: `Frontend mobile quality gate failed for ${node.label || 'frontend module'}: ${issues.join(' ')}`,
    };
  }

  return {
    passed: true,
    issues: [],
    summary: `Frontend mobile quality gate passed for ${node.label || 'frontend module'}: 390px viewport contract, responsive layout, long-copy wrapping, width containment, and product-surface checks are present.`,
  };
}
