# $sks-naruto — Codex Official Subagent Workflow

`$sks-naruto` and `sks naruto run` are the single current SKS execution surface for
Codex official subagent work. `$sks-work` is the intentional plan-execution alias;
it resolves the newest SKS plan and continues through the same Naruto evidence
contract. Retired route names and command spellings are unrecognized instead
of warning, redirecting, or activating a compatibility runtime.

## Usage

```bash
sks naruto run "implement this change"
sks naruto run "review independent release domains" --agents 3 --max-threads 12
sks naruto run "create an XLSX report" --trusted-project
sks naruto status latest --json
sks naruto subagents latest --json
sks naruto proof latest --json
```

Automatic fan-out starts at two children for bounded non-trivial work, four for
explicitly parallel work, and six for large-scale work. After decomposition the
parent may resize the automatic plan up to ten children, but only when every
additional slice is independent, useful, and verifiable. `max_threads = 12` is
a hard cap rather than a target. Before each wave Naruto computes:

```text
C_t = min(
  ready DAG width,
  disjoint ownership,
  verifier capacity,
  tool concurrency,
  available thread slots after parent/reviewer reservations,
  workers with positive marginal usefulness
)
```

Naruto launches `n_t <= C_t` and stops expanding when spawn, communication,
verification, integration, or expected-rework cost removes the marginal gain.
An explicit `--agents N` remains authoritative, but every slice must still be
independent and defensible. The parser accepts `--agents N` or `--agents=N` and
the corresponding `--max-threads` forms. Empty tasks, malformed or conflicting
values, and removed options fail before an agent workflow starts.

Database, spreadsheet, document-render, and other project-host capability requests
remain fail-closed unless the operator supplies `--trusted-project` after reviewing the checkout.
The signal applies only to that invocation: it is not written to mission state or project config.
When present, Naruto may perform the bounded project MCP inventory/health probe. Standalone runs
launch Codex with only the requested healthy host tools enabled; Codex App runs return bounded
delegation context without a nested spawn. App session identity is used only for mission/run/session
correlation and never grants project trust, so App host-capability requests require the same explicit
`--trusted-project` signal.

## Model Policy

| Lane | Model / effort | Assigned role |
| --- | --- | --- |
| Root orchestrator | Sol Max | DAG decomposition, contract finalization, integration, and final judgment |
| Judgment lane | Sol Max | Architecture, debugging, security, database, release, and ambiguous work |
| Implementation lane | Sol High | Ordinary UI, backend, logic, core, and native implementation |
| Context/tool lane | Terra Medium | Large documents, logs, and repository exploration plus Browser, Computer Use, and image execution |
| Mechanical lane | Luna Max | Tiny, short-context work with clear completion conditions and strong automatic verification |

Mixed work is split when practical. If a slice cannot safely separate execution
from judgment, Sol Max owns it. SKS never silently substitutes another model or
recreates a custom process scheduler when the selected official path is
unavailable.

## Agent Configuration

Fresh SKS-owned project configuration uses:

```toml
[agents]
max_threads = 12
max_depth = 1
job_max_runtime_seconds = 1200
interrupt_message = true
```

Explicit user configuration is preserved. SKS installs a project-scoped
catalog of narrow official roles and injects only the few roles relevant to the
current task. User-authored collisions or invalid TOML are preserved and
reported as manual blockers.

## Delegation Contract

The parent owns decomposition, integration, verification, and the final answer.
Delegated slices must be independent, non-duplicative, and use disjoint write
scopes. Nested delegation is prohibited by `max_depth = 1`. The parent waits for
every requested thread and records one structured outcome per thread.

The decomposed plan is validated before spawning. Duplicate slice fingerprints,
unassigned parallel write scopes, and parent/child or identical path overlap are
blocked or serialized. Useful diversity may come from specialist roles,
disjoint file/module shards, or different tool surfaces; homogeneous clones do
not count as extra capacity. Reviewer-only fan-out remains capped at two for
ordinary work and three for critical multi-domain review. Security, database,
release, authorization, and irreversible-effect gates are protected strata and
cannot be offset by aggregate speed or accuracy.

TriWiki recall stays bounded: the parent selects a small set of
`attention.use_first` anchors and children hydrate only relevant sources. The
full context pack is not copied into every child.

Codex App sessions reuse the current parent session instead of launching a
nested Codex process. Standalone CLI use may launch one parent process; Codex
itself owns the official subagent threads.

## Same-Mission Admission

Standalone `naruto run` holds one mission-wide admission lock from before
preparation until the terminal summary and gate are written. Concurrent callers
for the same mission do not create another workflow run:

- a completed or blocked terminal bundle is returned unchanged with
  `reused: true`;
- a live owner returns `status: "running"` and `already_running: true`;
- an artifact identity conflict returns a bounded blocked result; and
- a dead stale owner with no terminal bundle is recovered by exactly one
  caller in the same mission.

The lock records a spawned Codex parent PID before waiting for it. A surviving
child therefore remains protected from stale recovery after the SKS parent
exits unexpectedly. Terminal six-artifact bytes and mtimes are never rewritten
by reentry or proof reads.

## Project MCP Compatibility

Standalone Naruto launched with `--trusted-project` runs Codex from the project root without
replacing the project `.codex/config.toml`. A trusted project-scoped stdio MCP registration is
therefore discovered by the Codex parent through the existing configuration
layer. MCP configuration writes continue to use the guarded project mutation
path, store only approved environment variable names, and fail closed on
startup, timeout, or stdout protocol errors.

Host capability use is inventory-driven: a parent may use a host tool only when
it is actually present in the project MCP inventory. It does not infer a tool
from configuration text, duplicate host-tool schemas, or auto-repair a missing
or unhealthy capability. If the task requests such a capability, Naruto returns
a blocked proof; capabilities not requested do not block ordinary coding or text
work.

For database work, SKS owns the schema-first query plan and SQL generation, but
the host owns credentials, connector policy, and read-only execution. A
SQL-generation-only task first calls `datasource_schema_context`, then uses only
reported tables and columns and may complete without executing SQL. Actual data
retrieval first obtains that schema context, creates one bounded parameterized
`SELECT`/CTE query, calls `datasource_query_readonly`, and retains its receipt.

For spreadsheets, creation follows `spreadsheet_create` →
`spreadsheet_inspect` → optional one minimal `spreadsheet_update` →
`spreadsheet_inspect`; editing follows `spreadsheet_inspect` → one minimal
`spreadsheet_update` → `spreadsheet_inspect`. Document delivery follows
editable source → render → artifact receipt. Slack delivery is ACAS-runtime
owned and is never a model tool. These are host-MCP contracts only: SKS adds no
SKS DB, Excel, Slack, or Center dependency or service.

The standalone runtime narrows the MCP allowlist to the tools required by the
sealed task. Spreadsheet receipts must bind every create/inspect/update call to
one workspace resource, permit at most one update, and include an inspection
after the final mutation. Document proof requires an observed editable-source
write before render plus an artifact receipt emitted by the render call.

## Completion Evidence

Preparation is not completion. A run passes only when:

- official start/stop events correlate to unique thread IDs;
- every started thread has stopped and no failed/open thread remains;
- completed outcomes satisfy the final requested-subagent plan;
- `subagent-parent-summary.json` contains one explicit outcome per thread; and
- the parent-owned integration and verification evidence passes.

Canonical mission artifacts are:

- `subagent-plan.json`
- `subagent-events.jsonl`
- `subagent-parent-summary.json`
- `subagent-evidence.json`
- `naruto-summary.json`
- `naruto-gate.json`

Terminal panes and process counts are observability only. They never substitute
for official thread evidence or a trustworthy parent outcome.

`sks naruto proof <mission> --json` reads the six canonical files as one bounded
snapshot and preserves the existing `evidence`, `summary`, and `gate` objects.
It also returns only the stable states `completed`, `blocked`, or `incomplete`,
plus `workflow_run_id`, a validated `result` projection, and a deterministic
`sha256:<64 lowercase hex>` `proof_fingerprint`. The fingerprint covers stable
workflow identity, the raw byte hash of every canonical artifact, and the
bounded result; timestamps, PIDs, lock ownership, prompts, environment dumps,
and raw process output are excluded.

`result.artifacts` and `result.capabilities_used` are optional additive arrays.
An artifact receipt contains only workspace-relative POSIX `path`, `kind`,
`media_type`, `sha256`, positive integer `bytes`, and `role`; it rejects
absolute or escaping paths, symlinks, non-regular files, duplicate paths, and
non-deliverables presented as deliverables. At proof time Naruto stats and hashes
the referenced file again, so the receipt's path, byte count, and SHA-256 must
match the on-disk artifact. Capability-use rows contain only capability ID,
status, tool names, and a receipt hash. The bounded projection carries no raw
tool arguments, query rows, tokens, credentials, prompts, environment dumps, or
raw process output. `blockers` is always an array, and the proof fingerprint
includes the projected optional arrays whenever they are present.
