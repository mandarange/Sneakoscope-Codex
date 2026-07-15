# Codex Official Subagent Workflow

SKS execution work is coordinated through `$Naruto`. `$Work` is the single intended execution alias. The parent owns decomposition, write-scope separation, integration, verification, and the final answer; child threads receive bounded, non-overlapping slices and cannot delegate again.

## Current command surface

```bash
sks naruto run "implement and verify this change" --json
sks naruto run "review this release" --agents 3 --max-threads 3 --read-only --json
sks naruto status latest --json
sks naruto subagents latest --json
sks naruto proof latest --json
```

`--agents N` records an explicit requested thread count. `--max-threads N` bounds concurrent official Codex threads. The workflow keeps `agents.max_depth=1`, so decomposition and integration remain parent-owned.

## Evidence contract

Each mission keeps the official workflow evidence in `.sneakoscope/missions/<mission-id>/`:

- `subagent-plan.json` records the parent decomposition, requested thread budget, and disjoint ownership.
- `subagent-events.jsonl` records official lifecycle events.
- `subagent-parent-summary.json` binds child outcomes to the parent integration step.
- `subagent-evidence.json` validates requested/completed threads and lifecycle closure.
- `naruto-summary.json` records the integrated result and blockers.
- `naruto-gate.json` is the canonical workflow gate.
- `work-order-ledger.json` maps implementation and verification evidence back to the request.

Completion requires the requested official threads to reach a terminal state, their results to be integrated by the parent, scoped verification to run, and blockers to remain empty. Process counts, pane counts, synthetic fixture output, and unsupported speed claims are not accepted as official subagent proof.

## Model and risk routing

The parent assigns the smallest defensible child scope. Tiny mechanical work uses the lightweight profile, ordinary implementation uses the implementation profile, judgment-heavy review or release work uses the judgment profile, and long-context or direct visual-tool execution uses the tool-capable profile. Database, security, release, and ambiguous work remain fail-closed and parent-reviewed.

## Cleanup and continuity

The parent collects every requested result, closes completed official threads, refreshes bounded TriWiki context when findings change, validates mission artifacts, and reports what was and was not verified. Install and update cleanup of retired SKS-owned files is handled separately by the current-surface reconciliation flow described in [Managed Residue Cleanup](agent-cleanup-executor.md).
