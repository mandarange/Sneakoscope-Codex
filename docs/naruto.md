# $Naruto — Codex Official Subagent Workflow

`$Naruto` is the SKS alias for a Codex official subagent workflow. The default
path no longer treats a custom child-process swarm, PID count, Zellij panes, or
a custom active pool as proof that subagents ran.

## Usage

```bash
sks naruto run "implement this addendum"
sks naruto run "review twenty packages" --agents 20 --max-threads 12
sks naruto status latest
sks naruto subagents latest
sks naruto proof latest
```

`--agents` is the canonical requested-subagent flag. `--clones` remains a
deprecated compatibility alias and emits one warning. Likewise, `workers` is a
deprecated alias for `subagents`.

`$ShadowClone`, `$Kagebunshin`, `$Work`, and `$Swarm` remain compatibility
aliases for the same official workflow. `$Work` is recognized only when the
dollar command is explicit; a sentence such as “work on the parser” is routed
from its actual task intent instead of being treated as an alias invocation.

The run parser accepts both `--agents 8` and `--agents=8` (and the equivalent
`--max-threads` forms). Empty tasks, missing or malformed values, duplicate or
conflicting count flags, and legacy backend/scheduler/pool/model options are
rejected before any parent or paid subagent workflow can start.

## Model Policy

- parent agent: GPT-5.6 Sol, maximum reasoning effort
- `worker`: GPT-5.6 Luna, maximum reasoning effort, for clear bounded work
- `expert`: GPT-5.6 Sol, maximum reasoning effort, for reasoning-sensitive work

UI, review, debugging, planning, strategy, architecture, integration, security,
database, release, ambiguity, and other judgment-sensitive slices use the
expert role. SKS does not silently fall back to Terra or another model.

## Agent Configuration

Fresh SKS-owned project configuration uses:

```toml
[agents]
max_threads = 12
max_depth = 1
job_max_runtime_seconds = 1200
interrupt_message = true
```

Explicit user project or global values are preserved. Only recognized
SKS-owned legacy thread defaults are migrated. The SKS request safety cap is 32;
requests larger than the configured concurrent limit are divided into waves.

Custom agent files are limited to two managed roles:

- `.codex/agents/worker.toml` for Luna Max bounded work
- `.codex/agents/expert.toml` for Sol Max judgment work

User-authored collisions or invalid TOML are preserved and reported as manual
blockers instead of being overwritten.

## Delegation Contract

The parent agent owns decomposition, integration, verification, and the final
answer. Delegated slices must be independent, non-duplicative, and use disjoint
write scopes. Nested subagent delegation is prohibited by `max_depth = 1`.
The parent waits for all requested agent threads and closes completed threads
after collecting their results.

Codex Desktop/App sessions do not launch a nested `codex exec`. SKS returns the
official delegation context to the current parent session. A standalone
`sks naruto run` may launch exactly one Sol Max Codex parent; Codex itself owns
the official subagent threads. App preparation returns `prepared: true` with
`ok: false`; the active `CODEX_THREAD_ID` is reused as the session scope, so
preparing delegation cannot look like completed work or create a duplicate
same-session mission.

While a Naruto mission is active, its read-only `status`, `subagents`,
deprecated `workers`, and `proof` commands remain available.

## Completion Evidence

Preparation is not completion. A run passes only when all of the following are
present and consistent:

- unique official `SubagentStart` and `SubagentStop` thread IDs
- every started thread is stopped
- no failed or open thread remains
- the completed thread count satisfies the final requested-subagent plan
- a trustworthy `sks.subagent-parent-summary.v1` object is present
- that parent summary contains one explicit `completed`, `blocked`, or `failed`
  outcome for every stopped thread, with an overall completed status

The official `SubagentStop` hook payload does not supply a trustworthy success
status by itself. A stop without a matching structured parent outcome remains
ambiguous and fails closed; prose-only summaries and failed-result text also do
not satisfy the gate.

Canonical mission artifacts are:

- `subagent-plan.json`
- `subagent-events.jsonl`
- `subagent-evidence.json`
- `naruto-summary.json`
- `naruto-gate.json`

The result schema is `sks.naruto-subagent-workflow.v1`. Native process counts,
Zellij panes, and legacy `.jsonl` heuristics are not completion evidence on the
default path.

## Legacy Compatibility

The historical process-swarm implementation remains available only when the
operator explicitly sets:

```bash
SKS_NARUTO_LEGACY_PROCESS_SWARM=1 sks naruto run "task" --clones 8
```

Legacy backend, scheduler, work-item, patch-pool, and dashboard flags are
blocked on the default official path. This compatibility switch is not an
automatic fallback.
