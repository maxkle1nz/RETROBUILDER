# Provider SSOT

## Purpose

`RETROBUILDER` treats provider routing as a system contract, not a UI hint.

The selected provider must determine:
- which runtime is used
- which auth profile is active
- which model inventory is shown
- which transport path is used for completions

## Current Contract

### 1. Selection

The active provider is enforced in strict mode by default.

- `AI_STRICT_PROVIDER_MODE=1` or unset:
  - selected provider is authoritative
  - no silent fallback across providers
- `AI_STRICT_PROVIDER_MODE=0`:
  - legacy fallback chain is allowed

### 2. Bridge bootstrap

The bridge runtime is resolved by `src/server/bridge-bootstrap.ts`.

Resolution order:
1. Explicit `THEBRIDGE_COMMAND`, when configured
2. Writable local OpenAI-compatible `thebridge` runtime, when built under the operator account
3. Donor standalone bridge runtime from `THEBRIDGE_DONOR_ROOT` or the operator-local `~/.local/src/the-bridge`

Runtime diagnostics exposed to the app:
- `baseUrl`
- `command`
- `installed`
- `autoStart`
- `autoStarted`
- `healthy`
- `protocol`
- `source`
- `authProfile`
- `authProfileProvider`

### 3. Auth profile contract

Bridge auth profiles are discovered from local OpenClaw auth stores.

Supported bridge-facing profile families:
- `openai-codex`
- `github-copilot`

Profile discovery order:
1. `OPENCLAW_AUTH_PROFILES_PATH`
2. `OPENCLAW_AUTH_PROFILES`
3. `~/.openclaw/agents/main/agent/auth-profiles.json`

The selected auth profile changes:
- model inventory
- default model
- completion transport path

### 4. Completion lanes

#### `openai-codex`

Uses the OpenAI-compatible THE BRIDGE runtime when available, with standalone donor `/responses` retained as fallback.

Server-triggered local Codex JSON fallback is disabled by default. It only runs when `RETROBUILDER_ENABLE_LOCAL_CODEX_FALLBACK=1` is set in a trusted local environment, and the fallback no longer depends on the sandbox-bypass CLI flag.

Verified working:
- local Codex auth without OpenClaw profile
- model: `gpt-5.5`

Expected verification response:
- `bridge-local-ok`

#### `github-copilot`

Uses direct GitHub Copilot inventory + completion wiring.

Inventory:
- `GET https://api.individual.githubcopilot.com/models`

Completion:
1. try `POST https://api.individual.githubcopilot.com/responses`
2. fallback to `POST https://api.individual.githubcopilot.com/chat/completions`

Required Copilot headers:
- `Authorization: Bearer <token>`
- `Content-Type: application/json`
- `Editor-Version: vscode/1.99.0`
- `Copilot-Integration-Id: vscode-chat`

Verified working:
- profile: `github-copilot:github`
- model: `github-copilot/gpt-5.4`

Expected verification response:
- `copilot-ok`

## Default-model rule

Bridge defaults are profile-aware:

- `openai-codex` -> `gpt-5.5`
- `github-copilot` -> `github-copilot/gpt-5.4`

The `/api/ai/models` route must return a `defaultModel` that actually exists in the returned model list.

## Current verified state

Verified runtime outcomes:
- `bridge` companion auto-start/reuse is contract- and smoke-tested
- `/api/ai` provider/model/warmup routes are protected by the local API guard when `RETROBUILDER_LOCAL_API_TOKEN` is configured; non-loopback Retrobuilder binds require that token at startup
- runtime health reports `defaultModel: gpt-5.5`
- `/api/ai/providers` exposes companion runtime diagnostics
- `/api/ai/models` resolves the Codex default to `openai-codex/gpt-5.5`
- local Codex live completion through THE BRIDGE is verified by `npm run verify:providers:codex-live`

Profile-backed live completion outcomes require local OpenClaw profiles:
- `bridge` + `openai-codex:default` -> `ready` -> `codex-ok`
- `bridge` + `github-copilot:github` -> `ready` -> `copilot-ok`

The default provider smoke reports missing local profiles as explicit skips so the local runtime can still be verified without sharing credentials. The local Codex live verification is:

```bash
npm run verify:providers:codex-live
```

The strict profile-backed live verification is:

```bash
BRIDGE_REQUIRE_LIVE_PROFILES=1 npm run verify:providers
# or
npm run verify:providers:live
```

## Smoke verification

Manual repeatable smoke:

```bash
npm run verify:providers
```

Expected default outcome:
- bridge runtime is installed/reachable or auto-startable
- missing local auth profiles are reported as explicit skips
- `/api/ai/models` resolves profile-aware defaults
- `/api/ai/providers` reflects the active auth profile and donor standalone runtime
- `/api/ai/warmup` echoes provider + authProfile + model correctly
- provider config UI renders the bridge card and auth profile selector

Expected local Codex live outcome:
- THE BRIDGE completes a real local Codex `gpt-5.5` request containing `bridge-local-ok`

Expected strict live outcome:
- both bridge-backed auth profiles resolve `ready`
- `openai-codex` returns `codex-ok`
- `github-copilot` returns `copilot-ok`

## Remaining scope

Provider SSOT is now exercised in runtime for:
- xAI
- Gemini
- OpenAI direct
- THE BRIDGE with `openai-codex`
- THE BRIDGE with `github-copilot`

The remaining work is not provider wiring.

Remaining work:
- broader E2E coverage
- provider UI refinement
- final generated-system verification
