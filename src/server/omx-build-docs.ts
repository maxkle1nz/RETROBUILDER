import { chmod, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { OmxExecutionGraph } from './omx-scheduler.js';
import type { SessionDocument } from './session-store.js';
import type { SpecularBuildDesignSummary } from './specular-create/specular-types.js';
import type { OmxMergeReceipt, OmxVerifyReceipt } from './omx-worker.js';

export interface OmxBuildDocumentationTechnology {
  name: string;
  note: string;
}

export interface OmxBuildDocumentationCommand {
  name: string;
  command: string;
  description: string;
}

export interface OmxBuildDocumentationEnvVar {
  name: string;
  required: boolean;
  description: string;
}

export interface OmxBuildLaunchPlan {
  stack: string;
  workingDirectory: string;
  setupCommand?: string;
  runCommand: string;
  buildCommand?: string;
  validationCommand?: string;
  previewUrl?: string;
  healthUrl?: string;
  runScriptPath?: string;
  launchScriptPath?: string;
  copyPasteScript: string;
  notes: string[];
}

export type OmxBuildDocumentationDeliverableKind = 'app' | 'service' | 'data' | 'integration' | 'security' | 'library';

export interface OmxBuildDocumentationDeliverable {
  id: string;
  label: string;
  kind: OmxBuildDocumentationDeliverableKind;
  primary: boolean;
  path: string;
  runCommand?: string;
  previewUrl?: string;
  healthUrl?: string;
  description: string;
  modules: string[];
  evidence: string[];
}

export type OmxRunnableManifestCommandPurpose = 'setup' | 'run' | 'build' | 'validate' | 'inspect';

export interface OmxRunnableManifestCommand {
  name: string;
  command: string;
  description: string;
  purpose: OmxRunnableManifestCommandPurpose;
  primary: boolean;
}

export interface OmxRunnableManifestEndpoint {
  name: 'preview' | 'health' | string;
  url: string;
  method: 'GET';
  purpose: string;
}

export interface OmxRunnableManifestDeliverable {
  id: string;
  label: string;
  kind: OmxBuildDocumentationDeliverableKind;
  primary: boolean;
  path: string;
  runCommand?: string;
  previewUrl?: string;
  healthUrl?: string;
}

export interface OmxRunnableManifest {
  version: 1;
  generatedAt: string;
  projectName: string;
  manifestPath: string;
  workspacePath: string;
  stack: string;
  workingDirectory: string;
  launchScriptPath?: string;
  runScriptPath?: string;
  primaryRunCommand: string;
  setupCommand?: string;
  buildCommand?: string;
  validationCommand?: string;
  copyPasteScript: string;
  commands: OmxRunnableManifestCommand[];
  endpoints: OmxRunnableManifestEndpoint[];
  deliverables: OmxRunnableManifestDeliverable[];
  environment: OmxBuildDocumentationEnvVar[];
  evidence: {
    launchPlanSource: 'generated-launch-plan';
    systemVerifyStatus: 'pending' | 'passed' | 'failed' | 'not_available';
    systemVerifyCommand?: string;
    designGateStatus: SpecularBuildDesignSummary['designGateStatus'];
    designScore: number;
  };
  warnings: string[];
}

export interface OmxBuildDocumentationModule {
  nodeId: string;
  label: string;
  type: string;
  modulePath: string;
  readmePath: string;
  description: string;
  dataContract: string;
  acceptanceCriteria: string[];
  errorHandling: string[];
  artifactCount: number;
  artifactLines: number;
  filePreview: string[];
  verifyCommand?: string;
  verifySummary?: string;
  mergeSummary?: string;
  scripts: string[];
  materialization?: {
    strategy?: string;
    baselineKind?: string;
    generatedBy?: string;
  };
}

export type OmxBuildDocumentationQualityStatus = 'passed' | 'needs_review' | 'failed';

export interface OmxBuildDocumentationQualityCheck {
  id: string;
  label: string;
  weight: number;
  status: OmxBuildDocumentationQualityStatus;
  detail: string;
}

export interface OmxBuildDocumentationQuality {
  status: OmxBuildDocumentationQualityStatus;
  score: number;
  findings: string[];
  strengths: string[];
  checks: OmxBuildDocumentationQualityCheck[];
}

export interface OmxBuildDocumentationSummary {
  generatedAt: string;
  projectName: string;
  dossierPath: string;
  wikiPath: string;
  wikiBuildSummaryPath: string;
  readmePath: string;
  summary: string;
  workspacePath: string;
  intakeChannels: string[];
  usageModes: string[];
  technologies: OmxBuildDocumentationTechnology[];
  commands: OmxBuildDocumentationCommand[];
  launchPlan: OmxBuildLaunchPlan;
  runnableManifest: OmxRunnableManifest;
  deliverables: OmxBuildDocumentationDeliverable[];
  environmentVariables: OmxBuildDocumentationEnvVar[];
  modules: OmxBuildDocumentationModule[];
  quality: OmxBuildDocumentationQuality;
  verification: {
    designGateStatus: SpecularBuildDesignSummary['designGateStatus'];
    designScore: number;
    designFindings: string[];
    designEvidence: string[];
    systemVerify: {
      status: 'pending' | 'passed' | 'failed' | 'not_available';
      command?: string;
      summary?: string;
    };
    verifyReceipts: Array<{
      taskId: string;
      passed: boolean;
      command: string;
      summary: string;
    }>;
    mergeReceipts: Array<{
      taskId: string;
      applied: boolean;
      appliedPaths: number;
      rejectedPaths: number;
      reason?: string;
    }>;
  };
  workspace: {
    totalFiles: number;
    totalLines: number;
    elapsedMs: number;
  };
  wikiPages: Array<{
    title: string;
    path: string;
    moduleId?: string;
  }>;
  wikiMarkdown: string;
  readmeMarkdown: string;
}

export interface OmxBuildDocumentationArtifacts {
  documentation: OmxBuildDocumentationSummary;
  runnableManifest: OmxRunnableManifest;
  dossierPath: string;
  wikiPath: string;
  readmePath: string;
}

interface GenerateOmxBuildDocumentationOptions {
  workspacePath: string;
  session: SessionDocument;
  buildId: string;
  executionGraph: OmxExecutionGraph;
  verifyReceipts: Record<string, OmxVerifyReceipt>;
  mergeReceipts: Record<string, OmxMergeReceipt>;
  designSummary: SpecularBuildDesignSummary;
  systemVerify: {
    status: 'pending' | 'passed' | 'failed' | 'not_available';
    command?: string;
    summary?: string;
  };
  elapsedMs: number;
}

interface PackageSnapshot {
  relativePath: string;
  name?: string;
  scripts: Record<string, string>;
  dependencies: string[];
  devDependencies: string[];
}

interface WorkspaceStackMarkers {
  hasPyprojectToml: boolean;
  hasRequirementsTxt: boolean;
  hasUvLock: boolean;
  hasCargoToml: boolean;
  hasGoMod: boolean;
  hasAppPy: boolean;
  hasMainPy: boolean;
  hasIndexHtml: boolean;
}

const GENERATED_LAUNCH_SCRIPT_PATH = '.omx/run-project.sh';
const GENERATED_RUNNABLE_MANIFEST_PATH = '.omx/runnable-manifest.json';

function sanitizeSegment(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'module';
}

function rel(workspacePath: string, targetPath: string) {
  return path.relative(workspacePath, targetPath) || '.';
}

async function pathExists(targetPath: string) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(targetPath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(targetPath, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function walkFiles(rootPath: string): Promise<string[]> {
  if (!(await pathExists(rootPath))) return [];
  const entries = await readdir(rootPath, { withFileTypes: true });
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

async function countWorkspaceArtifacts(targetPath: string) {
  const files = await walkFiles(targetPath);
  let totalLines = 0;
  for (const filePath of files) {
    const content = await readFile(filePath, 'utf8').catch(() => '');
    totalLines += content.length > 0 ? content.split(/\r?\n/).length : 0;
  }
  return { totalFiles: files.length, totalLines };
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function firstParagraph(markdown: string) {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('#'));
  return lines[0] || '';
}

function envDescription(name: string) {
  if (name === 'PORT') return 'Port used by the generated root runtime.';
  if (name === 'NODE_ENV') return 'Execution mode for the generated workspace.';
  if (name === 'DATABASE_URL') return 'Primary database connection string.';
  if (name === 'JWT_SECRET') return 'Signing secret for generated auth flows.';
  return 'Environment value referenced by the generated workspace.';
}

function commandDescription(name: string) {
  if (name === 'bootstrap') return 'Install workspace dependencies and prepare generated packages.';
  if (name === 'verify') return 'Run module-level verification across the generated workspace.';
  if (name === 'build') return 'Execute the root build/certification path for the runnable module.';
  if (name === 'start') return 'Launch the generated runtime and expose preview/health routes.';
  if (name === 'smoke') return 'Run the generated runtime smoke check against /api/health.';
  if (name === 'dev') return 'Proxy the workspace into the primary runnable module dev loop.';
  return 'Generated root command.';
}

function shellQuote(value: string) {
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}

function envPrefix(name: string, value: string | number) {
  return `${name}=${String(value)}`;
}

function parseEnvValue(envExample: string, name: string) {
  const line = envExample
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry && !entry.startsWith('#') && entry.startsWith(`${name}=`));
  if (!line) return undefined;
  return line.slice(line.indexOf('=') + 1).trim();
}

function suggestedPreviewPort(envExample: string) {
  const generatedPort = Number(parseEnvValue(envExample, 'PORT') || '7777');
  const currentAppPort = Number(process.env.RETROBUILDER_PORT || process.env.PORT || '');
  const basePort = Number.isFinite(generatedPort) && generatedPort > 0 ? generatedPort : 7777;
  if (Number.isFinite(currentAppPort) && currentAppPort > 0 && currentAppPort === basePort) {
    return basePort + 30;
  }
  return basePort;
}

function scriptPathFromCommand(command: string | undefined) {
  if (!command) return undefined;
  const match = command.match(/^node\s+(.+\.cjs)$/);
  return match?.[1];
}

function pushTechnology(
  bucket: Map<string, OmxBuildDocumentationTechnology>,
  name: string,
  note: string,
) {
  if (!bucket.has(name)) {
    bucket.set(name, { name, note });
  }
}

function detectIntakeChannels(session: SessionDocument) {
  const corpus = [
    session.name,
    session.manifesto,
    session.architecture,
    ...session.graph.nodes.flatMap((node) => [
      node.label,
      node.description || '',
      node.data_contract || '',
      ...(node.acceptance_criteria || []),
      ...(node.error_handling || []),
    ]),
  ]
    .join('\n')
    .toLowerCase();

  const channels: string[] = [];
  if (corpus.includes('whatsapp')) {
    channels.push('WhatsApp intake');
  }
  if (corpus.includes('mobile-first') || corpus.includes('mobile first') || corpus.includes('website') || corpus.includes('web app') || corpus.includes('web')) {
    channels.push('Mobile-first web intake');
  }
  return channels;
}

async function collectPackageSnapshots(workspacePath: string, modulePaths: string[]) {
  const candidates = [path.join(workspacePath, 'package.json'), ...modulePaths.map((modulePath) => path.join(workspacePath, modulePath, 'package.json'))];
  const snapshots: PackageSnapshot[] = [];
  for (const candidate of candidates) {
    const parsed = await readJson<Record<string, unknown>>(candidate);
    if (!parsed) continue;
    const scripts = typeof parsed.scripts === 'object' && parsed.scripts
      ? Object.fromEntries(Object.entries(parsed.scripts as Record<string, unknown>).filter(([, value]) => typeof value === 'string')) as Record<string, string>
      : {};
    const dependencies = typeof parsed.dependencies === 'object' && parsed.dependencies
      ? Object.keys(parsed.dependencies as Record<string, unknown>)
      : [];
    const devDependencies = typeof parsed.devDependencies === 'object' && parsed.devDependencies
      ? Object.keys(parsed.devDependencies as Record<string, unknown>)
      : [];
    snapshots.push({
      relativePath: rel(workspacePath, candidate),
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      scripts,
      dependencies,
      devDependencies,
    });
  }
  return snapshots;
}

async function collectStackMarkers(workspacePath: string): Promise<WorkspaceStackMarkers> {
  const has = (fileName: string) => pathExists(path.join(workspacePath, fileName));
  const [
    hasPyprojectToml,
    hasRequirementsTxt,
    hasUvLock,
    hasCargoToml,
    hasGoMod,
    hasAppPy,
    hasMainPy,
    hasIndexHtml,
  ] = await Promise.all([
    has('pyproject.toml'),
    has('requirements.txt'),
    has('uv.lock'),
    has('Cargo.toml'),
    has('go.mod'),
    has('app.py'),
    has('main.py'),
    has('index.html'),
  ]);

  return {
    hasPyprojectToml,
    hasRequirementsTxt,
    hasUvLock,
    hasCargoToml,
    hasGoMod,
    hasAppPy,
    hasMainPy,
    hasIndexHtml,
  };
}

function collectTechnologies(
  session: SessionDocument,
  packages: PackageSnapshot[],
  intakeChannels: string[],
  stackMarkers: WorkspaceStackMarkers,
) {
  const tech = new Map<string, OmxBuildDocumentationTechnology>();
  if (packages.length > 0) {
    pushTechnology(tech, 'Node.js runtime', 'Generated workspace includes Node.js package scripts or module wrappers.');
  }
  if (stackMarkers.hasCargoToml) {
    pushTechnology(tech, 'Rust/Cargo', 'Generated workspace declares a native Rust project through Cargo.toml.');
  }
  if (stackMarkers.hasGoMod) {
    pushTechnology(tech, 'Go modules', 'Generated workspace declares a Go module through go.mod.');
  }
  if (stackMarkers.hasPyprojectToml || stackMarkers.hasRequirementsTxt || stackMarkers.hasUvLock || stackMarkers.hasAppPy || stackMarkers.hasMainPy) {
    pushTechnology(tech, 'Python runtime', 'Generated workspace declares Python package or entrypoint markers.');
  }
  if (stackMarkers.hasIndexHtml && packages.length === 0) {
    pushTechnology(tech, 'Static web surface', 'Generated workspace can be previewed directly from index.html.');
  }

  const deps = unique(packages.flatMap((pkg) => [...pkg.dependencies, ...pkg.devDependencies]));
  if (deps.includes('typescript') || deps.includes('tsx') || deps.includes('@types/node')) {
    pushTechnology(tech, 'TypeScript toolchain', 'Workspace root ships with TypeScript/TSX support for generated modules and verification.');
  }
  if (deps.includes('react') || deps.includes('react-dom')) {
    pushTechnology(tech, 'React', 'A generated module depends on React for UI rendering.');
  }
  if (deps.includes('next')) {
    pushTechnology(tech, 'Next.js', 'A generated module declares Next.js in its package graph.');
  }
  if (deps.includes('vite')) {
    pushTechnology(tech, 'Vite', 'A generated module declares Vite for local frontend execution.');
  }
  if (deps.includes('express')) {
    pushTechnology(tech, 'Express', 'A generated module declares Express in its package graph.');
  }
  if (deps.includes('tailwindcss')) {
    pushTechnology(tech, 'Tailwind CSS', 'A generated module declares Tailwind CSS for styling.');
  }

  if (packages.some((pkg) => Object.keys(pkg.scripts).includes('smoke'))) {
    pushTechnology(tech, 'Root certification wrappers', 'The workspace exposes generated bootstrap/verify/build/start/smoke entrypoints.');
  }

  if (session.graph.nodes.some((node) => (node.type || '').toLowerCase() === 'frontend')) {
    pushTechnology(tech, 'Mobile-first UI surface', 'The graph contains at least one frontend lane intended for user-facing delivery.');
  }
  if (session.graph.nodes.some((node) => (node.type || '').toLowerCase() === 'backend')) {
    pushTechnology(tech, 'Service modules', 'The graph contains backend/service lanes materialized as isolated workspace modules.');
  }
  if (session.graph.nodes.some((node) => (node.type || '').toLowerCase() === 'database')) {
    pushTechnology(tech, 'Persistence layer', 'The graph includes a dedicated database or persistence lane.');
  }
  if (intakeChannels.includes('WhatsApp intake')) {
    pushTechnology(tech, 'WhatsApp order intake', 'Blueprint language explicitly references WhatsApp as an intake channel.');
  }
  if (intakeChannels.includes('Mobile-first web intake')) {
    pushTechnology(tech, 'Web ordering flow', 'Blueprint language explicitly references a mobile-first website or web app.');
  }

  return [...tech.values()];
}

function buildCommands(rootPackage: PackageSnapshot | undefined) {
  if (!rootPackage) return [];
  return Object.keys(rootPackage.scripts).map((name) => ({
    name,
    command: `npm run ${name}`,
    description: commandDescription(name),
  }));
}

function buildLaunchPlan(options: {
  workspacePath: string;
  envExample: string;
  rootPackage?: PackageSnapshot;
  stackMarkers: WorkspaceStackMarkers;
  technologies: OmxBuildDocumentationTechnology[];
}): OmxBuildLaunchPlan {
  const rootScripts = options.rootPackage?.scripts || {};
  const hasPackageJson = Boolean(options.rootPackage);
  const previewPort = suggestedPreviewPort(options.envExample);
  const previewUrl = `http://127.0.0.1:${previewPort}/`;
  const healthUrl = `http://127.0.0.1:${previewPort}/api/health`;

  if (!hasPackageJson && options.stackMarkers.hasCargoToml) {
    const setupCommand = 'cargo fetch';
    const runCommand = `${envPrefix('PORT', previewPort)} cargo run`;
    const validationCommand = 'cargo test';
    return {
      stack: 'Rust/Cargo workspace',
      workingDirectory: options.workspacePath,
      setupCommand,
      runCommand,
      validationCommand,
      launchScriptPath: GENERATED_LAUNCH_SCRIPT_PATH,
      copyPasteScript: [
        `cd ${shellQuote(options.workspacePath)}`,
        setupCommand,
        runCommand,
      ].join('\n'),
      notes: [
        'Rust workspace detected from Cargo.toml; preview URLs are omitted unless the generated service documents an HTTP port.',
        `Validate the generated project with \`${validationCommand}\`.`,
      ],
    };
  }

  if (!hasPackageJson && options.stackMarkers.hasGoMod) {
    const setupCommand = 'go mod download';
    const runCommand = `${envPrefix('PORT', previewPort)} go run .`;
    const validationCommand = 'go test ./...';
    return {
      stack: 'Go module workspace',
      workingDirectory: options.workspacePath,
      setupCommand,
      runCommand,
      validationCommand,
      launchScriptPath: GENERATED_LAUNCH_SCRIPT_PATH,
      copyPasteScript: [
        `cd ${shellQuote(options.workspacePath)}`,
        setupCommand,
        runCommand,
      ].join('\n'),
      notes: [
        'Go workspace detected from go.mod; preview URLs are omitted unless the generated service documents an HTTP port.',
        `Validate the generated project with \`${validationCommand}\`.`,
      ],
    };
  }

  if (!hasPackageJson && (options.stackMarkers.hasPyprojectToml || options.stackMarkers.hasRequirementsTxt || options.stackMarkers.hasAppPy || options.stackMarkers.hasMainPy)) {
    const entrypoint = options.stackMarkers.hasAppPy ? 'app.py' : options.stackMarkers.hasMainPy ? 'main.py' : undefined;
    const setupCommand = options.stackMarkers.hasUvLock
      ? 'uv sync'
      : options.stackMarkers.hasRequirementsTxt
        ? 'python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt'
        : options.stackMarkers.hasPyprojectToml
          ? 'python3 -m venv .venv && . .venv/bin/activate && pip install -e .'
          : undefined;
    const runCommand = entrypoint
      ? options.stackMarkers.hasUvLock
        ? `${envPrefix('PORT', previewPort)} uv run python ${entrypoint}`
        : `. .venv/bin/activate && ${envPrefix('PORT', previewPort)} python ${entrypoint}`
      : 'Inspect README.md for the generated Python entrypoint.';
    const validationCommand = options.stackMarkers.hasUvLock
      ? 'uv run python -m pytest'
      : setupCommand
        ? '. .venv/bin/activate && python -m pytest'
        : undefined;
    return {
      stack: 'Python workspace',
      workingDirectory: options.workspacePath,
      setupCommand,
      runCommand,
      validationCommand,
      launchScriptPath: GENERATED_LAUNCH_SCRIPT_PATH,
      copyPasteScript: [
        `cd ${shellQuote(options.workspacePath)}`,
        ...(setupCommand ? [setupCommand] : []),
        runCommand,
      ].join('\n'),
      notes: [
        entrypoint
          ? `Python entrypoint inferred from \`${entrypoint}\`.`
          : 'Python stack detected, but no app.py or main.py entrypoint was found.',
        validationCommand
          ? `Validate the generated project with \`${validationCommand}\`.`
          : 'No generated validation command was detected.',
      ],
    };
  }

  if (!hasPackageJson && options.stackMarkers.hasIndexHtml) {
    const runCommand = `python3 -m http.server ${previewPort}`;
    return {
      stack: 'Static web workspace',
      workingDirectory: options.workspacePath,
      runCommand,
      previewUrl,
      launchScriptPath: GENERATED_LAUNCH_SCRIPT_PATH,
      copyPasteScript: [
        `cd ${shellQuote(options.workspacePath)}`,
        runCommand,
      ].join('\n'),
      notes: [
        'Static web surface detected from index.html; using Python http.server as a zero-dependency preview.',
        'No generated validation command was detected.',
      ],
    };
  }

  const stackParts = hasPackageJson
    ? ['Node.js workspace', ...options.technologies
      .map((technology) => technology.name)
      .filter((name) => !['Node.js runtime', 'Root certification wrappers'].includes(name))
      .slice(0, 3)]
    : ['Generated workspace'];
  const setupCommand = rootScripts.bootstrap
    ? 'npm run bootstrap'
    : hasPackageJson
      ? 'npm install'
      : undefined;
  const runnableScriptName = rootScripts.start
    ? 'start'
    : rootScripts.dev
      ? 'dev'
      : undefined;
  const buildCommand = rootScripts.build ? 'npm run build' : undefined;
  const runCommand = runnableScriptName
    ? `${envPrefix('PORT', previewPort)} npm run ${runnableScriptName}`
    : 'Inspect README.md for the generated stack-specific run command.';
  const validationCommand = rootScripts.smoke
    ? 'npm run smoke'
    : rootScripts.verify
      ? 'npm run verify'
      : undefined;
  const scriptLines = [
    `cd ${shellQuote(options.workspacePath)}`,
    ...(setupCommand ? [setupCommand] : []),
    ...(buildCommand && !runnableScriptName ? [buildCommand] : []),
    runnableScriptName
      ? runCommand
      : 'echo "No long-running start/dev script was detected. Inspect README.md before treating this as a runnable handoff."',
  ];
  const notes = [
    runnableScriptName === 'start'
      ? 'Uses the generated root runtime so every stack exposes the same preview and health URLs.'
      : runnableScriptName === 'dev'
        ? 'Uses the generated dev loop because this workspace does not expose a start script.'
        : 'No long-running preview script was detected; validate with the generated command list.',
    validationCommand
      ? `Validate the generated project with \`${validationCommand}\`.`
      : 'No generated validation command was detected.',
  ];

  return {
    stack: stackParts.join(' + '),
    workingDirectory: options.workspacePath,
    setupCommand,
    runCommand,
    buildCommand,
    validationCommand,
    previewUrl: runnableScriptName ? previewUrl : undefined,
    healthUrl: runnableScriptName ? healthUrl : undefined,
    runScriptPath: scriptPathFromCommand(rootScripts.start || rootScripts.dev),
    launchScriptPath: GENERATED_LAUNCH_SCRIPT_PATH,
    copyPasteScript: scriptLines.join('\n'),
    notes,
  };
}

function deliverableKindForModule(module: OmxBuildDocumentationModule): OmxBuildDocumentationDeliverableKind {
  const type = module.type.toLowerCase();
  if (type === 'frontend') return 'app';
  if (type === 'backend') return 'service';
  if (type === 'database') return 'data';
  if (type === 'external') return 'integration';
  if (type === 'security') return 'security';
  return 'library';
}

function primaryDeliverableIndex(deliverables: Array<Pick<OmxBuildDocumentationDeliverable, 'kind'>>) {
  const appIndex = deliverables.findIndex((entry) => entry.kind === 'app');
  if (appIndex >= 0) return appIndex;
  const serviceIndex = deliverables.findIndex((entry) => entry.kind === 'service');
  if (serviceIndex >= 0) return serviceIndex;
  const securityIndex = deliverables.findIndex((entry) => entry.kind === 'security');
  if (securityIndex >= 0) return securityIndex;
  return 0;
}

function buildModuleRunCommand(module: OmxBuildDocumentationModule) {
  const preferredScript = ['start', 'dev', 'serve', 'preview'].find((script) => module.scripts.includes(script));
  return preferredScript ? `npm --prefix ${module.modulePath} run ${preferredScript}` : undefined;
}

function launchPlanIsRunnable(launchPlan: Pick<OmxBuildLaunchPlan, 'runCommand'>) {
  return launchPlan.runCommand.trim().length > 0 && !launchPlan.runCommand.startsWith('Inspect README.md');
}

function buildDeliverables(options: {
  projectName: string;
  modules: OmxBuildDocumentationModule[];
  launchPlan: OmxBuildLaunchPlan;
}): OmxBuildDocumentationDeliverable[] {
  if (options.modules.length === 0) {
    const kind: OmxBuildDocumentationDeliverableKind = /web|static|frontend|react|vite/i.test(options.launchPlan.stack)
      ? 'app'
      : 'service';
    return [{
      id: 'workspace',
      label: options.projectName,
      kind,
      primary: true,
      path: '.',
      runCommand: launchPlanIsRunnable(options.launchPlan) ? options.launchPlan.runCommand : undefined,
      previewUrl: options.launchPlan.previewUrl,
      healthUrl: options.launchPlan.healthUrl,
      description: 'Root generated workspace entrypoint inferred from stack markers and launch metadata.',
      modules: [],
      evidence: [
        `Stack: ${options.launchPlan.stack}`,
        options.launchPlan.validationCommand ? `Validation: ${options.launchPlan.validationCommand}` : 'Validation command not detected',
      ],
    }];
  }

  const deliverables = options.modules.map((module) => {
    const kind = deliverableKindForModule(module);
    const runCommand = buildModuleRunCommand(module);
    return {
      id: module.nodeId || sanitizeSegment(module.label),
      label: module.label,
      kind,
      primary: false,
      path: module.modulePath,
      runCommand,
      description: module.description,
      modules: [module.nodeId],
      evidence: [
        `${module.artifactCount} file(s), ${module.artifactLines.toLocaleString()} line(s)`,
        module.materialization?.strategy ? `Materialization: ${module.materialization.strategy}${module.materialization.baselineKind ? ` (${module.materialization.baselineKind})` : ''}` : 'Materialization: generated artifacts',
        module.verifySummary ? `Verified: ${module.verifySummary.replace(/\s+/g, ' ').trim().slice(0, 160)}` : `Verify command: ${module.verifyCommand || 'n/a'}`,
        module.scripts.length > 0 ? `Scripts: ${module.scripts.join(', ')}` : 'No module scripts detected',
      ],
    } satisfies OmxBuildDocumentationDeliverable;
  });
  const primaryIndex = primaryDeliverableIndex(deliverables);

  return deliverables
    .map((deliverable, index) => {
      if (index !== primaryIndex) return deliverable;
      return {
        ...deliverable,
        primary: true,
        runCommand: launchPlanIsRunnable(options.launchPlan) ? options.launchPlan.runCommand : deliverable.runCommand,
        previewUrl: options.launchPlan.previewUrl,
        healthUrl: options.launchPlan.healthUrl,
      };
    })
    .sort((left, right) => Number(right.primary) - Number(left.primary));
}

function renderGeneratedLaunchScript(launchPlan: OmxBuildLaunchPlan) {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    'WORKSPACE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"',
    'cd "$WORKSPACE_DIR"',
    '',
    ...(launchPlan.setupCommand ? [launchPlan.setupCommand] : []),
    ...(launchPlan.buildCommand && !launchPlanIsRunnable(launchPlan) ? [launchPlan.buildCommand] : []),
    launchPlanIsRunnable(launchPlan)
      ? launchPlan.runCommand
      : 'echo "No long-running start/dev script was detected. Inspect README.md before treating this as a runnable handoff."',
    '',
  ].join('\n');
}

async function writeGeneratedLaunchScript(workspacePath: string, launchPlan: OmxBuildLaunchPlan) {
  if (!launchPlan.launchScriptPath) return;
  const absolutePath = path.join(workspacePath, launchPlan.launchScriptPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, renderGeneratedLaunchScript(launchPlan), 'utf8');
  await chmod(absolutePath, 0o755).catch(() => {});
}

function manifestCommandPurpose(name: string): OmxRunnableManifestCommandPurpose {
  const normalized = name.toLowerCase();
  if (normalized.includes('bootstrap') || normalized.includes('install') || normalized === 'setup') return 'setup';
  if (normalized.includes('start') || normalized.includes('dev') || normalized.includes('serve') || normalized === 'run') return 'run';
  if (normalized.includes('build') || normalized.includes('compile')) return 'build';
  if (normalized.includes('verify') || normalized.includes('test') || normalized.includes('smoke') || normalized.includes('check')) return 'validate';
  return 'inspect';
}

function buildRunnableManifestCommandBucket(options: {
  commands: OmxBuildDocumentationCommand[];
  launchPlan: OmxBuildLaunchPlan;
}) {
  const entries = new Map<string, OmxRunnableManifestCommand>();
  const add = (
    name: string,
    command: string | undefined,
    description: string,
    purpose: OmxRunnableManifestCommandPurpose,
    primary = false,
  ) => {
    if (!command?.trim()) return;
    const existing = entries.get(command);
    entries.set(command, {
      name: existing?.name || name,
      command,
      description: existing?.description || description,
      purpose: primary ? purpose : existing?.purpose || purpose,
      primary: primary || existing?.primary || false,
    });
  };

  for (const command of options.commands) {
    add(command.name, command.command, command.description, manifestCommandPurpose(command.name), false);
  }

  add('setup', options.launchPlan.setupCommand, 'Prepare dependencies before running the generated project.', 'setup');
  add('run', options.launchPlan.runCommand, 'Primary stack-aware command for launching the generated project.', 'run', launchPlanIsRunnable(options.launchPlan));
  add('build', options.launchPlan.buildCommand, 'Build or package the generated project.', 'build');
  add('validate', options.launchPlan.validationCommand, 'Validate the generated project after launch or build.', 'validate');

  return [...entries.values()].sort((left, right) => Number(right.primary) - Number(left.primary));
}

function buildRunnableManifest(options: {
  generatedAt: string;
  projectName: string;
  workspacePath: string;
  commands: OmxBuildDocumentationCommand[];
  launchPlan: OmxBuildLaunchPlan;
  deliverables: OmxBuildDocumentationDeliverable[];
  environmentVariables: OmxBuildDocumentationEnvVar[];
  designSummary: SpecularBuildDesignSummary;
  systemVerify: GenerateOmxBuildDocumentationOptions['systemVerify'];
}): OmxRunnableManifest {
  const endpoints: OmxRunnableManifestEndpoint[] = [
    ...(options.launchPlan.previewUrl ? [{
      name: 'preview',
      url: options.launchPlan.previewUrl,
      method: 'GET' as const,
      purpose: 'Open the generated project preview.',
    }] : []),
    ...(options.launchPlan.healthUrl ? [{
      name: 'health',
      url: options.launchPlan.healthUrl,
      method: 'GET' as const,
      purpose: 'Validate the generated runtime health route.',
    }] : []),
  ];
  const warnings = [
    ...(!launchPlanIsRunnable(options.launchPlan)
      ? ['No long-running start/dev runtime was detected; treat the manifest as validation guidance until the generated stack exposes a runtime command.']
      : []),
    ...(endpoints.length === 0
      ? ['No preview or health endpoint was inferred for this stack.']
      : []),
    ...(options.systemVerify.status === 'failed'
      ? ['Final system verification failed; inspect the verification summary before accepting the build.']
      : []),
    ...(options.systemVerify.status === 'not_available'
      ? ['Final system verification was not available for this stack.']
      : []),
  ];

  return {
    version: 1,
    generatedAt: options.generatedAt,
    projectName: options.projectName,
    manifestPath: GENERATED_RUNNABLE_MANIFEST_PATH,
    workspacePath: options.workspacePath,
    stack: options.launchPlan.stack,
    workingDirectory: options.launchPlan.workingDirectory,
    launchScriptPath: options.launchPlan.launchScriptPath,
    runScriptPath: options.launchPlan.runScriptPath,
    primaryRunCommand: options.launchPlan.runCommand,
    setupCommand: options.launchPlan.setupCommand,
    buildCommand: options.launchPlan.buildCommand,
    validationCommand: options.launchPlan.validationCommand,
    copyPasteScript: options.launchPlan.copyPasteScript,
    commands: buildRunnableManifestCommandBucket(options),
    endpoints,
    deliverables: options.deliverables.map((deliverable) => ({
      id: deliverable.id,
      label: deliverable.label,
      kind: deliverable.kind,
      primary: deliverable.primary,
      path: deliverable.path,
      runCommand: deliverable.runCommand,
      previewUrl: deliverable.previewUrl,
      healthUrl: deliverable.healthUrl,
    })),
    environment: options.environmentVariables,
    evidence: {
      launchPlanSource: 'generated-launch-plan',
      systemVerifyStatus: options.systemVerify.status,
      systemVerifyCommand: options.systemVerify.command,
      designGateStatus: options.designSummary.designGateStatus,
      designScore: options.designSummary.designScore,
    },
    warnings,
  };
}

async function writeRunnableManifest(workspacePath: string, runnableManifest: OmxRunnableManifest) {
  const absolutePath = path.join(workspacePath, runnableManifest.manifestPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(runnableManifest, null, 2), 'utf8');
}

function scoreForStatus(weight: number, status: OmxBuildDocumentationQualityStatus) {
  if (status === 'passed') return weight;
  if (status === 'needs_review') return Math.floor(weight * 0.5);
  return 0;
}

function assessDocumentationQuality(options: {
  session: SessionDocument;
  executionGraph: OmxExecutionGraph;
  documentation: Pick<
    OmxBuildDocumentationSummary,
    | 'summary'
    | 'projectName'
    | 'dossierPath'
    | 'wikiPath'
    | 'wikiBuildSummaryPath'
    | 'readmePath'
    | 'intakeChannels'
    | 'commands'
    | 'launchPlan'
    | 'runnableManifest'
    | 'deliverables'
    | 'modules'
    | 'quality'
    | 'verification'
    | 'wikiPages'
    | 'wikiMarkdown'
    | 'readmeMarkdown'
  >;
}) {
  const expectedModules = options.executionGraph.tasks.length;
  const expectedChannels = detectIntakeChannels(options.session);
  const documentedChannels = new Set(options.documentation.intakeChannels);
  const commands = new Set(options.documentation.commands.map((entry) => entry.name));
  const modulesMissingContracts = options.documentation.modules.filter((module) => (
    !module.description.trim() ||
    !module.dataContract.trim() ||
    module.acceptanceCriteria.length === 0
  ));
  const verifyReceipts = options.documentation.verification.verifyReceipts;
  const allVerifyReceiptsPassed = verifyReceipts.every((receipt) => receipt.passed);
  const readmeUsesProjectTitle = options.documentation.readmeMarkdown.startsWith(`# ${options.documentation.projectName}\n`);
  const hasPrimaryDeliverable = options.documentation.deliverables.some((deliverable) => deliverable.primary);
  const hasRunnableLaunchPlan =
    options.documentation.launchPlan.runCommand.trim().length > 0 &&
    !options.documentation.launchPlan.runCommand.startsWith('Inspect README.md');
  const hasRunnableManifest =
    options.documentation.runnableManifest.version === 1 &&
    options.documentation.runnableManifest.manifestPath === GENERATED_RUNNABLE_MANIFEST_PATH &&
    options.documentation.runnableManifest.workspacePath === options.documentation.launchPlan.workingDirectory &&
    options.documentation.runnableManifest.primaryRunCommand === options.documentation.launchPlan.runCommand &&
    options.documentation.runnableManifest.copyPasteScript.trim().length > 0;
  const hasRuntimeCommand = commands.has('start') || commands.has('dev') || hasRunnableLaunchPlan;
  const hasValidationCommand = commands.has('verify') || commands.has('smoke') || commands.has('test') || Boolean(options.documentation.launchPlan.validationCommand);
  const hasValidationOrPreview =
    Boolean(options.documentation.launchPlan.validationCommand) ||
    Boolean(options.documentation.launchPlan.previewUrl) ||
    Boolean(options.documentation.launchPlan.healthUrl) ||
    options.documentation.commands.length > 0;
  const navigationHasEssentials =
    options.documentation.wikiPages.length === options.documentation.modules.length &&
    options.documentation.wikiMarkdown.includes('## Product Deliverables') &&
    options.documentation.wikiMarkdown.includes('## Module Map') &&
    options.documentation.wikiMarkdown.includes('## Verification Evidence') &&
    options.documentation.readmeMarkdown.includes('## What Retrobuilder Built');

  const checks: OmxBuildDocumentationQualityCheck[] = [
    {
      id: 'root_artifacts',
      label: 'Root artifacts',
      weight: 20,
      status:
        options.documentation.summary.trim() &&
        readmeUsesProjectTitle &&
        options.documentation.dossierPath &&
        options.documentation.wikiPath &&
        options.documentation.wikiBuildSummaryPath &&
        options.documentation.readmePath &&
        options.documentation.wikiMarkdown.trim() &&
        options.documentation.readmeMarkdown.trim()
          ? 'passed'
          : 'failed',
      detail:
        options.documentation.summary.trim() &&
        readmeUsesProjectTitle &&
        options.documentation.wikiMarkdown.trim() &&
        options.documentation.readmeMarkdown.trim()
          ? 'README, wiki, dossier paths, project title, and top-level summaries were generated.'
          : 'A required documentation artifact or top-level summary is missing.',
    },
    {
      id: 'product_handoff',
      label: 'Product handoff',
      weight: 15,
      status:
        hasPrimaryDeliverable &&
        options.documentation.readmeMarkdown.includes('## Product Deliverables') &&
        options.documentation.wikiMarkdown.includes('## Product Deliverables')
          ? 'passed'
          : 'needs_review',
      detail:
        hasPrimaryDeliverable
          ? `Primary deliverable: ${options.documentation.deliverables.find((deliverable) => deliverable.primary)?.label}.`
          : 'No primary product deliverable was inferred from the generated workspace.',
    },
    {
      id: 'module_coverage',
      label: 'Module coverage',
      weight: 15,
      status:
        options.documentation.modules.length === expectedModules
          ? 'passed'
          : 'failed',
      detail:
        options.documentation.modules.length === expectedModules
          ? `Documented all ${expectedModules} execution module(s).`
          : `Documented ${options.documentation.modules.length}/${expectedModules} execution module(s).`,
    },
    {
      id: 'module_contracts',
      label: 'Module contracts',
      weight: 10,
      status: modulesMissingContracts.length === 0 ? 'passed' : 'needs_review',
      detail:
        modulesMissingContracts.length === 0
          ? 'Every module has description, data contract, and acceptance criteria.'
          : `Missing module contract detail for ${modulesMissingContracts.map((module) => module.nodeId).join(', ')}.`,
    },
    {
      id: 'execution_guidance',
      label: 'Execution guidance',
      weight: 15,
      status:
        (hasRuntimeCommand && hasValidationCommand && hasValidationOrPreview && hasRunnableManifest)
          ? 'passed'
          : 'needs_review',
      detail:
        hasRunnableLaunchPlan && hasValidationOrPreview && hasRunnableManifest
          ? `Runnable manifest ${options.documentation.runnableManifest.manifestPath} runs \`${options.documentation.runnableManifest.primaryRunCommand}\` and exposes validation or preview guidance.`
          : `Available commands: ${options.documentation.commands.map((entry) => entry.name).join(', ') || 'none'}.`,
    },
    {
      id: 'verification_evidence',
      label: 'Verification evidence',
      weight: 15,
      status:
        options.documentation.verification.systemVerify.status === 'failed'
          ? 'failed'
          : verifyReceipts.length === 0 && options.documentation.modules.length > 0
            ? 'failed'
          : options.documentation.verification.systemVerify.status === 'passed' &&
              verifyReceipts.length >= options.documentation.modules.length &&
              allVerifyReceiptsPassed
            ? 'passed'
            : 'needs_review',
      detail:
        options.documentation.verification.systemVerify.status === 'passed' &&
        verifyReceipts.length >= options.documentation.modules.length &&
        allVerifyReceiptsPassed
          ? 'Final system verify and per-module receipts are present.'
          : `System verify is ${options.documentation.verification.systemVerify.status} with ${verifyReceipts.length} verify receipt(s).`,
    },
    {
      id: 'channel_alignment',
      label: 'Intake channel alignment',
      weight: 5,
      status:
        expectedChannels.length === 0
          ? 'passed'
          : expectedChannels.every((channel) => documentedChannels.has(channel))
            ? 'passed'
            : 'needs_review',
      detail:
        expectedChannels.length === 0
          ? 'No explicit intake channel promises were detected in the blueprint.'
          : `Expected channels: ${expectedChannels.join(', ')}. Documented channels: ${options.documentation.intakeChannels.join(', ') || 'none'}.`,
    },
    {
      id: 'navigation_depth',
      label: 'Navigation depth',
      weight: 5,
      status:
        navigationHasEssentials
          ? 'passed'
          : options.documentation.wikiPages.length === 0
            ? 'failed'
            : 'needs_review',
      detail:
        navigationHasEssentials
          ? 'Wiki index, product deliverables, verification evidence, module map, and README overview are linked.'
          : `Wiki pages: ${options.documentation.wikiPages.length}; product handoff, module map, and verification sections may be incomplete.`,
    },
  ];

  const findings = checks
    .filter((check) => check.status !== 'passed')
    .map((check) => `${check.label}: ${check.detail}`);
  const strengths = checks
    .filter((check) => check.status === 'passed')
    .map((check) => `${check.label}: ${check.detail}`);
  const score = checks.reduce((sum, check) => sum + scoreForStatus(check.weight, check.status), 0);
  const status = checks.some((check) => check.status === 'failed')
    ? 'failed'
    : checks.some((check) => check.status === 'needs_review')
      ? 'needs_review'
      : 'passed';

  return {
    status,
    score,
    findings,
    strengths,
    checks,
  } satisfies OmxBuildDocumentationQuality;
}

async function collectModules(options: {
  workspacePath: string;
  session: SessionDocument;
  executionGraph: OmxExecutionGraph;
  verifyReceipts: Record<string, OmxVerifyReceipt>;
  mergeReceipts: Record<string, OmxMergeReceipt>;
}) {
  const modules: OmxBuildDocumentationModule[] = [];
  for (const task of [...options.executionGraph.tasks].sort((a, b) => a.priority - b.priority)) {
    const node = options.session.graph.nodes.find((entry) => entry.id === task.nodeId);
    if (!node) continue;
    const modulePath = (task.writeSet[0] || `modules/${sanitizeSegment(node.id || node.label)}/**`).replace(/\/\*\*$/, '');
    const moduleDir = path.join(options.workspacePath, modulePath);
    const files = await walkFiles(moduleDir);
    const artifactLines = await Promise.all(
      files.map(async (filePath) => {
        const content = await readFile(filePath, 'utf8').catch(() => '');
        return content.length > 0 ? content.split(/\r?\n/).length : 0;
      }),
    ).then((lineTotals) => lineTotals.reduce((sum, value) => sum + value, 0));

    const packageJson = await readJson<Record<string, unknown>>(path.join(moduleDir, 'package.json'));
    const moduleSpec = await readJson<Record<string, unknown>>(path.join(moduleDir, 'module.spec.json'));
    const materialization = moduleSpec && typeof moduleSpec.materialization === 'object' && moduleSpec.materialization
      ? moduleSpec.materialization as OmxBuildDocumentationModule['materialization']
      : undefined;
    const readme = await readFile(path.join(moduleDir, 'README.md'), 'utf8').catch(() => '');
    const verifyReceipt = options.verifyReceipts[task.taskId];
    const mergeReceipt = options.mergeReceipts[task.taskId];

    modules.push({
      nodeId: node.id,
      label: node.label,
      type: node.type || 'module',
      modulePath,
      readmePath: `${modulePath}/README.md`,
      description: firstParagraph(readme) || node.description || 'No description recorded.',
      dataContract: node.data_contract || 'No data contract provided.',
      acceptanceCriteria: node.acceptance_criteria || [],
      errorHandling: node.error_handling || [],
      artifactCount: files.length,
      artifactLines,
      filePreview: files.slice(0, 8).map((filePath) => rel(options.workspacePath, filePath)),
      verifyCommand: verifyReceipt?.command || task.verifyCommand,
      verifySummary: verifyReceipt?.summary,
      mergeSummary: mergeReceipt
        ? mergeReceipt.applied
          ? `Merged ${mergeReceipt.appliedPaths.length} path(s).`
          : `Rejected ${mergeReceipt.rejectedPaths.length} path(s). ${mergeReceipt.reason || 'Ownership validation failed.'}`
        : undefined,
      scripts: packageJson && typeof packageJson.scripts === 'object' && packageJson.scripts
        ? Object.keys(packageJson.scripts as Record<string, unknown>)
        : [],
      materialization,
    });
  }
  return modules;
}

function renderModuleWikiSection(modules: OmxBuildDocumentationModule[]) {
  return modules.map((module) => [
    `### ${module.label} (\`${module.type}\`)`,
    '',
    `- Node ID: \`${module.nodeId}\``,
    `- Module path: \`${module.modulePath}\``,
    `- README path: \`${module.readmePath}\``,
    `- Artifact footprint: ${module.artifactCount} file(s), ${module.artifactLines.toLocaleString()} line(s)`,
    `- Verify command: ${module.verifyCommand || 'n/a'}`,
    '',
    module.description,
    '',
    '#### Data Contract',
    module.dataContract,
    '',
    '#### Acceptance Criteria',
    ...(module.acceptanceCriteria.length > 0 ? module.acceptanceCriteria.map((entry) => `- ${entry}`) : ['- none recorded']),
    '',
    '#### Error Handling',
    ...(module.errorHandling.length > 0 ? module.errorHandling.map((entry) => `- ${entry}`) : ['- none recorded']),
    '',
    '#### Runtime Notes',
    module.materialization?.strategy ? `- Materialization: ${module.materialization.strategy}${module.materialization.baselineKind ? ` (${module.materialization.baselineKind})` : ''}` : '- Materialization: generated artifacts',
    `- Verification result: ${module.verifySummary || 'No verify receipt recorded.'}`,
    `- Merge result: ${module.mergeSummary || 'No merge receipt recorded.'}`,
    `- Scripts: ${module.scripts.length > 0 ? module.scripts.join(', ') : 'none'}`,
    '',
    '#### File Preview',
    ...(module.filePreview.length > 0 ? module.filePreview.map((entry) => `- \`${entry}\``) : ['- No files found in module path.']),
    '',
    ].join('\n')).join('\n');
}

function renderDeliverableWikiSection(deliverables: OmxBuildDocumentationDeliverable[]) {
  return deliverables.map((deliverable) => [
    `### ${deliverable.label}${deliverable.primary ? ' (primary)' : ''}`,
    '',
    `- Kind: \`${deliverable.kind}\``,
    `- Path: \`${deliverable.path}\``,
    ...(deliverable.runCommand ? [`- Run: \`${deliverable.runCommand}\``] : []),
    ...(deliverable.previewUrl ? [`- Preview: ${deliverable.previewUrl}`] : []),
    ...(deliverable.healthUrl ? [`- Health: ${deliverable.healthUrl}`] : []),
    `- Source module(s): ${deliverable.modules.length > 0 ? deliverable.modules.map((entry) => `\`${entry}\``).join(', ') : '`workspace root`'}`,
    '',
    deliverable.description,
    '',
    '#### Evidence',
    ...(deliverable.evidence.length > 0 ? deliverable.evidence.map((entry) => `- ${entry}`) : ['- No evidence recorded.']),
    '',
  ].join('\n')).join('\n');
}

function renderModuleWikiPage(
  module: OmxBuildDocumentationModule,
  documentation: Omit<OmxBuildDocumentationSummary, 'wikiMarkdown' | 'readmeMarkdown' | 'wikiPages'>,
) {
  return [
    `# ${module.label}`,
    '',
    `- Node ID: \`${module.nodeId}\``,
    `- Type: \`${module.type}\``,
    `- Module path: \`${module.modulePath}\``,
    `- Artifact footprint: ${module.artifactCount} file(s), ${module.artifactLines.toLocaleString()} line(s)`,
    `- Verify command: ${module.verifyCommand || 'n/a'}`,
    '',
    '## Description',
    '',
    module.description,
    '',
    '## Data Contract',
    '',
    module.dataContract,
    '',
    '## Acceptance Criteria',
    '',
    ...(module.acceptanceCriteria.length > 0 ? module.acceptanceCriteria.map((entry) => `- ${entry}`) : ['- none recorded']),
    '',
    '## Error Handling',
    '',
    ...(module.errorHandling.length > 0 ? module.errorHandling.map((entry) => `- ${entry}`) : ['- none recorded']),
    '',
    '## Verification',
    '',
    `- Module verify: ${module.verifySummary || 'No verify receipt recorded.'}`,
    `- Merge: ${module.mergeSummary || 'No merge receipt recorded.'}`,
    '',
    '## Files',
    '',
    ...(module.filePreview.length > 0 ? module.filePreview.map((entry) => `- \`${entry}\``) : ['- No files found in module path.']),
    '',
    '## Workspace Context',
    '',
    `- Root wiki index: \`${documentation.wikiPath}\``,
    `- Build summary page: \`${documentation.wikiBuildSummaryPath}\``,
    '',
  ].join('\n');
}

function renderWikiMarkdown(documentation: Omit<OmxBuildDocumentationSummary, 'wikiMarkdown' | 'readmeMarkdown'>) {
  return [
    `# ${documentation.summary}`,
    '',
    '## Wiki Index',
    '',
    `- Build summary: \`${documentation.wikiBuildSummaryPath}\``,
    ...documentation.wikiPages.map((page) => `- ${page.moduleId ? `Module ${page.moduleId}` : page.title}: \`${page.path}\``),
    '',
    '## Build Outcome',
    '',
    `- Generated at: ${documentation.generatedAt}`,
    `- Workspace path: \`${documentation.workspacePath}\``,
    `- Final files: ${documentation.workspace.totalFiles}`,
    `- Final lines: ${documentation.workspace.totalLines.toLocaleString()}`,
    `- Build time: ${(documentation.workspace.elapsedMs / 1000).toFixed(1)}s`,
    `- Design gate: ${documentation.verification.designGateStatus} (${documentation.verification.designScore})`,
    `- Final system verify: ${documentation.verification.systemVerify.status}${documentation.verification.systemVerify.command ? ` via ${documentation.verification.systemVerify.command}` : ''}`,
    '',
    '## Launch Plan',
    '',
    `- Stack: ${documentation.launchPlan.stack}`,
    `- Working directory: \`${documentation.launchPlan.workingDirectory}\``,
    `- Runnable manifest: \`${documentation.runnableManifest.manifestPath}\``,
    `- Setup: ${documentation.launchPlan.setupCommand ? `\`${documentation.launchPlan.setupCommand}\`` : 'No setup command detected.'}`,
    `- Run: \`${documentation.launchPlan.runCommand}\``,
    ...(documentation.launchPlan.buildCommand ? [`- Build: \`${documentation.launchPlan.buildCommand}\``] : []),
    `- Validate: ${documentation.launchPlan.validationCommand ? `\`${documentation.launchPlan.validationCommand}\`` : 'No validation command detected.'}`,
    ...(documentation.launchPlan.launchScriptPath ? [`- Launch script: \`${documentation.launchPlan.launchScriptPath}\``] : []),
    ...(documentation.launchPlan.previewUrl ? [`- Preview URL: ${documentation.launchPlan.previewUrl}`] : []),
    ...(documentation.launchPlan.healthUrl ? [`- Health URL: ${documentation.launchPlan.healthUrl}`] : []),
    '',
    '```sh',
    documentation.launchPlan.copyPasteScript,
    '```',
    '',
    '## Documentation Quality Gate',
    '',
    `- Status: ${documentation.quality.status}`,
    `- Score: ${documentation.quality.score}/100`,
    `- Findings: ${documentation.quality.findings.length > 0 ? documentation.quality.findings.join(' | ') : 'none'}`,
    '',
    '### Gate Checks',
    '',
    ...documentation.quality.checks.map((check) => `- **${check.label}** (${check.status}, ${check.weight}) — ${check.detail}`),
    '',
    '## Intake Channels',
    '',
    ...(documentation.intakeChannels.length > 0 ? documentation.intakeChannels.map((entry) => `- ${entry}`) : ['- No explicit intake channel detected from blueprint language.']),
    '',
    '## Product Deliverables',
    '',
    renderDeliverableWikiSection(documentation.deliverables),
    '## Internal Module Map',
    '',
    'These modules are Retrobuilder construction lanes and verification evidence. The user-facing handoff is the product deliverable list above.',
    '',
    '## Technology Stack',
    '',
    ...documentation.technologies.map((technology) => `- **${technology.name}** — ${technology.note}`),
    '',
    '## Usage Modes',
    '',
    ...(documentation.usageModes.length > 0 ? documentation.usageModes.map((entry) => `- ${entry}`) : ['- No usage modes inferred.']),
    '',
    '## Root Commands',
    '',
    ...documentation.commands.map((command) => `- \`${command.command}\` — ${command.description}`),
    '',
    '## Environment',
    '',
    ...(documentation.environmentVariables.length > 0
      ? documentation.environmentVariables.map((entry) => `- \`${entry.name}\` — ${entry.description}${entry.required ? '' : ' (optional defaulted sample)'}`)
      : ['- No environment variables were exported into `.env.example`.']),
    '',
    '## Module Map',
    '',
    renderModuleWikiSection(documentation.modules),
    '## Verification Evidence',
    '',
    `- Design findings: ${documentation.verification.designFindings.length > 0 ? documentation.verification.designFindings.join(' | ') : 'none'}`,
    `- Design evidence: ${documentation.verification.designEvidence.length > 0 ? documentation.verification.designEvidence.join(' | ') : 'none'}`,
    `- System verify summary: ${documentation.verification.systemVerify.summary || 'No summary recorded.'}`,
    '',
    '### Per-task Verify Receipts',
    '',
    ...(documentation.verification.verifyReceipts.length > 0
      ? documentation.verification.verifyReceipts.map((receipt) => `- \`${receipt.taskId}\` — ${receipt.passed ? 'PASS' : 'FAIL'} via ${receipt.command}: ${receipt.summary}`)
      : ['- No verify receipts recorded.']),
    '',
    '### Per-task Merge Receipts',
    '',
    ...(documentation.verification.mergeReceipts.length > 0
      ? documentation.verification.mergeReceipts.map((receipt) => `- \`${receipt.taskId}\` — ${receipt.applied ? 'MERGED' : 'REJECTED'} · applied ${receipt.appliedPaths} · rejected ${receipt.rejectedPaths}${receipt.reason ? ` · ${receipt.reason}` : ''}`)
      : ['- No merge receipts recorded.']),
    '',
    '## Generated Documentation Artifacts',
    '',
    `- Dossier JSON: \`${documentation.dossierPath}\``,
    `- Wiki Markdown: \`${documentation.wikiPath}\``,
    `- Synthesized README: \`${documentation.readmePath}\``,
    `- Runnable manifest JSON: \`${documentation.runnableManifest.manifestPath}\``,
    '',
  ].join('\n');
}

function renderReadmeMarkdown(documentation: Omit<OmxBuildDocumentationSummary, 'wikiMarkdown' | 'readmeMarkdown'>) {
  return [
    `# ${documentation.projectName}`,
    '',
    documentation.summary,
    '',
    '## What Retrobuilder Built',
    '',
    `- ${documentation.deliverables.length} product deliverable(s) ready for handoff`,
    `- ${documentation.modules.length} module(s) across the generated workspace`,
    `- ${documentation.workspace.totalFiles} file(s) and ${documentation.workspace.totalLines.toLocaleString()} line(s)`,
    `- Final system verify: ${documentation.verification.systemVerify.status}${documentation.verification.systemVerify.command ? ` via ${documentation.verification.systemVerify.command}` : ''}`,
    '',
    '## Product Deliverables',
    '',
    ...documentation.deliverables.map((deliverable) => [
      `- **${deliverable.label}** (${deliverable.kind}${deliverable.primary ? ', primary' : ''}) — ${deliverable.description}`,
      `  Path: \`${deliverable.path}\`${deliverable.previewUrl ? ` · Preview: ${deliverable.previewUrl}` : ''}${deliverable.healthUrl ? ` · Health: ${deliverable.healthUrl}` : ''}`,
    ].join('\n')),
    '',
    '## Run And Validate',
    '',
    `- Stack: ${documentation.launchPlan.stack}`,
    `- Open project folder: \`${documentation.launchPlan.workingDirectory}\``,
    ...(documentation.launchPlan.launchScriptPath ? [`- Launch script: \`${documentation.launchPlan.launchScriptPath}\``] : []),
    `- Runnable manifest: \`${documentation.runnableManifest.manifestPath}\``,
    ...(documentation.launchPlan.previewUrl ? [`- Preview: ${documentation.launchPlan.previewUrl}`] : []),
    ...(documentation.launchPlan.healthUrl ? [`- Health: ${documentation.launchPlan.healthUrl}`] : []),
    '',
    '```sh',
    documentation.launchPlan.copyPasteScript,
    '```',
    '',
    ...(documentation.launchPlan.validationCommand
      ? ['Validation command:', '', '```sh', documentation.launchPlan.validationCommand, '```', '']
      : []),
    '## Documentation Quality',
    '',
    `- ${documentation.quality.status} (${documentation.quality.score}/100)`,
    ...(documentation.quality.findings.length > 0 ? documentation.quality.findings.slice(0, 3).map((entry) => `- ${entry}`) : ['- no documentation gaps detected']),
    '',
    '## Technology Stack',
    '',
    ...documentation.technologies.slice(0, 8).map((technology) => `- ${technology.name}`),
    '',
    '## Commands',
    '',
    ...documentation.commands.map((command) => `- \`${command.command}\` — ${command.description}`),
    '',
    '## Intake Channels',
    '',
    ...(documentation.intakeChannels.length > 0 ? documentation.intakeChannels.map((entry) => `- ${entry}`) : ['- No explicit intake channel detected in the blueprint.']),
    '',
    '## Internal Modules',
    '',
    'Retrobuilder keeps these as construction lanes and verification receipts. Treat the product deliverables above as the runnable handoff.',
    '',
    ...documentation.modules.map((module) => `- **${module.label}** (\`${module.type}\`) — ${module.description}`),
    '',
    '## Documentation',
    '',
    `- Detailed wiki: \`${documentation.wikiPath}\``,
    `- Build dossier JSON: \`${documentation.dossierPath}\``,
    `- Runnable manifest JSON: \`${documentation.runnableManifest.manifestPath}\``,
    '',
  ].join('\n');
}

export async function generateOmxBuildDocumentationArtifacts(
  options: GenerateOmxBuildDocumentationOptions,
): Promise<OmxBuildDocumentationArtifacts> {
  const generatedAt = new Date().toISOString();
  const envExample = await readFile(path.join(options.workspacePath, '.env.example'), 'utf8').catch(() => '');
  const intakeChannels = detectIntakeChannels(options.session);
  const modules = await collectModules({
    workspacePath: options.workspacePath,
    session: options.session,
    executionGraph: options.executionGraph,
    verifyReceipts: options.verifyReceipts,
    mergeReceipts: options.mergeReceipts,
  });
  const modulePaths = modules.map((module) => module.modulePath);
  const packages = await collectPackageSnapshots(options.workspacePath, modulePaths);
  const stackMarkers = await collectStackMarkers(options.workspacePath);
  const technologies = collectTechnologies(options.session, packages, intakeChannels, stackMarkers);
  const rootPackage = packages.find((pkg) => pkg.relativePath === 'package.json');
  const commands = buildCommands(rootPackage);
  const launchPlan = buildLaunchPlan({
    workspacePath: options.workspacePath,
    envExample,
    rootPackage,
    stackMarkers,
    technologies,
  });
  const deliverables = buildDeliverables({
    projectName: options.session.name,
    modules,
    launchPlan,
  });
  const environmentVariables = envExample
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => line.slice(0, line.indexOf('=')))
    .map((name) => ({
      name,
      required: false,
      description: envDescription(name),
    }));
  const runnableManifest = buildRunnableManifest({
    generatedAt,
    projectName: options.session.name,
    workspacePath: options.workspacePath,
    commands,
    launchPlan,
    deliverables,
    environmentVariables,
    designSummary: options.designSummary,
    systemVerify: options.systemVerify,
  });
  const usageModes = commands.map((command) => `${command.command} — ${command.description}`);

  const systemVerifySummary = options.systemVerify.summary || 'No final system verification summary recorded.';
  const summary = [
    `Retrobuilder completed build ${options.buildId.slice(0, 8)}`,
    `for ${options.session.name} with ${modules.length} module(s)`,
    `and a final system verify status of ${options.systemVerify.status}.`,
  ].join(' ');

  const dossierPath = '.omx/build-dossier.json';
  const wikiPath = '.omx/wiki/index.md';
  const wikiBuildSummaryPath = '.omx/wiki/build-summary.md';
  const readmePath = 'README.md';
  const wikiPages = modules.map((module) => ({
    title: module.label,
    moduleId: module.nodeId,
    path: `.omx/wiki/modules/${sanitizeSegment(module.nodeId || module.label)}.md`,
  }));

  const baseDocumentation = {
    generatedAt,
    dossierPath,
    wikiPath,
    wikiBuildSummaryPath,
    readmePath,
    summary,
    projectName: options.session.name,
    workspacePath: options.workspacePath,
    intakeChannels,
    usageModes,
    technologies,
    commands,
    launchPlan,
    runnableManifest,
    deliverables,
    environmentVariables,
    modules,
    quality: {
      status: 'needs_review',
      score: 0,
      findings: [],
      strengths: [],
      checks: [],
    } satisfies OmxBuildDocumentationQuality,
    verification: {
      designGateStatus: options.designSummary.designGateStatus,
      designScore: options.designSummary.designScore,
      designFindings: options.designSummary.designFindings,
      designEvidence: options.designSummary.designEvidence,
      systemVerify: options.systemVerify,
      verifyReceipts: Object.values(options.verifyReceipts).map((receipt) => ({
        taskId: receipt.taskId,
        passed: receipt.passed,
        command: receipt.command,
        summary: receipt.summary,
      })),
      mergeReceipts: Object.values(options.mergeReceipts).map((receipt) => ({
        taskId: receipt.taskId,
        applied: receipt.applied,
        appliedPaths: receipt.appliedPaths.length,
        rejectedPaths: receipt.rejectedPaths.length,
        reason: receipt.reason,
      })),
    },
    workspace: {
      totalFiles: 0,
      totalLines: 0,
      elapsedMs: options.elapsedMs,
    },
    wikiPages,
  };

  const wikiMarkdown = renderWikiMarkdown(baseDocumentation);
  const readmeMarkdown = renderReadmeMarkdown(baseDocumentation);

  const documentation: OmxBuildDocumentationSummary = {
    ...baseDocumentation,
    wikiMarkdown,
    readmeMarkdown,
  };
  documentation.quality = assessDocumentationQuality({
    session: options.session,
    executionGraph: options.executionGraph,
    documentation,
  });

  const dossierAbsolutePath = path.join(options.workspacePath, dossierPath);
  const wikiAbsolutePath = path.join(options.workspacePath, wikiPath);
  const wikiBuildSummaryAbsolutePath = path.join(options.workspacePath, wikiBuildSummaryPath);
  const readmeAbsolutePath = path.join(options.workspacePath, readmePath);

  await mkdir(path.dirname(dossierAbsolutePath), { recursive: true });
  await mkdir(path.dirname(wikiAbsolutePath), { recursive: true });
  await mkdir(path.dirname(wikiBuildSummaryAbsolutePath), { recursive: true });
  await writeFile(readmeAbsolutePath, readmeMarkdown, 'utf8');
  await writeFile(wikiAbsolutePath, wikiMarkdown, 'utf8');
  await writeFile(wikiBuildSummaryAbsolutePath, wikiMarkdown, 'utf8');
  await writeGeneratedLaunchScript(options.workspacePath, launchPlan);
  await writeRunnableManifest(options.workspacePath, runnableManifest);
  await Promise.all(
    modules.map(async (module) => {
      const page = wikiPages.find((entry) => entry.moduleId === module.nodeId);
      if (!page) return;
      const absolutePath = path.join(options.workspacePath, page.path);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, renderModuleWikiPage(module, baseDocumentation), 'utf8');
    }),
  );

  const workspaceTotals = await countWorkspaceArtifacts(options.workspacePath);
  documentation.workspace.totalFiles = workspaceTotals.totalFiles;
  documentation.workspace.totalLines = workspaceTotals.totalLines;
  documentation.wikiMarkdown = renderWikiMarkdown({
    ...baseDocumentation,
    quality: documentation.quality,
    workspace: {
      totalFiles: workspaceTotals.totalFiles,
      totalLines: workspaceTotals.totalLines,
      elapsedMs: options.elapsedMs,
    },
  });
  documentation.readmeMarkdown = renderReadmeMarkdown({
    ...baseDocumentation,
    quality: documentation.quality,
    workspace: {
      totalFiles: workspaceTotals.totalFiles,
      totalLines: workspaceTotals.totalLines,
      elapsedMs: options.elapsedMs,
    },
  });

  await writeFile(readmeAbsolutePath, documentation.readmeMarkdown, 'utf8');
  await writeFile(wikiAbsolutePath, documentation.wikiMarkdown, 'utf8');
  await writeFile(wikiBuildSummaryAbsolutePath, documentation.wikiMarkdown, 'utf8');
  await Promise.all(
    modules.map(async (module) => {
      const page = wikiPages.find((entry) => entry.moduleId === module.nodeId);
      if (!page) return;
      const absolutePath = path.join(options.workspacePath, page.path);
      await writeFile(absolutePath, renderModuleWikiPage(module, {
        ...baseDocumentation,
        quality: documentation.quality,
        workspace: {
          totalFiles: workspaceTotals.totalFiles,
          totalLines: workspaceTotals.totalLines,
          elapsedMs: options.elapsedMs,
        },
      }), 'utf8');
    }),
  );
  await writeFile(dossierAbsolutePath, JSON.stringify(documentation, null, 2), 'utf8');

  return {
    documentation,
    runnableManifest,
    dossierPath,
    wikiPath,
    readmePath,
  };
}
