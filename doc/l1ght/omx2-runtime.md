# OMX 2 Runtime

Protocol: L1GHT/0.5
Status: active implementation
Owner: OMX runtime

## Purpose

OMX 2 moves the live build runtime from a serial node loop to an agent-native substrate with:
- execution graph compilation
- wave-aware scheduling
- explicit file ownership
- durable execution ledger
- verify-before-complete enforcement
- resumable builder operations grounded in runtime facts

This document defines the runtime model for OMX 2.

## Core laws

1. A task is never `complete` merely because a worker stopped writing.
2. A task is only complete after:
   - worker execution finished
   - verify passed
   - merge applied
3. A node is only complete when all tasks for that node are merged.
4. A build is only succeeded when:
   - all tasks are merged
   - final system verify passed
   - the SPECULAR gate is still passed
5. No worker can write outside its `writeSet`.
6. Shared files require an owner or merge lane.
7. Resume always rehydrates from the ledger, never from UI heuristics alone.

## Runtime components

### Compiler
Compiles `session.graph` into an `execution graph`.

### Scheduler
Builds deterministic waves from the execution graph.

### Ownership engine
Maps task write authority to path patterns.

### Worker runtime
Executes one task in an isolated overlay workspace.

### Verifier
Runs the task verify command or structural fallback before merge.

### Merger
Promotes only ownership-safe artifacts into the workspace source of record.

### Ledger
Persists runtime events, operational actions, verify receipts, merge receipts, and resume context.

## Current implementation slice

Current code coverage:
- execution graph compilation
- ownership manifest derivation
- worker overlay preparation
- verify-before-complete
- merge receipts for exclusive module promotion
- durable operational messages for builder resume flow
- wave/task/worker projections in BU1LDER
- parallel task execution inside a wave for disjoint module write sets
- shared-artifact owner lanes for tasks that are allowed to promote root app/component artifacts
- merge rejection surfacing in BU1LDER
- task retry for failed merge/failed task states on the same build/workspace
- initial owner-arbitration flow via \"take ownership & retry\" for rejected shared-owner paths
- controlled shared-file concurrency: tasks with disjoint module write sets may execute in the same wave even when their shared artifact lanes overlap
- root composition generation for future builds: root package/workspace manifest plus workspace verify script
- richer root composition generation for future builds: root package/workspace manifest, workspace verify script, workspace dev/build/start wrappers, `.env.example`, and root quickstart README
- generated root smoke command is now covered by a runtime contract test, so the workspace-level `npm run smoke` path is validated as an executable wrapper, not just a string contract
- generated root composition now selects a primary runnable module even for backend-only graphs, not only for frontend-first graphs
- final system verify now runs as an ordered root gate when scripts exist:
  - `npm run verify` or `npm run test`
  - `npm run build`
  - `npm run smoke`
  instead of accepting the first successful root command as sufficient verification
- module packaging baseline now upgrades likely frontend modules with minimal `next dev/build/start` scripts, core runtime dependencies, `next.config.mjs`, and a minimal `/api/health` route when the generator omitted them
- generated workspace readiness now has an aggregate repo gate:
  - `npm run verify:generated-workspace`

## Deferred for later OMX 2 slices

Not yet covered in this slice:
- simultaneous promotion of the same shared path by multiple tasks without arbitration
- final system-wide verify command
- automatic task splitting inside a single module
- conflict-resolution UI for merge rejections
