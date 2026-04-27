import { useState, type ReactNode } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FolderKanban,
  FolderOpen,
  Layers3,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from 'lucide-react';
import { openOmxProject } from '../lib/api';
import type {
  BuildDocumentationState,
} from '../store/useBuildStore';
import type {
  OmxBuildDocumentationCommand,
  OmxBuildLaunchPlan,
  OmxBuildDocumentationDeliverable,
  OmxBuildDocumentationModule,
  OmxBuildDocumentationQualityStatus,
  OmxRunnableManifest,
} from '../lib/api';

type BuildStatus = 'idle' | 'queued' | 'running' | 'succeeded' | 'failed' | 'stopping' | 'stopped';

function LazyDetails({
  className,
  summaryClassName,
  summary,
  children,
}: {
  className?: string;
  summaryClassName?: string;
  summary: ReactNode;
  children: ReactNode;
}) {
  const [hasOpened, setHasOpened] = useState(false);

  return (
    <details
      className={className}
      onToggle={(event) => {
        if (event.currentTarget.open) setHasOpened(true);
      }}
    >
      <summary className={summaryClassName}>{summary}</summary>
      {hasOpened ? children : null}
    </details>
  );
}

function statusTone(status: BuildStatus) {
  if (status === 'succeeded') return 'border-[#50fa7b]/30 bg-[#50fa7b]/10 text-[#50fa7b]';
  if (status === 'failed') return 'border-[#ff5c7a]/30 bg-[#ff5c7a]/10 text-[#ff5c7a]';
  return 'border-[#ffcb6b]/30 bg-[#ffcb6b]/10 text-[#ffcb6b]';
}

function qualityTone(status: OmxBuildDocumentationQualityStatus) {
  if (status === 'passed') return 'border-[#50fa7b]/30 bg-[#50fa7b]/10 text-[#50fa7b]';
  if (status === 'failed') return 'border-[#ff5c7a]/30 bg-[#ff5c7a]/10 text-[#ff5c7a]';
  return 'border-[#ffcb6b]/30 bg-[#ffcb6b]/10 text-[#ffcb6b]';
}

function softStatusTone(status: 'passed' | 'failed' | 'pending' | 'not_available' | 'needs_review') {
  if (status === 'passed') return 'border-[#50fa7b]/20 bg-[#50fa7b]/8 text-[#50fa7b]';
  if (status === 'failed') return 'border-[#ff5c7a]/20 bg-[#ff5c7a]/8 text-[#ff5c7a]';
  return 'border-[#ffcb6b]/20 bg-[#ffcb6b]/8 text-[#ffcb6b]';
}

function formatGeneratedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function compactText(value: string | undefined, max = 170) {
  if (!value) return 'No summary recorded.';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trim()}...`;
}

function moduleVerifyLabel(module: OmxBuildDocumentationModule) {
  const summary = module.verifySummary || '';
  if (summary.includes('# fail 0') || summary.includes('"ok": true') || /^passed\b/i.test(summary)) return 'verify passed';
  if (summary.includes('# fail') || /failed|not ok/i.test(summary)) return 'verify needs review';
  if (module.verifyCommand) return 'verify available';
  return 'not verified';
}

function moduleVerifyTone(module: OmxBuildDocumentationModule) {
  const label = moduleVerifyLabel(module);
  if (label === 'verify passed') return 'border-[#50fa7b]/20 bg-[#50fa7b]/8 text-[#50fa7b]';
  if (label === 'verify needs review') return 'border-[#ff5c7a]/20 bg-[#ff5c7a]/8 text-[#ff5c7a]';
  return 'border-[#ffcb6b]/20 bg-[#ffcb6b]/8 text-[#ffcb6b]';
}

function commandIntent(command: OmxBuildDocumentationCommand) {
  const key = command.name.toLowerCase();
  if (key.includes('bootstrap')) return 'Prepare the workspace';
  if (key.includes('verify')) return 'Run the confidence checks';
  if (key.includes('dev')) return 'Open the live dev loop';
  if (key.includes('build')) return 'Create the production bundle';
  if (key.includes('start')) return 'Launch the generated app';
  if (key.includes('smoke')) return 'Probe the runtime health route';
  return compactText(command.description, 80);
}

function commandPriority(command: OmxBuildDocumentationCommand) {
  const key = command.name.toLowerCase();
  if (key.includes('start')) return 0;
  if (key.includes('dev')) return 1;
  if (key.includes('verify')) return 2;
  if (key.includes('smoke')) return 3;
  if (key.includes('build')) return 4;
  if (key.includes('bootstrap')) return 5;
  return 6;
}

function shellQuote(value: string) {
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}

function fallbackPreviewPort() {
  if (typeof window === 'undefined') return 7807;
  const currentPort = Number(window.location.port || '');
  return Number.isFinite(currentPort) && currentPort === 7777 ? 7807 : 7777;
}

function launchPlanIsRunnable(launchPlan: Pick<OmxBuildLaunchPlan, 'runCommand'>) {
  return launchPlan.runCommand.trim().length > 0 && !launchPlan.runCommand.startsWith('Inspect README.md');
}

function launchPlanFromRunnableManifest(manifest: OmxRunnableManifest): OmxBuildLaunchPlan {
  const previewUrl = manifest.endpoints.find((endpoint) => endpoint.name === 'preview')?.url;
  const healthUrl = manifest.endpoints.find((endpoint) => endpoint.name === 'health')?.url;

  return {
    stack: manifest.stack,
    workingDirectory: manifest.workingDirectory || manifest.workspacePath,
    setupCommand: manifest.setupCommand,
    runCommand: manifest.primaryRunCommand,
    buildCommand: manifest.buildCommand,
    validationCommand: manifest.validationCommand,
    previewUrl,
    healthUrl,
    runScriptPath: manifest.runScriptPath,
    launchScriptPath: manifest.launchScriptPath,
    copyPasteScript: manifest.copyPasteScript,
    notes: [
      `Runnable manifest: ${manifest.manifestPath}`,
      ...manifest.warnings,
    ],
  };
}

function resolveLaunchPlan(documentation: BuildDocumentationState): OmxBuildLaunchPlan {
  if (documentation.runnableManifest) return launchPlanFromRunnableManifest(documentation.runnableManifest);
  if (documentation.launchPlan) return documentation.launchPlan;

  const commands = new Map(documentation.commands.map((command) => [command.name, command.command]));
  const previewPort = fallbackPreviewPort();
  const runScriptName = commands.has('start') ? 'start' : commands.has('dev') ? 'dev' : null;
  const buildCommand = commands.get('build');
  const runCommand = runScriptName
    ? `PORT=${previewPort} ${commands.get(runScriptName)}`
    : 'Inspect README.md for the generated stack-specific run command.';
  const setupCommand = commands.get('bootstrap');
  const validationCommand = commands.get('smoke') || commands.get('verify');
  const copyPasteScript = [
    `cd ${shellQuote(documentation.workspacePath)}`,
    ...(setupCommand ? [setupCommand] : []),
    ...(!runScriptName && buildCommand ? [buildCommand] : []),
    runScriptName
      ? runCommand
      : 'echo "No long-running start/dev script was detected. Inspect README.md before treating this as a runnable handoff."',
  ].join('\n');
  const stack = documentation.technologies.length > 0
    ? documentation.technologies.slice(0, 4).map((technology) => technology.name).join(' + ')
    : 'Generated workspace';

  return {
    stack,
    workingDirectory: documentation.workspacePath,
    setupCommand,
    runCommand,
    buildCommand,
    validationCommand,
    previewUrl: runScriptName ? `http://127.0.0.1:${previewPort}/` : undefined,
    healthUrl: runScriptName ? `http://127.0.0.1:${previewPort}/api/health` : undefined,
    copyPasteScript,
    notes: [
      'Launch plan inferred from an older build dossier; new builds persist this metadata directly.',
      validationCommand ? `Validate the generated project with \`${validationCommand}\`.` : 'No generated validation command was detected.',
    ],
  };
}

function countModulesByType(modules: OmxBuildDocumentationModule[]) {
  return modules.reduce<Record<string, number>>((acc, module) => {
    acc[module.type] = (acc[module.type] || 0) + 1;
    return acc;
  }, {});
}

function deliverableKindForModule(module: OmxBuildDocumentationModule): OmxBuildDocumentationDeliverable['kind'] {
  if (module.type === 'frontend') return 'app';
  if (module.type === 'backend') return 'service';
  if (module.type === 'database') return 'data';
  if (module.type === 'external') return 'integration';
  if (module.type === 'security') return 'security';
  return 'library';
}

function resolveDeliverables(
  documentation: BuildDocumentationState,
  launchPlan: OmxBuildLaunchPlan,
): OmxBuildDocumentationDeliverable[] {
  if (documentation.deliverables?.length) return documentation.deliverables;

  if (documentation.modules.length === 0) {
    return [{
      id: 'workspace',
      label: documentation.projectName,
      kind: /web|static|frontend|react|vite/i.test(launchPlan.stack) ? 'app' : 'service',
      primary: true,
      path: '.',
      runCommand: launchPlanIsRunnable(launchPlan) ? launchPlan.runCommand : undefined,
      previewUrl: launchPlan.previewUrl,
      healthUrl: launchPlan.healthUrl,
      description: documentation.summary || 'Generated workspace handoff inferred from the launch plan.',
      modules: [],
      evidence: [
        `Stack: ${launchPlan.stack}`,
        launchPlan.validationCommand ? `Validation: ${launchPlan.validationCommand}` : 'Validation command not detected',
      ],
    }];
  }

  const deliverables = documentation.modules.map((module) => ({
    id: module.nodeId || module.modulePath,
    label: module.label,
    kind: deliverableKindForModule(module),
    primary: false,
    path: module.modulePath,
    runCommand: module.scripts.includes('start') ? `npm --prefix ${module.modulePath} run start` : undefined,
    description: module.description,
    modules: [module.nodeId],
    evidence: [`${module.artifactCount} files`, module.verifyCommand ? `Verify: ${module.verifyCommand}` : 'Verify command not detected'],
  } satisfies OmxBuildDocumentationDeliverable));

  const primaryIndex = Math.max(0, deliverables.findIndex((entry) => entry.kind === 'app'));
  return deliverables.map((entry, index) => index === primaryIndex
    ? {
        ...entry,
        primary: true,
        runCommand: launchPlanIsRunnable(launchPlan) ? launchPlan.runCommand : entry.runCommand,
        previewUrl: launchPlan.previewUrl,
        healthUrl: launchPlan.healthUrl,
      }
    : entry);
}

function deliverableKindLabel(kind: OmxBuildDocumentationDeliverable['kind']) {
  if (kind === 'app') return 'Runnable app';
  if (kind === 'service') return 'Service/API';
  if (kind === 'data') return 'Data layer';
  if (kind === 'integration') return 'Integration';
  if (kind === 'security') return 'Security layer';
  return 'Shared package';
}

function MetricTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.22em] text-text-dim">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

function ProductDeliverablesSection({ deliverables }: { deliverables: OmxBuildDocumentationDeliverable[] }) {
  const primaryDeliverable = deliverables.find((deliverable) => deliverable.primary) || deliverables[0];
  const secondaryDeliverables = deliverables.filter((deliverable) => deliverable !== primaryDeliverable);

  return (
    <section className="rounded-[24px] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_right,rgba(0,242,255,0.12),transparent_34%),rgba(255,255,255,0.03)] p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-cyan-200">
            <FolderKanban size={14} />
            Product deliverables
          </div>
          <p className="mt-2 text-sm leading-6 text-text-dim">
            The user-facing handoff. Internal modules remain available as construction evidence, but these are the things to open, run, or validate.
          </p>
        </div>
        <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-cyan-100">
          {deliverables.length} deliverable{deliverables.length === 1 ? '' : 's'}
        </span>
      </div>

      {primaryDeliverable ? (
        <div className="rounded-2xl border border-[#50fa7b]/20 bg-[#50fa7b]/8 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[#50fa7b]/30 bg-[#50fa7b]/12 px-2.5 py-1 text-[9px] uppercase tracking-[0.18em] text-[#50fa7b]">
                  primary
                </span>
                <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[9px] uppercase tracking-[0.18em] text-text-dim">
                  {deliverableKindLabel(primaryDeliverable.kind)}
                </span>
              </div>
              <h3 className="mt-3 text-lg font-semibold text-white">{primaryDeliverable.label}</h3>
              <p className="mt-2 text-sm leading-6 text-text-dim">{compactText(primaryDeliverable.description, 220)}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.18em] text-text-dim">
                <span className="font-mono normal-case tracking-normal text-white/80">{primaryDeliverable.path}</span>
                {primaryDeliverable.runCommand && <span>{primaryDeliverable.runCommand}</span>}
              </div>
            </div>
            {primaryDeliverable.previewUrl && (
              <a
                href={primaryDeliverable.previewUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200 transition hover:bg-cyan-300/16"
              >
                Open
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
      ) : null}

      {secondaryDeliverables.length > 0 && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {secondaryDeliverables.slice(0, 4).map((deliverable) => (
            <div key={deliverable.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[10px] uppercase tracking-[0.2em] text-text-dim">{deliverableKindLabel(deliverable.kind)}</div>
              <div className="mt-2 text-sm font-medium text-white">{deliverable.label}</div>
              <p className="mt-2 text-xs leading-5 text-text-dim">{compactText(deliverable.description, 120)}</p>
              <div className="mt-3 font-mono text-[11px] text-white/75">{deliverable.path}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CommandCard({ command }: { command: OmxBuildDocumentationCommand }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-text-dim">{command.name}</div>
          <div className="mt-2 font-mono text-sm text-white">{command.command}</div>
        </div>
        <ChevronRight size={15} className="mt-1 text-accent" />
      </div>
      <p className="mt-3 text-xs leading-5 text-text-dim">{commandIntent(command)}</p>
    </div>
  );
}

function LaunchPlanPanel({
  launchPlan,
  sessionId,
}: {
  launchPlan: OmxBuildLaunchPlan;
  sessionId?: string | null;
}) {
  const [openState, setOpenState] = useState<'idle' | 'opening' | 'opened' | 'failed'>('idle');
  const [copied, setCopied] = useState(false);

  const openProject = async () => {
    if (!sessionId || openState === 'opening') return;
    setOpenState('opening');
    try {
      await openOmxProject(sessionId);
      setOpenState('opened');
    } catch {
      setOpenState('failed');
    }
  };

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(launchPlan.copyPasteScript);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="rounded-[26px] border border-[#50fa7b]/20 bg-[radial-gradient(circle_at_top_left,rgba(80,250,123,0.14),transparent_35%),linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.22)]">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-[#50fa7b]">
            <PlayCircle size={15} />
            Run and validate
          </div>
          <h3 className="mt-3 text-xl font-semibold text-white">Open the generated project and run the exact stack script.</h3>
          <p className="mt-2 text-sm leading-6 text-text-dim">
            Stack detected: <span className="text-white">{launchPlan.stack}</span>. Retrobuilder prepared this handoff from the active build workspace, not a generic checklist.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={openProject}
            disabled={!sessionId || openState === 'opening'}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#50fa7b]/35 bg-[#50fa7b]/12 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#50fa7b] transition hover:bg-[#50fa7b]/18 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
          >
            <FolderOpen size={14} />
            {openState === 'opening' ? 'Opening' : 'Open project'}
          </button>
          {launchPlan.previewUrl && (
            <a
              href={launchPlan.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200 transition hover:bg-cyan-300/16 sm:w-auto"
            >
              <ExternalLink size={14} />
              Open preview
            </a>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 2xl:grid-cols-[1fr_0.72fr]">
        <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-text-dim">Ready-to-run script</div>
              {launchPlan.launchScriptPath && (
                <div className="mt-1 font-mono text-[11px] text-[#50fa7b]">{launchPlan.launchScriptPath}</div>
              )}
            </div>
            <button
              type="button"
              onClick={copyScript}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-text-dim transition hover:border-white/20 hover:text-white sm:w-auto"
            >
              <Copy size={12} />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-[#020309] p-4 font-mono text-xs leading-6 text-white custom-scrollbar">
            {launchPlan.copyPasteScript}
          </pre>
        </div>

        <div className="grid gap-3">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="text-[10px] uppercase tracking-[0.22em] text-text-dim">Validate</div>
            <div className="mt-2 font-mono text-sm text-white">{launchPlan.validationCommand || 'No validation command detected.'}</div>
            {launchPlan.buildCommand && (
              <div className="mt-2 font-mono text-xs text-white/70">Build: {launchPlan.buildCommand}</div>
            )}
            {launchPlan.healthUrl && (
              <a href={launchPlan.healthUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-cyan-200 hover:text-white">
                Health route
                <ExternalLink size={12} />
              </a>
            )}
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="text-[10px] uppercase tracking-[0.22em] text-text-dim">Workspace</div>
            <div className="mt-2 break-all font-mono text-xs leading-5 text-white/85">{launchPlan.workingDirectory}</div>
            {openState === 'failed' && (
              <p className="mt-3 text-xs leading-5 text-[#ff5c7a]">Could not open the folder automatically. Use the path above.</p>
            )}
            {openState === 'opened' && (
              <p className="mt-3 text-xs leading-5 text-[#50fa7b]">Project folder requested from the local OS.</p>
            )}
          </div>
          {launchPlan.notes.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-[10px] uppercase tracking-[0.22em] text-text-dim">Notes</div>
              <ul className="mt-2 space-y-1 text-xs leading-5 text-text-dim">
                {launchPlan.notes.map((note) => <li key={note}>- {note}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function CompactModuleCard({ module }: { module: OmxBuildDocumentationModule }) {
  return (
    <LazyDetails
      className="group rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-white/20"
      summaryClassName="list-none cursor-pointer"
      summary={(
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-base font-medium text-white">{module.label}</div>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[9px] uppercase tracking-[0.18em] text-text-dim">
                {module.type}
              </span>
              <span className={`rounded-full border px-2.5 py-1 text-[9px] uppercase tracking-[0.18em] ${moduleVerifyTone(module)}`}>
                {moduleVerifyLabel(module)}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-text-dim">{compactText(module.description, 145)}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.18em] text-text-dim">
              <span>{module.artifactCount} files</span>
              <span>{module.artifactLines.toLocaleString()} lines</span>
              <span>{module.acceptanceCriteria.length} criteria</span>
              <span>{module.scripts.length} scripts</span>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-text-dim">
            details
            <ChevronRight size={13} className="transition group-open:rotate-90" />
          </div>
        </div>
      )}
    >

      <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-text-dim">Acceptance criteria</div>
          <ul className="mt-3 space-y-2 text-sm leading-5 text-white/90">
            {module.acceptanceCriteria.length > 0
              ? module.acceptanceCriteria.map((entry) => <li key={entry}>- {entry}</li>)
              : <li>- none recorded</li>}
          </ul>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-text-dim">Technical evidence</div>
          <ul className="mt-3 space-y-2 text-sm leading-5 text-white/90">
            <li>- Path: <span className="font-mono text-white">{module.modulePath}</span></li>
            <li>- Verify: <span className="font-mono text-white">{module.verifyCommand || 'n/a'}</span></li>
            <li>- Merge: {module.mergeSummary || 'n/a'}</li>
            <li>- Scripts: {module.scripts.length > 0 ? module.scripts.join(', ') : 'none'}</li>
          </ul>
          {module.verifySummary && (
            <LazyDetails
              className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3"
              summaryClassName="cursor-pointer text-[10px] uppercase tracking-[0.2em] text-text-dim"
              summary="Runtime notes"
            >
              <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap text-xs leading-5 text-white/80 custom-scrollbar">
                {module.verifySummary}
              </pre>
            </LazyDetails>
          )}
        </div>
      </div>
    </LazyDetails>
  );
}

function TechnicalDossier({ documentation }: { documentation: BuildDocumentationState }) {
  return (
    <LazyDetails
      className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
      summaryClassName="flex cursor-pointer list-none items-center justify-between gap-4"
      summary={(
        <>
          <div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-text-dim">
              <BookOpen size={14} className="text-accent" />
              Technical dossier
            </div>
            <p className="mt-2 text-sm leading-6 text-text-dim">
              Wiki files, environment variables, markdown source, receipts and low-level evidence are tucked away here.
            </p>
          </div>
          <span className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-text-dim">
            open
            <ChevronRight size={13} />
          </span>
        </>
      )}
    >

      <div className="mt-5 grid gap-4 border-t border-white/10 pt-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-text-dim">Generated artifacts</div>
          <ul className="mt-3 space-y-2 font-mono text-xs leading-5 text-white/85">
            <li>{documentation.readmePath}</li>
            <li>{documentation.dossierPath}</li>
            {documentation.runnableManifest && <li>{documentation.runnableManifest.manifestPath}</li>}
            <li>{documentation.wikiPath}</li>
            <li>{documentation.wikiBuildSummaryPath}</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-text-dim">Wiki pages</div>
          <ul className="mt-3 max-h-48 space-y-2 overflow-auto font-mono text-xs leading-5 text-white/85 custom-scrollbar">
            {documentation.wikiPages.map((page) => (
              <li key={page.path}>{page.path}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-text-dim">Environment</div>
          <div className="mt-3 space-y-2">
            {documentation.environmentVariables.length > 0 ? documentation.environmentVariables.map((entry) => (
              <div key={entry.name} className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2">
                <div className="font-mono text-xs text-white">{entry.name}{entry.required ? ' *' : ''}</div>
                <div className="mt-1 text-xs leading-5 text-text-dim">{entry.description}</div>
              </div>
            )) : (
              <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs text-text-dim">
                No `.env.example` variables were generated for this workspace.
              </div>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-text-dim">Receipts</div>
          <ul className="mt-3 space-y-2 text-xs leading-5 text-white/85">
            <li>- Verify receipts: {documentation.verification.verifyReceipts.length}</li>
            <li>- Merge receipts: {documentation.verification.mergeReceipts.length}</li>
            <li>- Intake channels: {documentation.intakeChannels.length > 0 ? documentation.intakeChannels.join(', ') : 'none inferred'}</li>
          </ul>
        </div>
      </div>

      <LazyDetails
        className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4"
        summaryClassName="cursor-pointer text-[10px] uppercase tracking-[0.22em] text-text-dim"
        summary="Full wiki markdown"
      >
        <pre className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap text-xs leading-6 text-white/85 custom-scrollbar">
          {documentation.wikiMarkdown}
        </pre>
      </LazyDetails>
    </LazyDetails>
  );
}

export default function BuildCompletionReport({
  documentation,
  buildStatus,
  sessionId,
}: {
  documentation: BuildDocumentationState;
  buildStatus: BuildStatus;
  sessionId?: string | null;
}) {
  const modulesByType = countModulesByType(documentation.modules);
  const typeEntries = Object.entries(modulesByType).sort((a, b) => b[1] - a[1]);
  const systemVerify = documentation.verification.systemVerify;
  const orderedCommands = [...documentation.commands].sort((a, b) => commandPriority(a) - commandPriority(b));
  const primaryCommands = orderedCommands.slice(0, 3);
  const secondaryCommands = orderedCommands.slice(3);
  const featuredModules = documentation.modules.slice(0, 4);
  const remainingModules = documentation.modules.slice(4);
  const launchPlan = resolveLaunchPlan(documentation);
  const deliverables = resolveDeliverables(documentation, launchPlan);
  const documentationNeedsReview = documentation.quality.status === 'needs_review';
  const handoffStatusLabel = buildStatus === 'failed'
    ? 'Build needs review'
    : documentationNeedsReview
      ? 'Handoff needs review'
      : 'Ready for handoff';
  const handoffStatusTone = buildStatus === 'failed'
    ? statusTone('failed')
    : documentationNeedsReview
      ? qualityTone('needs_review')
      : statusTone(buildStatus);

  return (
    <div className="absolute inset-2 overflow-hidden rounded-[24px] border border-white/10 bg-[#05070c]/94 shadow-[0_30px_120px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:inset-4 xl:inset-6 xl:rounded-[28px]">
      <div className="h-full overflow-y-auto custom-scrollbar">
        <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(80,250,123,0.09),rgba(0,242,255,0.05),rgba(255,255,255,0.02))] px-4 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.24em] ${handoffStatusTone}`}>
                  <Sparkles size={12} />
                  {handoffStatusLabel}
                </span>
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.24em] ${softStatusTone(systemVerify.status)}`}>
                  <CheckCircle2 size={12} />
                  Verify {systemVerify.status}
                </span>
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.24em] ${qualityTone(documentation.quality.status)}`}>
                  <ShieldCheck size={12} />
                  Docs {documentation.quality.score}/100
                </span>
              </div>
              <h2 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-[28px]">
                {documentation.projectName}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-text-dim">
                {compactText(documentation.summary, 260)}
              </p>
              {documentationNeedsReview && documentation.quality.findings[0] && (
                <p className="mt-3 max-w-2xl rounded-2xl border border-[#ffcb6b]/20 bg-[#ffcb6b]/8 px-4 py-3 text-xs leading-5 text-[#ffdf9a]">
                  Review before handoff: {documentation.quality.findings[0]}
                </p>
              )}
              <p className="mt-3 text-[10px] uppercase tracking-[0.24em] text-text-dim">
                Generated {formatGeneratedAt(documentation.generatedAt)}
              </p>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 text-left sm:w-auto sm:min-w-[240px] sm:text-right">
              <MetricTile label="Files" value={documentation.workspace.totalFiles} />
              <MetricTile label="Deliverables" value={deliverables.length} />
              <MetricTile label="Modules" value={documentation.modules.length} />
              <MetricTile label="Time" value={`${(documentation.workspace.elapsedMs / 1000).toFixed(1)}s`} />
            </div>
          </div>
        </div>

        <div className="px-4 pt-5 sm:px-6 sm:pt-6">
          <LaunchPlanPanel launchPlan={launchPlan} sessionId={sessionId} />
        </div>

        <div className="grid gap-5 px-4 py-5 sm:px-6 sm:py-6 2xl:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-6">
            <ProductDeliverablesSection deliverables={deliverables} />

            <section className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-text-dim">
                  <TerminalSquare size={14} className="text-accent" />
                  Next actions
                </div>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-text-dim">
                  {primaryCommands.length} primary
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {primaryCommands.map((command) => (
                  <CommandCard key={command.name} command={command} />
                ))}
              </div>
              {secondaryCommands.length > 0 && (
                <LazyDetails
                  className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4"
                  summaryClassName="flex cursor-pointer list-none items-center justify-between gap-3"
                  summary={(
                    <>
                      <div>
                        <div className="text-sm font-medium text-white">Show all commands</div>
                        <p className="mt-1 text-xs leading-5 text-text-dim">
                          {secondaryCommands.length} extra setup, build and diagnostic commands stay available without crowding the handoff.
                        </p>
                      </div>
                      <ChevronRight size={14} className="text-accent" />
                    </>
                  )}
                >
                  <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 md:grid-cols-2 2xl:grid-cols-3">
                    {secondaryCommands.map((command) => (
                      <CommandCard key={command.name} command={command} />
                    ))}
                  </div>
                </LazyDetails>
              )}
            </section>

            <LazyDetails
              className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
              summaryClassName="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3"
              summary={(
                <>
                  <div>
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-text-dim">
                      <FolderKanban size={14} className="text-accent" />
                      Internal module inventory
                    </div>
                    <p className="mt-2 text-sm leading-6 text-text-dim">
                      {documentation.modules.length} construction lanes are tucked away so the handoff stays focused on the runnable product.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {typeEntries.map(([type, count]) => (
                      <span key={type} className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-text-dim">
                        {type} {count}
                      </span>
                    ))}
                    <span className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-text-dim">
                      inspect
                      <ChevronRight size={13} />
                    </span>
                  </div>
                </>
              )}
            >
              <div className="mt-5 border-t border-white/10 pt-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-text-dim">
                    <FolderKanban size={14} className="text-accent" />
                    Internal module inventory
                  </div>
                  <p className="mt-2 text-sm leading-6 text-text-dim">
                    Retrobuilder construction lanes. Expand only when you need acceptance criteria, receipts, or low-level runtime evidence.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {typeEntries.map(([type, count]) => (
                    <span key={type} className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-text-dim">
                      {type} {count}
                    </span>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                {featuredModules.map((module) => (
                  <CompactModuleCard key={module.nodeId || module.modulePath} module={module} />
                ))}
                {remainingModules.length > 0 && (
                  <LazyDetails
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                    summaryClassName="flex cursor-pointer list-none items-center justify-between gap-3"
                    summary={(
                      <>
                        <div>
                          <div className="text-sm font-medium text-white">Show remaining modules</div>
                          <p className="mt-1 text-xs leading-5 text-text-dim">
                            {remainingModules.length} additional generated modules are ready, verified and available for inspection.
                          </p>
                        </div>
                        <ChevronRight size={14} className="text-accent" />
                      </>
                    )}
                  >
                    <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                      {remainingModules.map((module) => (
                        <CompactModuleCard key={module.nodeId || module.modulePath} module={module} />
                      ))}
                    </div>
                  </LazyDetails>
                )}
              </div>
              </div>
            </LazyDetails>

            <TechnicalDossier documentation={documentation} />
          </div>

          <div className="space-y-6">
            <LazyDetails
              className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
              summaryClassName="flex cursor-pointer list-none items-center justify-between gap-4"
              summary={(
                <>
                  <div>
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-text-dim">
                      <ClipboardCheck size={14} className="text-accent" />
                      Confidence summary
                    </div>
                    <p className="mt-2 text-sm leading-6 text-text-dim">
                      Verify, smoke and design evidence are available when you need the audit trail.
                    </p>
                  </div>
                  <span className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-text-dim">
                    open
                    <ChevronRight size={13} />
                  </span>
                </>
              )}
            >
              <div className="mt-5 space-y-3 border-t border-white/10 pt-5">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-text-dim">System verify</div>
                  <div className="mt-2 text-base font-medium text-white">
                    {systemVerify.status}
                    {systemVerify.command ? ` · ${systemVerify.command}` : ''}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-text-dim">
                    {compactText(systemVerify.summary, 190)}
                  </p>
                  {systemVerify.summary && systemVerify.summary.length > 190 && (
                    <LazyDetails
                      className="mt-3 rounded-xl border border-white/10 bg-white/[0.025] p-3"
                      summaryClassName="cursor-pointer text-[10px] uppercase tracking-[0.2em] text-text-dim"
                      summary="Full verify output"
                    >
                      <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-5 text-white/80 custom-scrollbar">
                        {systemVerify.summary}
                      </pre>
                    </LazyDetails>
                  )}
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-text-dim">21st design gate</div>
                  <div className="mt-2 text-base font-medium text-white">
                    {documentation.verification.designGateStatus} · {documentation.verification.designScore}
                  </div>
                  <ul className="mt-2 space-y-1 text-sm leading-5 text-text-dim">
                    {documentation.verification.designFindings.length > 0
                      ? documentation.verification.designFindings.slice(0, 3).map((entry) => <li key={entry}>- {entry}</li>)
                      : <li>- no open findings</li>}
                  </ul>
                </div>
              </div>
            </LazyDetails>

            <LazyDetails
              className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
              summaryClassName="flex cursor-pointer list-none items-center justify-between gap-4"
              summary={(
                <>
                  <div>
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-text-dim">
                      <ShieldCheck size={14} className="text-accent" />
                      Docs quality
                    </div>
                    <p className="mt-2 text-sm leading-6 text-text-dim">
                      {documentation.quality.status} · {documentation.quality.score}/100
                    </p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${qualityTone(documentation.quality.status)}`}>
                    details
                  </span>
                </>
              )}
            >
              <div className="mt-5 border-t border-white/10 pt-5">
              <div className={`rounded-2xl border px-4 py-3 text-[11px] uppercase tracking-[0.22em] ${qualityTone(documentation.quality.status)}`}>
                {documentation.quality.status} · {documentation.quality.score}/100
              </div>
              <div className="mt-4 space-y-3">
                {documentation.quality.checks.slice(0, 3).map((check) => (
                  <div key={check.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-white">{check.label}</div>
                      <div className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${qualityTone(check.status)}`}>
                        {check.status}
                      </div>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-text-dim">{compactText(check.detail, 130)}</p>
                  </div>
                ))}
              </div>
              <LazyDetails
                className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4"
                summaryClassName="cursor-pointer text-[10px] uppercase tracking-[0.22em] text-text-dim"
                summary="Open findings and all checks"
              >
                <ul className="mt-3 space-y-2 text-sm leading-5 text-white/90">
                  {documentation.quality.findings.length > 0
                    ? documentation.quality.findings.map((entry) => <li key={entry}>- {entry}</li>)
                    : <li>- no documentation gaps detected</li>}
                </ul>
              </LazyDetails>
              </div>
            </LazyDetails>

            <LazyDetails
              className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
              summaryClassName="flex cursor-pointer list-none items-center justify-between gap-4"
              summary={(
                <>
                  <div>
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-text-dim">
                      <Layers3 size={14} className="text-accent" />
                      Stack and surfaces
                    </div>
                    <p className="mt-2 text-sm leading-6 text-text-dim">
                      {documentation.technologies.length || 0} detected stack markers.
                    </p>
                  </div>
                  <span className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-text-dim">
                    open
                    <ChevronRight size={13} />
                  </span>
                </>
              )}
            >
              <div className="mt-5 border-t border-white/10 pt-5">
              <div className="flex flex-wrap gap-2">
                {documentation.technologies.map((technology) => (
                  <div key={technology.name} title={technology.note} className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-white">
                    {technology.name}
                  </div>
                ))}
              </div>
              <LazyDetails
                className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4"
                summaryClassName="cursor-pointer text-[10px] uppercase tracking-[0.22em] text-text-dim"
                summary="Intake and usage modes"
              >
                <ul className="mt-3 space-y-2 text-sm leading-5 text-white/90">
                  {documentation.intakeChannels.map((entry) => <li key={entry}>- {entry}</li>)}
                  {documentation.usageModes.map((entry) => <li key={entry}>- {entry}</li>)}
                  {documentation.intakeChannels.length === 0 && documentation.usageModes.length === 0 && <li>- no explicit intake channels were inferred</li>}
                </ul>
              </LazyDetails>
              </div>
            </LazyDetails>
          </div>
        </div>
      </div>
    </div>
  );
}
