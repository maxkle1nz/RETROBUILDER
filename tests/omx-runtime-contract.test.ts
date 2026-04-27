#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const source = [
  readFileSync(path.join(ROOT, 'src/server/omx-runtime.ts'), 'utf8'),
  readFileSync(path.join(ROOT, 'src/server/agent-behavior-guidelines.ts'), 'utf8'),
  readFileSync(path.join(ROOT, 'src/server/clean-codex-designer.ts'), 'utf8'),
].join('\n');

function run() {
  expect(source.includes("type: 'build_compiled'"), 'Expected OMX runtime to emit build_compiled events.');
  expect(source.includes("type: 'verify_started'"), 'Expected OMX runtime to emit verify_started events.');
  expect(source.includes("type: 'verify_passed'"), 'Expected OMX runtime to emit verify_passed events.');
  expect(source.includes("type: 'verify_failed'"), 'Expected OMX runtime to emit verify_failed events.');
  expect(source.includes("type: 'merge_started'"), 'Expected OMX runtime to emit merge_started events.');
  expect(source.includes("type: 'merge_passed'"), 'Expected OMX runtime to emit merge_passed events.');
  expect(source.includes("type: 'merge_rejected'"), 'Expected OMX runtime to emit merge_rejected events.');
  expect(source.includes('recordOmxOperationalMessage'), 'Expected OMX runtime to expose durable operational message logging.');
  expect(source.includes('wavesTotal'), 'Expected OMX runtime status snapshot to expose wave counts.');
  expect(source.includes('verifyPendingCount'), 'Expected OMX runtime status snapshot to expose verify pending count.');
  expect(source.includes('verifyReceipts: build.verifyReceipts'), 'Expected OMX runtime live status to expose verifyReceipts for builder reentry truth.');
  expect(source.includes('mergeReceipts: build.mergeReceipts'), 'Expected OMX runtime live status to expose mergeReceipts for builder reentry truth.');
  expect(source.includes('resolveSystemVerify'), 'Expected OMX runtime to resolve a final system verify summary before completion.');
  expect(source.includes('systemVerify'), 'Expected OMX runtime status/result to expose final system verify state.');
  expect(source.includes('generateOmxBuildDocumentationArtifacts'), 'Expected OMX runtime to synthesize post-build documentation artifacts.');
  expect(source.includes('documentation: build.result.documentation'), 'Expected build_complete events to surface synthesized documentation.');
  expect(source.includes('Documentation quality gate'), 'Expected OMX runtime to emit documentation quality gate warnings when docs degrade.');
  expect(source.includes('documentation.quality.status'), 'Expected OMX runtime to inspect synthesized documentation quality before terminalizing the build.');
  expect(source.includes('Documentation quality gate failed.'), 'Expected OMX runtime to hard-fail builds when documentation integrity falls below the blocking threshold.');
  expect(source.includes('Documentation synthesis failed:'), 'Expected OMX runtime to surface documentation synthesis failures explicitly.');
  expect(source.includes('Review the generated workspace artifacts before certifying this build.'), 'Expected OMX runtime to block certification when final documentation cannot be synthesized.');
  expect(source.includes('OMX_CODEX_TASK_TIMEOUT_MS'), 'Expected OMX runtime to expose a configurable Codex task timeout.');
  expect(source.includes('OMX_CODEX_TASK_HEARTBEAT_MS'), 'Expected OMX runtime to expose configurable Codex worker heartbeat cadence.');
  expect(source.includes('DEFAULT_CODEX_TASK_HEARTBEAT_MS = 30 * 1000'), 'Expected OMX runtime to emit worker heartbeats while long Codex tasks are silent.');
  expect(source.includes('Codex still running'), 'Expected OMX runtime to stream liveness heartbeats for long-running Codex workers.');
  expect(source.includes('terminateProcessTree'), 'Expected OMX runtime to terminate a stuck Codex worker process group.');
  expect(source.includes('OMX_CODEX_HOME'), 'Expected OMX runtime to support isolated Codex home configuration.');
  expect(source.includes('OMX_CODEX_MODEL'), 'Expected OMX runtime to support configurable Codex worker model selection.');
  expect(source.includes('OMX_CODEX_REASONING_EFFORT'), 'Expected OMX runtime to support configurable Codex worker reasoning effort.');
  expect(source.includes('CODEX_DESIGNER_HOME'), 'Expected frontend designer workers to support clean Codex designer home configuration.');
  expect(source.includes('CODEX_DESIGNER_MODEL'), 'Expected frontend designer workers to support clean Codex designer model configuration.');
  expect(source.includes('CODEX_DESIGNER_REASONING_EFFORT'), 'Expected frontend designer workers to support clean Codex designer reasoning configuration.');
  expect(source.includes('CODEX_DESIGNER_TASK_TIMEOUT_MS'), 'Expected frontend designer workers to support a dedicated longer task timeout.');
  expect(source.includes('DEFAULT_CODEX_DESIGNER_TASK_TIMEOUT_MS'), 'Expected frontend designer workers to default to a designer-specific timeout.');
  expect(source.includes("const DEFAULT_CODEX_TASK_TIMEOUT_MS = 30 * 60 * 1000"), 'Expected default Codex task timeout to allow long autonomous work.');
  expect(source.includes("const DEFAULT_CODEX_DESIGNER_TASK_TIMEOUT_MS = 20 * 60 * 1000"), 'Expected clean designer default timeout to allow long visual generation while remaining bounded.');
  expect(source.includes("const DEFAULT_CODEX_DESIGNER_MODEL = 'gpt-5.4-mini'"), 'Expected clean designer to default to the fast designer-capable Codex model.');
  expect(source.includes("const DEFAULT_CODEX_DESIGNER_REASONING_EFFORT = 'high'"), 'Expected clean designer to use high effort on the smaller model.');
  expect(source.includes('isOmxEnvironmentKey'), 'Expected frontend designer workers to strip OMX environment variables.');
  expect(source.includes('isSensitiveWorkerEnvironmentKey'), 'Expected Codex workers to strip inherited API/token/secret environment variables.');
  expect(source.includes('RETROBUILDER_PASS_WORKER_SECRETS'), 'Expected worker secret inheritance to require an explicit override.');
  expect(source.includes('delete env[key]'), 'Expected frontend designer workers to delete inherited OMX environment keys.');
  expect(source.includes('tmpdir()'), 'Expected frontend designer workers to run outside the Retrobuilder repo tree.');
  expect(source.includes('prepareCleanDesignerCodexHome'), 'Expected frontend designer workers to prepare a minimal clean Codex home.');
  expect(source.includes("['auth.json', 'installation_id', 'version.json', 'models_cache.json']"), 'Expected clean Codex home to copy only auth/cache essentials.');
  expect(source.includes('copyFile(sourcePath'), 'Expected clean Codex home setup to copy auth/cache files instead of project prompt packs.');
  expect(source.includes('copyOmxState: false'), 'Expected frontend designer workers not to copy OMX state into clean overlays.');
  expect(source.includes('cleanDesignerRuntimeRoot'), 'Expected frontend designer workers to use an external clean runtime root.');
  expect(source.includes("path.join(lease.overlayPath, '.omx')"), 'Expected frontend designer overlays to remove copied OMX workspace state.');
  expect(source.includes("path.join(lease.overlayPath, '.codex')"), 'Expected frontend designer overlays to remove project-local Codex prompt packs.');
  expect(source.includes('CLEAN_CODEX_DESIGNER_AGENTS_MD'), 'Expected frontend designer overlays to install a clean Codex AGENTS.md.');
  expect(source.includes('RETROBUILDER_AGENT_BEHAVIOR_GUIDELINES'), 'Expected OMX runtime to inject shared behavioral guidelines into Codex materialization prompts.');
  expect(source.includes('RETROBUILDER_FRONTEND_PRODUCT_GUIDELINES'), 'Expected OMX runtime to inject frontend product guidelines into Codex worker prompts.');
  expect(source.includes('Do not call m1nd'), 'Expected OMX worker prompt to prevent broad m1nd exploration inside generated overlays.');
  expect(source.includes('Required artifacts inside'), 'Expected OMX worker prompt to require bounded module artifacts.');
  expect(source.includes('buildCleanCodexDesignerBrief'), 'Expected frontend visual direction to come from the clean Codex designer brief.');
    expect(source.includes('Use only the module files, local AGENTS.md'), 'Expected clean designer prompt to avoid orchestration workspace files.');
    expect(source.includes('Clean Codex Designer brief:'), 'Expected frontend worker prompt to include clean designer context.');
    expect(source.includes('selected 21st references'), 'Expected clean designer prompt to expose selected 21st references.');
    expect(source.includes('Do not inherit house-style defaults'), 'Expected clean designer prompt to prevent generated house-style drift.');
    expect(!source.includes('RETROBUILDER_VANGUARD_DESIGN_DIRECTIVE'), 'Expected OMX worker prompt not to inject the legacy vanguard directive into clean designer context.');
    expect(source.includes('stack translation'), 'Expected clean designer prompt to require stack translation of selected patterns.');
    expect(source.includes('Budget your work for roughly 90 seconds'), 'Expected clean designer prompt to force bounded patch behavior.');
    expect(source.includes('Do not launch dev servers, browsers, screenshots'), 'Expected clean designer prompt to avoid long-running validation surfaces.');
    expect(source.includes('Build the user-facing product'), 'Expected OMX worker prompt to reject module diagnostic pages as frontend output.');
    expect(source.includes('Never render raw JSON'), 'Expected OMX worker prompt to prevent visible raw JSON/debug UI.');
    expect(source.includes('polished mobile-first product surface'), 'Expected OMX worker prompt to require product-grade frontend output instead of minimal placeholder UI.');
    expect(source.includes('export renderApp(input)'), 'Expected OMX worker prompt to prefer a root-runtime-compatible frontend renderApp export.');
    expect(source.includes('product action primitives that the quality gate can detect'), 'Expected OMX worker prompt to require detectable product action primitives.');
    expect(source.includes('frontend quality bar'), 'Expected OMX worker prompt to define a frontend visual quality bar.');
  expect(source.includes('runFrontendMobileQualityGate'), 'Expected OMX runtime to run a mobile overflow quality gate before merging frontend modules.');
  expect(source.includes('390px'), 'Expected clean designer prompt to require a 390px mobile safety target.');
  expect(source.includes('overflow-wrap'), 'Expected OMX worker prompt to require long-content wrapping safeguards.');
  expect(source.includes('frontend mobile quality gate'), 'Expected OMX runtime failures to identify the frontend mobile quality gate.');
  expect(source.includes('Preserved failed worker workspace for inspection'), 'Expected OMX runtime to preserve failed worker workspaces for quality-gate autopsy.');
  expect(source.includes('isCodexTimeoutError'), 'Expected OMX runtime to classify Codex timeouts for fallback handling.');
  expect(source.includes("type: 'worker_fallback'"), 'Expected OMX runtime to emit worker_fallback events when Codex times out.');
  expect(source.includes('collectFileFingerprints'), 'Expected OMX runtime to fingerprint frontend artifacts around the clean designer pass.');
  expect(source.includes('Clean designer made no module artifact changes'), 'Expected OMX runtime to detect clean designer no-op completions.');
  expect(source.includes('Clean designer did not alter the renderable product surface'), 'Expected OMX runtime to continue transparently when the clean designer is a no-op.');
  expect(source.includes('Clean designer hit deadline after updating renderable artifacts'), 'Expected OMX runtime to distinguish captured designer patches from fallback baselines.');
  expect(source.includes('deterministic Retrobuilder module baseline'), 'Expected OMX runtime to continue with deterministic fallback materialization after timeout.');
  console.log('PASS omx runtime contract');
}

run();
