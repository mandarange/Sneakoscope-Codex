# Patch Swarm Runtime

SKS 1.18.9 treats patch swarm as a first-class native agent mission phase. After the scheduler drains, the orchestrator enters `AGENT_PATCH_SWARM_RUNNING`, extracts every agent `patch_envelopes` field, enqueues each envelope into the persistent queue, coordinates merge/apply order, and blocks final proof on patch proof failures.

The runtime chain is:

1. Agent result emits `patch_envelopes` with agent/session/slot/generation metadata, a lease id or lease proof, operations, optional rationale, verification hints, and rollback hints.
2. `agent-patch-queue.json` is the mission-local queue snapshot, with append-only transition events in `agent-patch-queue-events.jsonl`.
3. `agent-merge-coordinator-report.json` groups disjoint patches into `parallel_apply_groups` and blocks path, subtree, domain, protected-path, and lease conflicts.
4. Disjoint queue entries are applied with `Promise.all` through the patch apply worker, which records before/after hashes, changed files, latency, verification hints, and rollback digests.
5. Verification rows are written to `agent-patch-verification-results.json`.
6. Rollback dry-run evidence is written to `agent-patch-rollback-proof.json`.
7. `agent-patch-proof.json` and `agent-proof-evidence.json` must agree before the route can pass.

The route blackboxes for 1.18.9 create ten independent files, run five fake/process-style agents with ten work items, request `--write-mode parallel --apply-patches`, and assert that ten envelopes enter the queue and at least five independent entries appear in the first parallel apply wave.
