#!/usr/bin/env tsx
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { generateOmxBuildDocumentationArtifacts } from '../src/server/omx-build-docs.ts';
import type { SessionDocument } from '../src/server/session-store.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function createSession(): SessionDocument {
  return {
    id: 'session-docs-contract',
    name: 'Bakery IT',
    source: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    manifesto: 'Bakery IT delivers warm bread through WhatsApp intake and a mobile-first website.',
    architecture: 'A mobile ordering frontend coordinates catalog, subscriptions, and delivery operations.',
    projectContext: 'contract-test',
    graph: {
      nodes: [
        {
          id: 'mobile-ordering',
          label: 'Mobile Ordering',
          type: 'frontend',
          status: 'pending',
          group: 1,
          priority: 1,
          description: 'Collects customer orders from the mobile-first web flow.',
          data_contract: 'Input: order payload. Output: validated checkout intent.',
          acceptance_criteria: ['Supports mobile-first ordering', 'Captures delivery slots'],
          error_handling: ['Shows validation feedback for missing address'],
        },
        {
          id: 'whatsapp-intake',
          label: 'WhatsApp Intake',
          type: 'external',
          status: 'pending',
          group: 1,
          priority: 2,
          description: 'Receives WhatsApp messages and turns them into order intents.',
          data_contract: 'Input: WhatsApp webhook. Output: normalized order intent.',
          acceptance_criteria: ['Parses WhatsApp intake messages', 'Hands off normalized orders'],
          error_handling: ['Rejects malformed message payloads'],
        },
      ],
      links: [
        { source: 'whatsapp-intake', target: 'mobile-ordering' },
      ],
    },
  } as SessionDocument;
}

async function createWorkspace(root: string) {
  const rootPackage = {
    name: '@retrobuilder/generated-workspace',
    private: true,
    workspaces: ['modules/*'],
    scripts: {
      bootstrap: 'node scripts/bootstrap-workspace.cjs',
      verify: 'node scripts/verify-workspace.cjs',
      build: 'node scripts/build-workspace.cjs',
      start: 'node scripts/start-workspace.cjs',
      smoke: 'node scripts/smoke-workspace.cjs',
    },
    devDependencies: {
      typescript: '^5.8.3',
      react: '^19.0.0',
    },
  };

  await mkdir(path.join(root, 'modules', 'mobile-ordering', 'src'), { recursive: true });
  await mkdir(path.join(root, 'modules', 'whatsapp-intake', 'src'), { recursive: true });
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await mkdir(path.join(root, '.omx'), { recursive: true });

  await writeFile(path.join(root, 'package.json'), JSON.stringify(rootPackage, null, 2), 'utf8');
  await writeFile(path.join(root, '.env.example'), 'PORT=7777\nNODE_ENV=development\nDATABASE_URL=postgresql://demo\n', 'utf8');

  await writeFile(path.join(root, 'modules', 'mobile-ordering', 'README.md'), '# Mobile Ordering\n\nHandles the mobile-first web storefront for Bakery IT.\n', 'utf8');
  await writeFile(path.join(root, 'modules', 'mobile-ordering', 'module.spec.json'), JSON.stringify({
    id: 'mobile-ordering',
    materialization: {
      strategy: 'deterministic-fallback',
      baselineKind: 'product-frontend',
      generatedBy: 'retrobuilder-product-frontend-baseline',
    },
  }, null, 2), 'utf8');
  await writeFile(path.join(root, 'modules', 'mobile-ordering', 'package.json'), JSON.stringify({
    name: '@retrobuilder/mobile-ordering',
    private: true,
    scripts: {
      verify: 'node --test src/index.test.js',
    },
    dependencies: {
      react: '^19.0.0',
    },
  }, null, 2), 'utf8');
  await writeFile(path.join(root, 'modules', 'mobile-ordering', 'src', 'index.js'), 'module.exports = { render: () => "ok" };\n', 'utf8');
  await writeFile(path.join(root, 'modules', 'mobile-ordering', 'src', 'index.test.js'), 'console.log("ok");\n', 'utf8');

  await writeFile(path.join(root, 'modules', 'whatsapp-intake', 'README.md'), '# WhatsApp Intake\n\nNormalizes WhatsApp webhook payloads into order intents.\n', 'utf8');
  await writeFile(path.join(root, 'modules', 'whatsapp-intake', 'package.json'), JSON.stringify({
    name: '@retrobuilder/whatsapp-intake',
    private: true,
    scripts: {
      verify: 'node --test src/index.test.js',
    },
  }, null, 2), 'utf8');
  await writeFile(path.join(root, 'modules', 'whatsapp-intake', 'src', 'index.js'), 'module.exports = { normalize: () => "ok" };\n', 'utf8');
  await writeFile(path.join(root, 'modules', 'whatsapp-intake', 'src', 'index.test.js'), 'console.log("ok");\n', 'utf8');
}

async function run() {
  const session = createSession();
  const workspacePath = await mkdtemp(path.join(tmpdir(), 'omx-build-docs-contract-'));
  try {
    await createWorkspace(workspacePath);

    const artifacts = await generateOmxBuildDocumentationArtifacts({
      workspacePath,
      session,
      buildId: 'build-docs-001',
      executionGraph: {
        ledgerVersion: 1,
        workerCount: 2,
        tasks: [
          {
            taskId: 'task:mobile-ordering',
            nodeId: 'mobile-ordering',
            waveId: 'wave-1',
            label: 'Mobile Ordering',
            type: 'frontend',
            priority: 1,
            dependsOnTaskIds: [],
            readSet: ['.omx/**'],
            writeSet: ['modules/mobile-ordering/**'],
            sharedArtifacts: [],
            verifyCommand: 'npm run verify --prefix modules/mobile-ordering',
            completionGate: { verify: true, ownership: true, artifacts: true },
            estimatedCost: 5,
            status: 'merged',
          },
          {
            taskId: 'task:whatsapp-intake',
            nodeId: 'whatsapp-intake',
            waveId: 'wave-1',
            label: 'WhatsApp Intake',
            type: 'external',
            priority: 2,
            dependsOnTaskIds: [],
            readSet: ['.omx/**'],
            writeSet: ['modules/whatsapp-intake/**'],
            sharedArtifacts: [],
            verifyCommand: 'npm run verify --prefix modules/whatsapp-intake',
            completionGate: { verify: true, ownership: true, artifacts: true },
            estimatedCost: 4,
            status: 'merged',
          },
        ],
        waves: [
          { waveId: 'wave-1', taskIds: ['task:mobile-ordering', 'task:whatsapp-intake'], status: 'merged' },
        ],
        ownership: {
          ledgerVersion: 1,
          rules: [],
        },
      } as any,
      verifyReceipts: {
        'task:mobile-ordering': {
          taskId: 'task:mobile-ordering',
          passed: true,
          command: 'npm run verify --prefix modules/mobile-ordering',
          summary: 'Mobile storefront verify passed.',
          verifiedAt: new Date().toISOString(),
        },
        'task:whatsapp-intake': {
          taskId: 'task:whatsapp-intake',
          passed: true,
          command: 'npm run verify --prefix modules/whatsapp-intake',
          summary: 'WhatsApp intake verify passed.',
          verifiedAt: new Date().toISOString(),
        },
      },
      mergeReceipts: {
        'task:mobile-ordering': {
          taskId: 'task:mobile-ordering',
          applied: true,
          appliedPaths: ['modules/mobile-ordering/README.md'],
          rejectedPaths: [],
          mergedAt: new Date().toISOString(),
        },
        'task:whatsapp-intake': {
          taskId: 'task:whatsapp-intake',
          applied: true,
          appliedPaths: ['modules/whatsapp-intake/README.md'],
          rejectedPaths: [],
          mergedAt: new Date().toISOString(),
        },
      },
      designSummary: {
        designProfile: '21st',
        designGateStatus: 'passed',
        designScore: 92,
        designFindings: [],
        designEvidence: ['Mobile-first storefront'],
        affectedNodeIds: ['mobile-ordering'],
        failingNodeIds: [],
      },
      systemVerify: {
        status: 'passed',
        command: 'npm run smoke',
        summary: 'npm run verify: ok\nnpm run build: ok\nnpm run smoke: ok',
      },
      elapsedMs: 22_500,
    });

    expect(artifacts.documentation.intakeChannels.includes('WhatsApp intake'), 'Expected documentation to detect WhatsApp intake.');
    expect(artifacts.documentation.intakeChannels.includes('Mobile-first web intake'), 'Expected documentation to detect mobile-first web intake.');
    expect(artifacts.documentation.projectName === 'Bakery IT', `Expected docs to preserve the project name. Got ${artifacts.documentation.projectName}`);
    expect(artifacts.documentation.commands.some((entry) => entry.command === 'npm run smoke'), 'Expected smoke command to be documented.');
    expect(artifacts.documentation.launchPlan.stack.includes('Node.js workspace'), 'Expected documentation to persist a stack-aware launch plan.');
    expect(artifacts.documentation.launchPlan.runCommand.includes('npm run start'), 'Expected launch plan to prefer the generated start command.');
    expect(artifacts.documentation.launchPlan.copyPasteScript.includes(`cd "${workspacePath}"`), 'Expected launch plan to include a ready-to-run workspace script.');
    expect(artifacts.documentation.launchPlan.previewUrl?.startsWith('http://127.0.0.1:'), 'Expected launch plan to expose a clickable preview URL.');
    expect(artifacts.documentation.launchPlan.healthUrl?.endsWith('/api/health'), 'Expected launch plan to expose a health validation URL.');
    expect(artifacts.documentation.launchPlan.launchScriptPath === '.omx/run-project.sh', 'Expected launch plan to persist a generated launch script path.');
    expect(artifacts.runnableManifest.manifestPath === '.omx/runnable-manifest.json', 'Expected artifacts to expose the runnable manifest path.');
    expect(artifacts.documentation.runnableManifest.primaryRunCommand === artifacts.documentation.launchPlan.runCommand, 'Expected documentation runnable manifest to be the launch-plan SSOT for the primary run command.');
    expect(artifacts.documentation.runnableManifest.commands.some((entry) => entry.primary && entry.command.includes('npm run start')), 'Expected runnable manifest to mark the stack-aware start command as primary.');
    expect(artifacts.documentation.runnableManifest.endpoints.some((entry) => entry.name === 'preview' && entry.url === artifacts.documentation.launchPlan.previewUrl), 'Expected runnable manifest to carry the preview endpoint.');
    expect(artifacts.documentation.runnableManifest.endpoints.some((entry) => entry.name === 'health' && entry.url === artifacts.documentation.launchPlan.healthUrl), 'Expected runnable manifest to carry the health endpoint.');
    expect(artifacts.documentation.deliverables.length === 2, `Expected two product deliverables. Got ${artifacts.documentation.deliverables.length}`);
    const primaryDeliverable = artifacts.documentation.deliverables.find((entry) => entry.primary);
    expect(primaryDeliverable?.label === 'Mobile Ordering', `Expected the frontend to be the primary deliverable. Got ${primaryDeliverable?.label}`);
    expect(primaryDeliverable?.kind === 'app', `Expected the primary deliverable to be a runnable app. Got ${primaryDeliverable?.kind}`);
    expect(primaryDeliverable?.path === 'modules/mobile-ordering', `Expected primary deliverable path to point at its generated module. Got ${primaryDeliverable?.path}`);
    expect(primaryDeliverable?.runCommand === artifacts.documentation.launchPlan.runCommand, 'Expected primary deliverable to inherit the stack-aware launch command.');
    expect(primaryDeliverable?.previewUrl === artifacts.documentation.launchPlan.previewUrl, 'Expected primary deliverable to inherit the preview URL.');
    expect(primaryDeliverable?.healthUrl === artifacts.documentation.launchPlan.healthUrl, 'Expected primary deliverable to inherit the health URL.');
    expect(primaryDeliverable?.evidence.some((entry) => entry.includes('Materialization: deterministic-fallback (product-frontend)')), 'Expected primary deliverable evidence to surface fallback materialization provenance.');
    const integrationDeliverable = artifacts.documentation.deliverables.find((entry) => entry.id === 'whatsapp-intake');
    expect(integrationDeliverable?.kind === 'integration', `Expected external nodes to become integration deliverables. Got ${integrationDeliverable?.kind}`);
    expect(artifacts.documentation.technologies.some((entry) => entry.name === 'React'), 'Expected React to be inferred from module packages.');
    expect(artifacts.documentation.modules.length === 2, `Expected two modules in the documentation bundle. Got ${artifacts.documentation.modules.length}`);
    expect(artifacts.documentation.wikiPages.length === 2, `Expected per-module wiki pages. Got ${artifacts.documentation.wikiPages.length}`);
    expect(artifacts.documentation.quality.status === 'passed', `Expected documentation quality gate to pass. Got ${artifacts.documentation.quality.status}`);
    expect(artifacts.documentation.quality.score >= 90, `Expected documentation quality score >= 90. Got ${artifacts.documentation.quality.score}`);
    expect(artifacts.documentation.quality.checks.length >= 6, `Expected documentation quality checks to be recorded. Got ${artifacts.documentation.quality.checks.length}`);

    const readme = await readFile(path.join(workspacePath, 'README.md'), 'utf8');
    const wikiIndex = await readFile(path.join(workspacePath, '.omx', 'wiki', 'index.md'), 'utf8');
    const wikiSummary = await readFile(path.join(workspacePath, '.omx', 'wiki', 'build-summary.md'), 'utf8');
    const moduleWiki = await readFile(path.join(workspacePath, '.omx', 'wiki', 'modules', 'mobile-ordering.md'), 'utf8');
    const dossier = await readFile(path.join(workspacePath, '.omx', 'build-dossier.json'), 'utf8');
    const runnableManifest = JSON.parse(await readFile(path.join(workspacePath, '.omx', 'runnable-manifest.json'), 'utf8'));
    const launchScriptPath = path.join(workspacePath, '.omx', 'run-project.sh');
    const launchScript = await readFile(launchScriptPath, 'utf8');
    const launchScriptStat = await stat(launchScriptPath);

    expect(readme.startsWith('# Bakery IT\n'), 'Expected synthesized README to use the session name as the product title.');
    expect(readme.includes('What Retrobuilder Built'), 'Expected synthesized README to replace the bootstrap-only README.');
    expect(readme.includes('## Product Deliverables'), 'Expected synthesized README to put product deliverables before internal module inventory.');
    expect(readme.includes('**Mobile Ordering** (app, primary)'), 'Expected synthesized README to identify the runnable primary app.');
    expect(readme.includes('**WhatsApp Intake** (integration)'), 'Expected synthesized README to identify integration deliverables.');
    expect(readme.includes('## Internal Modules'), 'Expected synthesized README to label generated modules as internal evidence.');
    expect(readme.includes('construction lanes and verification receipts'), 'Expected synthesized README to explain that modules are construction lanes.');
    expect(readme.includes('Run And Validate'), 'Expected synthesized README to include user-facing launch instructions.');
    expect(readme.includes('Launch script: `.omx/run-project.sh`'), 'Expected synthesized README to point at the generated launch script artifact.');
    expect(readme.includes('Runnable manifest: `.omx/runnable-manifest.json`'), 'Expected synthesized README to point at the generated runnable manifest artifact.');
    expect(readme.includes(artifacts.documentation.launchPlan.copyPasteScript), 'Expected synthesized README to include the exact launch script.');
    expect(launchScript.startsWith('#!/usr/bin/env bash'), 'Expected generated launch script to be a bash script.');
    expect(launchScript.includes('npm run bootstrap'), 'Expected generated launch script to run setup before start.');
    expect(launchScript.includes('npm run start'), 'Expected generated launch script to start the generated runtime.');
    expect((launchScriptStat.mode & 0o111) !== 0, 'Expected generated launch script to be executable.');
    expect(readme.includes('Documentation Quality'), 'Expected synthesized README to report documentation quality.');
    expect(wikiIndex.includes('Wiki Index'), 'Expected wiki index to include the generated wiki navigation.');
    expect(wikiIndex.includes('Launch Plan'), 'Expected wiki index to include launch instructions.');
    expect(wikiIndex.includes('## Product Deliverables'), 'Expected wiki index to expose user-facing product deliverables.');
    expect(wikiIndex.includes('## Internal Module Map'), 'Expected wiki index to separate internal construction modules from deliverables.');
    expect(wikiIndex.includes('Materialization: deterministic-fallback (product-frontend)'), 'Expected wiki index to expose fallback materialization provenance.');
    expect(wikiIndex.includes('Launch script: `.omx/run-project.sh`'), 'Expected wiki index to point at the generated launch script artifact.');
    expect(wikiIndex.includes('Runnable manifest: `.omx/runnable-manifest.json`'), 'Expected wiki index to point at the generated runnable manifest artifact.');
    expect(wikiIndex.includes('Documentation Quality Gate'), 'Expected wiki index to include documentation quality gate details.');
    expect(wikiSummary.includes('Verification Evidence'), 'Expected build summary page to include verification evidence.');
    expect(moduleWiki.includes('Acceptance Criteria'), 'Expected per-module wiki page to include acceptance criteria.');
    expect(dossier.includes('"wikiBuildSummaryPath": ".omx/wiki/build-summary.md"'), 'Expected dossier JSON to persist wiki paths.');
    expect(dossier.includes('"projectName": "Bakery IT"'), 'Expected dossier JSON to persist the project name.');
    expect(dossier.includes('"launchPlan"'), 'Expected dossier JSON to persist launch plan metadata.');
    expect(dossier.includes('"runnableManifest"'), 'Expected dossier JSON to persist runnable manifest metadata.');
    expect(dossier.includes('"deliverables"'), 'Expected dossier JSON to persist product deliverable metadata.');
    expect(dossier.includes('"quality"'), 'Expected dossier JSON to persist documentation quality results.');
    expect(runnableManifest.version === 1, `Expected runnable manifest version 1. Got ${runnableManifest.version}`);
    expect(runnableManifest.primaryRunCommand === artifacts.documentation.launchPlan.runCommand, 'Expected standalone runnable manifest to match the launch plan primary run command.');
    expect(runnableManifest.copyPasteScript === artifacts.documentation.launchPlan.copyPasteScript, 'Expected standalone runnable manifest to persist the exact copy-paste script.');
    expect(runnableManifest.deliverables.some((entry: { primary?: boolean; label?: string }) => entry.primary && entry.label === 'Mobile Ordering'), 'Expected standalone runnable manifest to identify the primary deliverable.');

    await writeFile(path.join(workspacePath, 'package.json'), JSON.stringify({
      name: '@retrobuilder/generated-workspace',
      private: true,
      workspaces: ['modules/*'],
      scripts: {
        bootstrap: 'node scripts/bootstrap-workspace.cjs',
      },
    }, null, 2), 'utf8');

    const weakerSession = createSession();
    weakerSession.graph.nodes[0] = {
      ...weakerSession.graph.nodes[0],
      acceptance_criteria: [],
    };

    const degraded = await generateOmxBuildDocumentationArtifacts({
      workspacePath,
      session: weakerSession,
      buildId: 'build-docs-002',
      executionGraph: {
        ledgerVersion: 1,
        workerCount: 2,
        tasks: [
          {
            taskId: 'task:mobile-ordering',
            nodeId: 'mobile-ordering',
            waveId: 'wave-1',
            label: 'Mobile Ordering',
            type: 'frontend',
            priority: 1,
            dependsOnTaskIds: [],
            readSet: ['.omx/**'],
            writeSet: ['modules/mobile-ordering/**'],
            sharedArtifacts: [],
            verifyCommand: 'npm run verify --prefix modules/mobile-ordering',
            completionGate: { verify: true, ownership: true, artifacts: true },
            estimatedCost: 5,
            status: 'merged',
          },
          {
            taskId: 'task:whatsapp-intake',
            nodeId: 'whatsapp-intake',
            waveId: 'wave-1',
            label: 'WhatsApp Intake',
            type: 'external',
            priority: 2,
            dependsOnTaskIds: [],
            readSet: ['.omx/**'],
            writeSet: ['modules/whatsapp-intake/**'],
            sharedArtifacts: [],
            verifyCommand: 'npm run verify --prefix modules/whatsapp-intake',
            completionGate: { verify: true, ownership: true, artifacts: true },
            estimatedCost: 4,
            status: 'merged',
          },
        ],
        waves: [
          { waveId: 'wave-1', taskIds: ['task:mobile-ordering', 'task:whatsapp-intake'], status: 'merged' },
        ],
        ownership: {
          ledgerVersion: 1,
          rules: [],
        },
      } as any,
      verifyReceipts: {
        'task:mobile-ordering': {
          taskId: 'task:mobile-ordering',
          passed: true,
          command: 'npm run verify --prefix modules/mobile-ordering',
          summary: 'Mobile storefront verify passed.',
          verifiedAt: new Date().toISOString(),
        },
        'task:whatsapp-intake': {
          taskId: 'task:whatsapp-intake',
          passed: true,
          command: 'npm run verify --prefix modules/whatsapp-intake',
          summary: 'WhatsApp intake verify passed.',
          verifiedAt: new Date().toISOString(),
        },
      },
      mergeReceipts: {
        'task:mobile-ordering': {
          taskId: 'task:mobile-ordering',
          applied: true,
          appliedPaths: ['modules/mobile-ordering/README.md'],
          rejectedPaths: [],
          mergedAt: new Date().toISOString(),
        },
        'task:whatsapp-intake': {
          taskId: 'task:whatsapp-intake',
          applied: true,
          appliedPaths: ['modules/whatsapp-intake/README.md'],
          rejectedPaths: [],
          mergedAt: new Date().toISOString(),
        },
      },
      designSummary: {
        designProfile: '21st',
        designGateStatus: 'passed',
        designScore: 92,
        designFindings: [],
        designEvidence: ['Mobile-first storefront'],
        affectedNodeIds: ['mobile-ordering'],
        failingNodeIds: [],
      },
      systemVerify: {
        status: 'passed',
        command: 'npm run smoke',
        summary: 'npm run verify: ok\nnpm run build: ok\nnpm run smoke: ok',
      },
      elapsedMs: 15_000,
    });

    expect(degraded.documentation.quality.status === 'needs_review', `Expected degraded documentation quality to need review. Got ${degraded.documentation.quality.status}`);
    expect(degraded.documentation.quality.findings.some((entry) => entry.includes('Execution guidance')), 'Expected degraded documentation quality to flag execution guidance.');
    expect(degraded.documentation.quality.findings.some((entry) => entry.includes('Module contracts')), 'Expected degraded documentation quality to flag module contracts.');

    const blocking = await generateOmxBuildDocumentationArtifacts({
      workspacePath,
      session,
      buildId: 'build-docs-003',
      executionGraph: {
        ledgerVersion: 1,
        workerCount: 2,
        tasks: [
          {
            taskId: 'task:mobile-ordering',
            nodeId: 'mobile-ordering',
            waveId: 'wave-1',
            label: 'Mobile Ordering',
            type: 'frontend',
            priority: 1,
            dependsOnTaskIds: [],
            readSet: ['.omx/**'],
            writeSet: ['modules/mobile-ordering/**'],
            sharedArtifacts: [],
            verifyCommand: 'npm run verify --prefix modules/mobile-ordering',
            completionGate: { verify: true, ownership: true, artifacts: true },
            estimatedCost: 5,
            status: 'merged',
          },
          {
            taskId: 'task:whatsapp-intake',
            nodeId: 'whatsapp-intake',
            waveId: 'wave-1',
            label: 'WhatsApp Intake',
            type: 'external',
            priority: 2,
            dependsOnTaskIds: [],
            readSet: ['.omx/**'],
            writeSet: ['modules/whatsapp-intake/**'],
            sharedArtifacts: [],
            verifyCommand: 'npm run verify --prefix modules/whatsapp-intake',
            completionGate: { verify: true, ownership: true, artifacts: true },
            estimatedCost: 4,
            status: 'merged',
          },
        ],
        waves: [
          { waveId: 'wave-1', taskIds: ['task:mobile-ordering', 'task:whatsapp-intake'], status: 'merged' },
        ],
        ownership: {
          ledgerVersion: 1,
          rules: [],
        },
      } as any,
      verifyReceipts: {},
      mergeReceipts: {
        'task:mobile-ordering': {
          taskId: 'task:mobile-ordering',
          applied: true,
          appliedPaths: ['modules/mobile-ordering/README.md'],
          rejectedPaths: [],
          mergedAt: new Date().toISOString(),
        },
        'task:whatsapp-intake': {
          taskId: 'task:whatsapp-intake',
          applied: true,
          appliedPaths: ['modules/whatsapp-intake/README.md'],
          rejectedPaths: [],
          mergedAt: new Date().toISOString(),
        },
      },
      designSummary: {
        designProfile: '21st',
        designGateStatus: 'passed',
        designScore: 92,
        designFindings: [],
        designEvidence: ['Mobile-first storefront'],
        affectedNodeIds: ['mobile-ordering'],
        failingNodeIds: [],
      },
      systemVerify: {
        status: 'passed',
        command: 'npm run smoke',
        summary: 'npm run verify: ok\nnpm run build: ok\nnpm run smoke: ok',
      },
      elapsedMs: 15_500,
    });

    expect(blocking.documentation.quality.status === 'failed', `Expected missing verify evidence to hard-fail docs quality. Got ${blocking.documentation.quality.status}`);
    expect(blocking.documentation.quality.findings.some((entry) => entry.includes('Verification evidence')), 'Expected blocking docs quality to flag verification evidence.');

    await writeFile(path.join(workspacePath, 'package.json'), JSON.stringify({
      name: '@retrobuilder/root-only-app',
      private: true,
      scripts: {
        verify: 'node scripts/verify-workspace.cjs',
        build: 'node scripts/build-workspace.cjs',
        start: 'node scripts/start-workspace.cjs',
        smoke: 'node scripts/smoke-workspace.cjs',
      },
      dependencies: {
        express: '^4.21.2',
      },
    }, null, 2), 'utf8');

    const rootOnly = await generateOmxBuildDocumentationArtifacts({
      workspacePath,
      session,
      buildId: 'build-docs-root-only',
      executionGraph: {
        ledgerVersion: 1,
        workerCount: 0,
        tasks: [],
        waves: [],
        ownership: {
          ledgerVersion: 1,
          rules: [],
        },
      } as any,
      verifyReceipts: {},
      mergeReceipts: {},
      designSummary: {
        designProfile: '21st',
        designGateStatus: 'passed',
        designScore: 95,
        designFindings: [],
        designEvidence: ['Root application handoff'],
        affectedNodeIds: [],
        failingNodeIds: [],
      },
      systemVerify: {
        status: 'passed',
        command: 'npm run smoke',
        summary: 'root workspace smoke passed',
      },
      elapsedMs: 8_000,
    });

    expect(rootOnly.documentation.deliverables.length === 1, `Expected root-only workspaces to produce one deliverable. Got ${rootOnly.documentation.deliverables.length}`);
    expect(rootOnly.documentation.deliverables[0].primary, 'Expected root-only deliverable to be primary.');
    expect(rootOnly.documentation.deliverables[0].path === '.', `Expected root-only deliverable path to be workspace root. Got ${rootOnly.documentation.deliverables[0].path}`);
    expect(rootOnly.documentation.deliverables[0].runCommand.includes('npm run start'), 'Expected root-only deliverable to inherit the root launch command.');
    expect(rootOnly.documentation.runnableManifest.deliverables[0].path === '.', `Expected root-only runnable manifest deliverable path to be workspace root. Got ${rootOnly.documentation.runnableManifest.deliverables[0].path}`);
    expect(rootOnly.documentation.runnableManifest.primaryRunCommand.includes('npm run start'), 'Expected root-only runnable manifest to inherit the root launch command.');
    expect(rootOnly.documentation.quality.status === 'passed', `Expected root-only documentation quality to pass. Got ${rootOnly.documentation.quality.status}`);

    await writeFile(path.join(workspacePath, 'package.json'), JSON.stringify({
      name: '@retrobuilder/build-only-app',
      private: true,
      scripts: {
        verify: 'node scripts/verify-workspace.cjs',
        build: 'node scripts/build-workspace.cjs',
      },
    }, null, 2), 'utf8');

    const buildOnly = await generateOmxBuildDocumentationArtifacts({
      workspacePath,
      session,
      buildId: 'build-docs-build-only',
      executionGraph: {
        ledgerVersion: 1,
        workerCount: 0,
        tasks: [],
        waves: [],
        ownership: {
          ledgerVersion: 1,
          rules: [],
        },
      } as any,
      verifyReceipts: {},
      mergeReceipts: {},
      designSummary: {
        designProfile: '21st',
        designGateStatus: 'passed',
        designScore: 95,
        designFindings: [],
        designEvidence: ['Build-only workspace handoff'],
        affectedNodeIds: [],
        failingNodeIds: [],
      },
      systemVerify: {
        status: 'passed',
        command: 'npm run verify',
        summary: 'root workspace verify passed',
      },
      elapsedMs: 8_000,
    });

    expect(buildOnly.documentation.launchPlan.runCommand.startsWith('Inspect README.md'), `Expected build-only workspace not to be treated as a runnable handoff. Got ${buildOnly.documentation.launchPlan.runCommand}`);
    expect(buildOnly.documentation.launchPlan.buildCommand === 'npm run build', `Expected build-only workspace to keep build command separately. Got ${buildOnly.documentation.launchPlan.buildCommand}`);
    expect(buildOnly.documentation.runnableManifest.primaryRunCommand.startsWith('Inspect README.md'), `Expected build-only runnable manifest not to advertise a runtime command. Got ${buildOnly.documentation.runnableManifest.primaryRunCommand}`);
    expect(buildOnly.documentation.runnableManifest.buildCommand === 'npm run build', `Expected build-only runnable manifest to retain the build command. Got ${buildOnly.documentation.runnableManifest.buildCommand}`);
    expect(!buildOnly.documentation.deliverables[0].runCommand, 'Expected build-only root deliverable not to advertise a runtime command.');
    expect(buildOnly.documentation.quality.status === 'needs_review', `Expected build-only documentation quality to need review. Got ${buildOnly.documentation.quality.status}`);

    console.log('PASS omx build docs contract');
  } finally {
    await rm(workspacePath, { recursive: true, force: true }).catch(() => {});
  }
}

run().catch((error) => {
  console.error('FAIL omx build docs contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
