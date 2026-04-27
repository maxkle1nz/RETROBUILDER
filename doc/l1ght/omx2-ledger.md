# OMX 2 Ledger

Protocol: L1GHT/0.5
Status: active implementation
Owner: OMX ledger

## Purpose

The ledger is the source of record for runtime state.

It supersedes the previous event-log layer by storing typed execution events that can rebuild:
- build history
- wave/task/worker state
- verify receipts
- merge receipts
- operational builder actions
- resume context

## Required event families

### Build
- `build_start`
- `build_compiled`
- `build_complete`
- `build_terminal`
- `resume_rehydrated`

### Wave
- `wave_started`

### Task / worker
- `task_leased`
- `worker_started`
- `artifact_progress`
- `worker_log`
- `warning`
- `task_completed`

### Verify
- `verify_started`
- `verify_passed`
- `verify_failed`

### Merge
- `merge_started`
- `merge_passed`
- `merge_rejected`

### Builder operations
- `operational_message`

## Ledger laws

1. UI reentry must be reconstructible from ledger history.
2. Builder operations that change runtime state must be written to the ledger.
3. Resume availability is derived from persisted runtime state, not local chat state.
4. Verify and merge receipts must survive page reload and process restart.

## Current implementation

Current code coverage:
- the ledger persists to `omx-ledger.ndjson`
- `/api/omx/history/:sessionId` projects ledger payloads back into builder history
- resume operations from chat/button now create durable operational entries

## Current limitation

Freeform builder chat remains local UI state.
Only operational messages that change runtime state are durable right now.
