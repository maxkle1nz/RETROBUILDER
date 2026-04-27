# OMX 2 Scheduler & Ownership

Protocol: L1GHT/0.5
Status: active implementation
Owner: OMX scheduler

## Execution graph

Each blueprint node compiles into one `ExecutionTask` in V1.

Task fields:
- `taskId`
- `nodeId`
- `waveId`
- `dependsOnTaskIds`
- `priority`
- `readSet`
- `writeSet`
- `sharedArtifacts`
- `verifyCommand`
- `completionGate`
- `estimatedCost`
- `status`

## Wave formation rules

1. A task enters a wave only if all `dependsOnTaskIds` are already verified/merged upstream.
2. Tasks in the same wave must have disjoint `writeSet`s.
3. Shared artifacts force a later merge lane or a different wave.
4. Within a wave, sort by:
   - `priority asc`
   - `estimatedCost desc`

## Ownership rules

### Default ownership classes
- `exclusive`
- `shared-owner`
- `merge-only`
- `system`
- `forbidden`

### Current inference
- `modules/<slug>/**` -> `exclusive`
- `.omx/**` -> `system`
- `README.md` -> `system`
- `frontend` tasks infer shared owner lanes for:
  - `app/**`
  - `components/**`
  - `package.json`

## Read/write set defaults

### Read set
- `.omx/**`
- upstream module paths from dependencies

### Write set
- `modules/<slug>/**`

### Shared artifacts
- frontend tasks may also own root shared artifacts, but only sequentially
- if two ready tasks infer the same shared artifact pattern, the scheduler must put them in different waves

## Current limitations

The current scheduler slice is intentionally conservative:
- one task per node
- one active worker by default
- shared-artifact owners exist, but shared-file concurrency is still blocked by wave partitioning
- no fine-grained intra-module split yet

## Checkpoint criteria

This subsystem is considered healthy when:
1. execution graph compiles deterministically for the same blueprint
2. tasks have stable wave assignment
3. ownership checks reject writes outside the lease
4. resumable builds preserve task status truth across reentry
