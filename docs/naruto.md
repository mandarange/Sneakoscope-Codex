# $Naruto — Massive Parallel Work Swarm

`$Naruto` is SKS's hardware-safe massive parallel work mode. It is not a validation-only
route. A Naruto run decomposes the user goal into a mixed work graph and keeps a safe
active pool full while workers implement, modify, generate tests, verify, research,
document, resolve conflicts, prepare rollback metadata, support integration, and build
the GPT final arbiter input pack.

The standard native-agent ceiling remains 20 for ordinary routes. `$Naruto` can plan up
to 100 total clone generations for this route, while active workers are capped by live
hardware and policy signals.

## Usage

```bash
sks naruto run "implement this addendum" --clones 100
sks naruto run "demo" --clones 24 --backend fake --work-items 24 --json
sks naruto status
```

Aliases: `$ShadowClone`, `$Kagebunshin`, and the CLI flag form `sks --naruto`.

## Core Contract

`$Naruto mode: launching hardware-safe massive parallel work swarm.`

Clones may implement, modify, verify, test, research, document, and resolve conflicts
according to lease and role policy. Write-capable clone output is accepted only through
patch envelopes, the verification DAG, mutation guard, and GPT final arbiter review.

## Work Graph

Naruto creates `naruto-work-graph.json` under the mission's `agents/` directory. The graph
contains mixed work kinds:

- `implementation`
- `code_modification`
- `refactor`
- `test_generation`
- `test_execution`
- `verification`
- `research`
- `documentation`
- `ux_review`
- `ppt_review`
- `image_review`
- `conflict_resolution`
- `patch_rebase`
- `rollback_preparation`
- `integration_support`
- `final_review_input_pack`

When the route is write-capable, the graph must include `write_allowed=true` work items.
Each write item carries write leases and acceptance rules requiring a patch envelope,
verification, and GPT final review. Active waves are planned so two workers in the same
wave do not hold overlapping write leases.

## Role Distribution

Naruto writes `naruto-role-distribution.json` and the status output includes the same
distribution. Default write-capable Naruto runs include implementation-like workers:

- `implementer`
- `modifier`
- `test_writer`
- `conflict_resolver`
- `rollback_planner`
- `integrator`
- `verifier`
- `researcher`
- `gpt_final_arbiter`

Verifier-only distribution is valid only for `--readonly` or an explicit verification
route. Default write-capable Naruto keeps at least 40% implementation/modification/test
style roles.

## Hardware-Safe Governor

`naruto-concurrency-governor.json` records the live decision:

- requested clone count
- total work item count
- safe active workers
- safe visible Zellij panes
- headless workers
- local LLM parallel request cap
- remote Codex/API parallel budget
- verification parallel cap
- backpressure state and reasons

The governor considers CPU load, free memory, Node heap, process count, file descriptor
budget, Zellij pane count, terminal size, local LLM max parallel requests, remote API
budget, GPU/VRAM hints, disk IO pressure, pending queue size, and active lease conflicts.

## Dynamic Active Pool

`naruto-active-pool.json` proves the scheduler refills active slots while runnable work
remains. When a worker completes, the parent ingests the result, validates patch
envelopes, enqueues verification/follow-up work, and backfills the slot. Failed work is
bounded by retry policy or converted into conflict-resolution work.

## Parallel Patch Apply

Write-capable workers produce patch envelopes. Patch envelopes include lease id, work
item id, generation id, target files, before/after hashes, and rollback data.
Non-overlapping patch envelopes are grouped into parallel transaction batches. Overlaps
serialize or route to conflict resolution. Failed batches roll back only the affected
batch.

## Parallel Verification

`naruto-verification-dag.json` expands candidate work into verification shards such as
typecheck, unit test, route gate, static scan, schema validation, patch-specific test,
docs/changelog check, side-effect check, mutation ledger check, Zellij proof check, and
local LLM structured output checks. Verification can start as soon as its dependencies
are ready and uses a separate safe concurrency cap.

## Zellij UI

Naruto does not create hundreds of panes. `naruto-zellij-dashboard.json` plans visible
active worker panes up to the UI cap and tracks remaining active workers as headless.
Pane titles include slot, generation, role, backend, and status.

## GPT Final Arbiter

Local worker output is a draft. `naruto-gpt-final-pack.json` compresses the work graph,
role distribution, changed files, patch envelopes, verification results, failed shards,
conflict map, rollback plan, side-effect report, local LLM metrics, and representative
logs. Secrets are redacted. Final accepted output comes only from deterministic no-local
finalization or the GPT final arbiter.

## Placeholder Guard

Write-capable Naruto blocks before work graph creation when unresolved placeholders are
present, including `@filename`, `<file>`, `TODO_PATH`, `INSERT_PATH_HERE`, `/path/to/file`,
or empty target paths.

## Release Gates

```bash
npm run naruto:work-graph
npm run naruto:concurrency-governor
npm run naruto:active-pool
npm run naruto:role-distribution
npm run naruto:parallel-patch-apply
npm run naruto:verification-pool
npm run naruto:zellij-massive-ui
npm run naruto:gpt-final-pack
npm run prompt:placeholder-guard
npm run local-collab:gpt-final-arbiter
npm run local-collab:no-local-only-final
npm run release:check
```

Optional real checks:

```bash
SKS_REQUIRE_ZELLIJ=1 npm run naruto:zellij-massive-ui -- --require-real
SKS_REQUIRE_LOCAL_LLM=1 SKS_REQUIRE_GPT_FINAL=1 npm run naruto:real-local-gpt-final-smoke
```
