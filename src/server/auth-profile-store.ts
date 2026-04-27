import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import * as path from 'node:path';

export interface AuthProfileInfo {
  id: string;
  provider: string;
  type: 'token' | 'oauth' | 'unknown';
  accountId?: string;
  source: 'openclaw';
}

export interface RawAuthProfileInfo {
  id: string;
  provider: string;
  type: 'token' | 'oauth' | 'unknown';
  accountId?: string;
  token?: string;
}

const OPENCLAW_AUTH_PROFILES_RELATIVE = '.openclaw/agents/main/agent/auth-profiles.json';

function getAuthProfileCandidatePaths() {
  return [
    process.env.OPENCLAW_AUTH_PROFILES_PATH?.trim(),
    process.env.OPENCLAW_AUTH_PROFILES?.trim(),
    path.join(homedir(), OPENCLAW_AUTH_PROFILES_RELATIVE),
  ].filter((candidate, index, candidates): candidate is string =>
    Boolean(candidate) && candidates.indexOf(candidate) === index,
  );
}

async function readAuthProfilesJson() {
  for (const candidatePath of getAuthProfileCandidatePaths()) {
    try {
      return await readFile(candidatePath, 'utf8');
    } catch {
      // Try the next candidate so imported workspaces are not pinned to one OS user.
    }
  }
  return null;
}

export async function loadAuthProfiles(): Promise<AuthProfileInfo[]> {
  try {
    const raw = await readAuthProfilesJson();
    if (!raw) return [];
    const parsed = JSON.parse(raw) as {
      profiles?: Record<string, { provider?: string; type?: string; accountId?: string }>;
    };
    const profiles = parsed.profiles || {};
    return Object.entries(profiles).map(([id, value]) => ({
      id,
      provider: value.provider || 'unknown',
      type: value.type === 'oauth' || value.type === 'token' ? value.type : 'unknown',
      accountId: value.accountId,
      source: 'openclaw',
    }));
  } catch {
    return [];
  }
}

export async function loadAuthProfilesByProvider(provider: string): Promise<AuthProfileInfo[]> {
  const profiles = await loadAuthProfiles();
  if (provider === 'bridge') {
    return profiles.filter((profile) => ['github-copilot', 'openai-codex'].includes(profile.provider));
  }
  return profiles.filter((profile) => profile.provider === provider);
}

export async function resolveAuthProfile(profileId?: string | null): Promise<AuthProfileInfo | null> {
  const normalized = profileId?.trim();
  if (!normalized) return null;
  const profiles = await loadAuthProfiles();
  return profiles.find((profile) => profile.id === normalized) || null;
}

export async function resolveRawAuthProfile(profileId?: string | null): Promise<RawAuthProfileInfo | null> {
  const normalized = profileId?.trim();
  if (!normalized) return null;
  try {
    const raw = await readAuthProfilesJson();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      profiles?: Record<string, { provider?: string; type?: string; accountId?: string; token?: string }>;
    };
    const value = parsed.profiles?.[normalized];
    if (!value) return null;
    return {
      id: normalized,
      provider: value.provider || 'unknown',
      type: value.type === 'oauth' || value.type === 'token' ? value.type : 'unknown',
      accountId: value.accountId,
      token: value.token,
    };
  } catch {
    return null;
  }
}
