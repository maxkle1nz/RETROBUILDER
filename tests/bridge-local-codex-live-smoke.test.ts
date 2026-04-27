#!/usr/bin/env tsx
import { createBridgeProvider } from '../src/server/providers/bridge.ts';

const EXPECTED_MARKER = 'bridge-local-ok';
const BRIDGE_FALLBACK_MARKERS = [
  'resilient fallback summary',
  'codex execution was unavailable',
];

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function run() {
  const originalAuthProfile = process.env.THEBRIDGE_AUTH_PROFILE;

  try {
    delete process.env.THEBRIDGE_AUTH_PROFILE;

    const provider = createBridgeProvider();
    const model = process.env.THEBRIDGE_CODEX_LIVE_MODEL || process.env.THEBRIDGE_MODEL || 'gpt-5.5';
    const content = await provider.chatCompletion(
      [
        {
          role: 'user',
          content: `Reply with the marker ${EXPECTED_MARKER} somewhere in your answer.`,
        },
      ],
      {
        model,
        maxTokens: 64,
        temperature: 0,
      },
    );

    expect(
      content.toLowerCase().includes(EXPECTED_MARKER),
      `Expected local Codex bridge completion to include "${EXPECTED_MARKER}", got "${content.trim()}"`,
    );
    expect(
      !BRIDGE_FALLBACK_MARKERS.some((marker) => content.toLowerCase().includes(marker)),
      `Expected a real local Codex bridge completion, but THE BRIDGE returned fallback text: "${content.trim()}"`,
    );

    console.log(`PASS bridge local Codex live smoke (${model}) -> ${content.trim()}`);
  } finally {
    if (originalAuthProfile === undefined) {
      delete process.env.THEBRIDGE_AUTH_PROFILE;
    } else {
      process.env.THEBRIDGE_AUTH_PROFILE = originalAuthProfile;
    }
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
