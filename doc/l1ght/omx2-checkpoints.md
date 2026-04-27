# OMX 2 Checkpoints

Protocol: L1GHT/0.5
Status: active implementation
Owner: OMX 2 program

## Checkpoint 1 — Truth hardening

Required:
- task completion gated by verify
- stderr/stdout no longer masquerading as `currentFile`
- builder operational actions durable in ledger
- resume still works

Exit signals:
- no node is marked complete without verify receipt
- build history rehydrates from typed events
- builder surfaces wave/task/worker summaries

## Checkpoint 2 — Ownership enforcement

Required:
- ownership manifest persisted in execution graph
- task writes checked against `writeSet`
- merge rejects out-of-lease artifacts

Exit signals:
- ownership violation becomes merge rejection or task failure
- no worker can silently write outside module scope

## Checkpoint 3 — Wave scheduler

Required:
- execution graph compiled before build start
- waves visible in runtime and UI
- active wave/task summaries exposed in status

Exit signals:
- build plan shown in export matches runtime execution shape
- history clearly shows wave boundaries

## Checkpoint 4 — Parallel worker fleet

Required:
- `workerCount > 1`
- parallel tasks only when write sets are disjoint
- shared-file lanes or owners introduced

Exit signals:
- throughput improves without edit collisions
- conflicts are surfaced as controlled merge outcomes

Current note:
- the runtime now supports multi-worker execution inside the same wave for disjoint module write sets
- shared-artifact owner lanes now exist
- shared-file concurrency is now controlled: concurrent production is allowed, but promotion to truth still flows through owner lanes
- failed merge lanes can now be retried from the builder surface without changing build identity
- failed shared-owner merges can now be reassigned to the current task from the builder surface
- root composition layer generation is now part of OMX output for future builds

## Checkpoint 5 — Full certification

Required:
- final system verify
- browser smoke for multiwave execution
- resume from interrupted wave
- merge/verify failures visible in builder UI

Exit signals:
- build succeeds only with final verify truth
- interrupted build resumes from ledger truth, not guessed state
