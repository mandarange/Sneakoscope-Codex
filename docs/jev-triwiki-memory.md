# Jev Fast Path and TriWiki memory contract

This document describes the implementation at baseline `ce6203869b83fd729be08cfb2f74ec2c632c41ba` (package `10.5.6`). Jev remains optional and the default is deterministic SKS behavior.

## Boundaries

`UserPromptSubmit` performs a local eligibility check and, for an eligible Jev turn, makes one `consultJevOptions` request. The bundle combines route, parallelism, bounded context, QA depth, image need, execution profile, and, only with an explicit mission and memory cue, memory disposition. Jev returns fixed IDs with the existing probability and confidence checks. It cannot return text to persist, a path, TTL, trust score, coordinate, bbox, relation, worker count, or stage ID.

`src/core/pipeline-internals/pipeline-stage-builder.ts` owns the finite stage manifest and `compileExecutionProfile`. The compiler rechecks policy, consent, source and graph freshness, permission, mutation risk, and parallel eligibility. It calculates required, optional, skipped, reinstated, and bounded parallel stages and emits `sks.jev-execution-plan.v1`. `observe` records the proposed profile while running the baseline; only `optimize` permits an eligible bounded skip. Mutation, publish, align, destructive work, stale evidence, or failed preconditions return to `deep_verify` or `baseline`.

The existing LRU and route cache owners hold only digest-bound compiled plans. A key includes workflow/turn, source, graph, candidate, stage-manifest, configuration, and policy digests. The cache is bounded and single-flight; a changed digest never reuses an old decision. A missing source or graph digest is never treated as fresh.

## Memory dispositions and precedence

The fixed IDs are `ephemeral_turn`, `mission_memory`, `durable_preference`, `durable_policy`, `visual_evidence`, `negative_evidence`, `sensitive_no_store`, `needs_confirmation`, and `keep_baseline`. `memoryDispositionPolicy` applies this order:

1. explicit forget/delete suppresses the candidate and wins over Jev; a canonical tombstone is an explicit operator action;
2. secrets, credentials, sensitive PII, or failed redaction are never sent or stored;
3. explicit remember/pin/always/never can create a durable candidate but cannot be downgraded by Jev;
4. verified negative or visual evidence follows the existing wrongness or image publisher;
5. a confident fixed Jev choice is considered only with a fresh source/graph binding and an explicit mission;
6. every other case keeps the baseline.

TTL, scope, lifecycle, evidence validity, and promotion are code-owned. `mission_memory` is mission-scoped and never becomes a project canonical shard. `durable_policy` requires evidence. User scope stays disabled unless the operator enables it. `memory-governor.ts` keeps memory overlay lifecycle separate from the code claim sweep. `sweepMemoryOverlay` only reports suppression candidates; physical GC remains behind the existing retention authority.

## Staged intake

`src/core/memory/jev-memory-intake.ts` is the only new runtime writer. It writes an array at the ignored mission path `.sneakoscope/missions/<mission>/jev-memory-intake.json` under the existing file lock and atomic JSON writer. The envelope is `sks.jev-memory-intake.v1` and includes workflow/turn/candidate/idempotency hashes, a redacted bounded candidate, source and graph digests, evidence paths and hashes, image voxel references, lifecycle, policy revision, and promotion status. It rejects traversal, symlinks, secrets, oversize entries, invalid hashes, invalid evidence, and duplicate idempotency keys. A prompt hook writes only this staged envelope; it never writes `context-pack.json`, the context graph, or a canonical shard.

A mission is mandatory for a durable, visual, or negative candidate. Missing mission, Jev off, no consent, stale binding, or failed redaction is a no-op or confirmation path. The staged text is the explicit bounded candidate, not the raw prompt, tool output, image bytes, credential, or session identifier.

## Canonical promotion and retrieval

`promoteJevMemoryIntake` in `shared-memory-publish.ts` is an explicit coordinator operation and is enabled only by `memoryPromotion=true` plus `executionPolicy=optimize`. It revalidates intake schema, exact source/graph provenance, evidence bytes, policy/security, lifecycle, scope, and image references before writing an existing canonical record with memory metadata. Durable preferences become claim records. Visual candidates require an actual validated ledger file, hash/dimensions/bbox/relation checks, and an anchor backlink to the promoted claim. Negative candidates require a real wrongness or failed validation/regression artifact and produce the existing wrongness/avoidance pair. Mock, static, synthetic, stale, secret-bearing, tombstoned, or unbound evidence is rejected. Indexes and the existing memory summaries are rebuilt only after all records validate; a write or rebuild failure restores the prior bytes and intake status.

`writeJevMemoryTombstone` writes a validated suppression record only when the target canonical memory ID and previous digest match. Retrieval excludes tombstoned IDs immediately and physical deletion is not implied.

`readSharedMemoryOverlay(root, opts)` is the only canonical reader. It reads validated records under `records`, `wrongness`, `image-voxels`, `avoidance-rules`, and `summaries`, checks confined paths and file budgets, rejects missing provenance/trust, applies tombstones, and delegates lifecycle, scope, sensitivity, TTL, top-k, and token filtering to `memory-governor.ts`. Defaults are top-k 8, high-risk top-k 16, and 6000 tokens. Each item carries `memory_id`, source, evidence and source digests, lifecycle, freshness, effective trust, evidence references, and a deterministic wiki coordinate/voxel projection from the existing RGBA hash functions. If source or graph is unavailable, the reader returns `available=false` with `source_or_graph_unavailable`; it never hydrates stale data. Corrupt canonical input returns an explicit unavailable result. It never scans the code graph, uses a vector index, calls a reranker, or makes a fallback model call.

Memory overlay output is a separate provenance section. Code-only context graph attention remains owned by the existing TriWiki attention modules.

## Align and image preservation

Align uses preservation strategy A. The generated wiki surface is swapped transactionally, while canonical `records`, `wrongness`, `image-voxels`, `avoidance-rules`, `summaries`, and project policy are copied byte-for-byte into the staged generation under the TriWiki lock. Canonical hashes are recorded in the align ledger and verified before promotion. Stale staging recovery restores every previous generated surface before cleanup. A corrupt, secret-bearing, symlinked, or oversized canonical record fails the align transaction and leaves the prior generation available.

Global and mission image ledgers are separate. Every mission write performs locked read-merge-write; explicit `promoteMissionImageVoxelLedger` is the only merge into global. Actual image files are confined to the repository, hashes and dimensions are rechecked, stale anchors and invalid bounding boxes block validation, and the writer and validator share `imageRelationDedupeKey`.

## Main/child orchestration

The existing runtime owner exposes typed task states, mission and handoff envelopes, stable `task_key`, lease and fencing helpers, authority snapshots, capability intersection, and transition validation. An active task attaches instead of spawning a duplicate. Expired leases create a new attempt and fence late results. Child output is a typed handoff with changed paths, artifact/diff digests, tests, schema/secret/static validation, conflicts, and next action. Only the main coordinator can apply, publish, align, or seal; read-only groups may be bounded in parallel.

Sibling discussion is a typed event-ledger extension: messages carry plan/task correlation, sender/recipient, digest-only body, artifact references, TTL, `reply_to`, one hop, bounded count/bytes, and capability checks. Cross-plan, unauthorized, expired, secret-bearing, action-bearing, or duplicate messages are rejected. A child cannot spawn another child or grant a capability; extra work is decomposed by main only.

## Rollout and rollback

Use `sks decision enable --provider openrouter --model typesafe/jev-1.13 --consent-cloud` to opt in. Add `--execution-policy observe` for shadow measurement or `--execution-policy optimize --profiles <ids>` after the profile has passed the measured gate. Memory intake and promotion require their explicit flags. Default/off mode makes zero Jev requests and zero automatic intake/canonical writes. Disable with `sks decision disable`; this resets execution policy and memory capabilities without deleting canonical records. Existing canonical shards remain available for rollback and can be revalidated or rebuilt with the existing wiki/shared-memory commands.

## Verification

The current required checks pass: `npm run typecheck`, `npm run build:clean`, `npm run architecture:check`, `npm run schema:check`, `npm run runtime:no-src-mjs`, `npm run runtime:ts-source-of-truth`, `npm run test:release` (198/198), retention/rollback smokes, and migration safety. The new focused suites pass 10/10; image/shared-memory and voxel suites pass 9/9. Affected and fast release DAGs each pass 14/16 with the installed-version probe blocked by this environment. The exhaustive runner has 3,868/3,926 passes, 46 platform skips, and 12 unrelated process/permission/signal/doctor fixture failures. Named shared-memory/context-graph scripts from the work order are not present in `package.json`, so their available compiled contracts and existing gates were used instead. Live OpenRouter performance and quality are not inferred from mocks; rollout metrics must record round trips, cache hits, planned/executed/skipped stages, latency, token budget, fallback rate, promotion outcomes, retrieval availability, and correction/tombstone rate without raw prompt or transcript data.
