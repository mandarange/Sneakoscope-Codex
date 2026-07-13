# $Naruto — Codex Official Subagent Workflow

`$Naruto` is the SKS alias for a Codex official subagent workflow. The default
path no longer treats a custom child-process swarm, PID count, Zellij panes, or
a custom active pool as proof that subagents ran.

An implicit run starts with one direct child so a plain task cannot trigger an
accidental paid fanout. The parent may select two children only for explicit
parallel work or independent risk domains, and three only for critical
multi-domain work. Explicit `--agents N` remains authoritative, but every
delegated slice must still be defensible and independent.

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

SKS materializes a project-scoped catalog of narrow official agents so Codex can
select by description instead of routing every task through one generic pair:

- bounded execution: `worker`, `explorer`, `docs_maintainer`
- implementation and diagnosis: `implementation_specialist`, `debugger`, `test_engineer`, `ui_implementer`
- independent review: `expert`, `architecture_reviewer`, `security_reviewer`, `database_reviewer`, `integration_reviewer`, `performance_analyst`, `release_reviewer`
- Research: `research_synthesizer`, `research_reviewer`

Clear bounded roles use Luna Max. Implementation, UI, debugging, test/root-cause,
Research, integration, safety, and release judgment use Sol Max. Write-capable
roles inherit the parent sandbox; only read-only roles declare a read-only
sandbox explicitly.

User-authored collisions or invalid TOML are preserved and reported as manual
blockers instead of being overwritten.

## Delegation Contract

The parent agent owns decomposition, integration, verification, and the final
answer. Delegated slices must be independent, non-duplicative, and use disjoint
write scopes. Nested subagent delegation is prohibited by `max_depth = 1`.
The parent waits for all requested agent threads and closes completed threads
after collecting their results.

The parent reads a bounded set of central TriWiki `attention.use_first` anchors
and passes only those identifiers, hashes, and on-demand hydration hints into
the delegation context. Subagents hydrate a cited source only when it is
relevant to their slice or a risky decision; the full context pack is not
injected and every child is not asked to repeat repository-wide discovery.

Codex Desktop/App sessions do not launch a nested `codex exec`. SKS returns the
official delegation context to the current parent session. A standalone
`sks naruto run` may launch exactly one Sol Max Codex parent; Codex itself owns
the official subagent threads. App preparation returns `prepared: true` with
`ok: false`; the active `CODEX_THREAD_ID` is reused as the session scope, so
preparing delegation cannot look like completed work or create a duplicate
same-session mission.

While a Naruto mission is active, its read-only `status`, `subagents`,
deprecated `workers`, and `proof` commands remain available.

If the Codex App reports `[No tool output found for custom tool call ...]`, the
current conversation may no longer satisfy the Responses call/output pairing
contract. SKS blocks same-thread continuation rather than treating preparation
context or a post-hoc stub as recovery. The operator must upgrade a selected
codex-lb to `1.21.0-beta.3` or later (or explicitly switch with
`sks codex-lb use-oauth`), inspect possible side effects, and continue this
mission from a fresh Codex task.

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
- `subagent-parent-summary.json`
- `subagent-evidence.json`
- `naruto-summary.json`
- `naruto-gate.json`

The result schema is `sks.naruto-subagent-workflow.v1`. Native process counts,
Zellij panes, and legacy `.jsonl` heuristics are not completion evidence on the
default path.

In CLI Zellij sessions, those panes are nevertheless useful observability
surfaces: official start/stop hooks populate the monitor and viewports, and a
version-gated exact-agent rollout tail supplies redacted live phase/task/file
updates without exposing raw reasoning, command arguments, or tool output.
The rollout is display-only; stop remains `verifying`, and only the same
trustworthy parent outcomes used by this gate produce terminal `completed` or
`failed` telemetry.

## Legacy Compatibility

The historical Naruto process-swarm command implementation and its environment
switch have been removed. Legacy backend, scheduler, work-item, patch-pool,
model, and dashboard flags fail closed and cannot reactivate that runtime.
`--clones` and read-only `workers` remain temporary spelling aliases only; they
map to official `--agents` and `subagents` behavior and never select a custom
scheduler, worker pool, process swarm, or alternate model fanout.
