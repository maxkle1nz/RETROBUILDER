#!/usr/bin/env tsx
import { createBridgeProvider } from '../src/server/providers/bridge.ts';
import { probeProviderHealth } from '../src/server/provider-runtime.ts';
import { resolveAuthProfile } from '../src/server/auth-profile-store.ts';

type BridgeLane = {
  profileId: string;
  expected: string;
  model?: string;
};

type BridgeLaneResult = {
  profileId: string;
  status: 'passed' | 'skipped';
  reason?: string;
};

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const LANES: BridgeLane[] = [
  { profileId: 'openai-codex:default', expected: 'codex-ok', model: 'gpt-5.5' },
  { profileId: 'github-copilot:github', expected: 'copilot-ok', model: 'github-copilot/gpt-5.4' },
];

function liveProfilesRequired() {
  return process.env.BRIDGE_REQUIRE_LIVE_PROFILES === '1';
}

async function runLane({ profileId, expected, model }: BridgeLane): Promise<BridgeLaneResult> {
  const profile = await resolveAuthProfile(profileId);
  if (!profile) {
    const reason = `missing auth profile ${profileId}`;
    console.log(`SKIP bridge dual-lane smoke: ${reason}`);
    return { profileId, status: 'skipped', reason };
  }

  process.env.THEBRIDGE_AUTH_PROFILE = profileId;
  const health = await probeProviderHealth('bridge');
  expect(health.status === 'ready', `Expected bridge health ready for ${profileId}, got ${health.status}`);

  const provider = createBridgeProvider();
  const content = await provider.chatCompletion(
    [{ role: 'user', content: `Reply with exactly: ${expected}` }],
    {
      authProfile: profileId,
      model,
      maxTokens: 32,
      temperature: 0,
    },
  );

  expect(content.trim() === expected, `Expected ${profileId} completion "${expected}", got "${content.trim()}"`);
  console.log(`PASS bridge lane ${profileId} -> ${content.trim()}`);
  return { profileId, status: 'passed' };
}

async function run() {
  const results: BridgeLaneResult[] = [];
  for (const lane of LANES) {
    results.push(await runLane(lane));
  }

  const skipped = results.filter((result) => result.status === 'skipped');
  if (skipped.length > 0 && liveProfilesRequired()) {
    throw new Error(
      [
        `FAIL bridge dual-lane live smoke: ${skipped.map((result) => result.profileId).join(', ')} not available.`,
        'Configure OPENCLAW_AUTH_PROFILES_PATH to an auth-profiles.json file containing the required OpenClaw profiles,',
        'or unset BRIDGE_REQUIRE_LIVE_PROFILES for the default non-credentialed provider smoke.',
      ].join(' '),
    );
  }

  const passed = results.length - skipped.length;
  if (skipped.length > 0) {
    console.log(
      `PASS bridge dual-lane smoke with ${passed}/${LANES.length} live lanes exercised; skipped ${skipped.length}. ` +
        'Set BRIDGE_REQUIRE_LIVE_PROFILES=1 to require real profile-backed completions.',
    );
  } else {
    console.log('PASS bridge dual-lane smoke');
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
