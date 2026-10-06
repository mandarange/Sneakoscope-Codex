# $sks-naruto — Naruto Parallel System

`$sks-naruto` and `sks naruto run` are the single SKS product surface for parallel
child work. Codex official subagents are the sealed transport underneath;
`$sks-work` is the intentional plan-execution alias. Retired route names, native
agent swarms, and custom process schedulers are not alternate Naruto runtimes.

## When Naruto runs

Naruto is not the default for implementation. Ordinary work (a bug fix, a test,
a refactor or config change in one area, a review) is the main agent's own, the
way Codex works by default: it carries no mission, no subagent plan, and no
parent edit gate, and the hook adds about a fifth of the text a Naruto turn
carries. Naruto runs when:

- you invoke `$sks-naruto` or `$sks-work`, pass `--agents N`, or ask for
  subagents or parallel work as a request ("in parallel", "use 3 subagents",
  "split this across agents"); a word such as "parallel" or "naruto" used as
  subject matter ("fix the parallel test runner") is not a request, and a risk
  word such as "payment" or "deploy" does not cancel a real one;
- you invoked an artifact pipeline by name (`$sks-ppt`, `$sks-image-ux-review`,
  `$sks-gx`, `$sks-seo-geo-optimizer`, `$sks-super-search`, `$sks-release-review`),
  which keeps its panel of children, while the same route picked from the
  prompt's wording does not fan out by itself. `$sks-review`, `$sks-db`, and
  `$sks-mad-sks` stay single-agent even when named: a diff review, a migration
  review, and a capability-bound SQL run are one agent's job, and children
  holding a write-capable database profile would widen the blast radius;
- Jev mode is on and Jev judges that the task splits into two or more
  independent parts (different files or modules, no shared edits). Single is the
  default and the answer whenever Jev is unsure.

A task that merely looks like implementation, or names a risky area, never starts
child agents on its own.

## Usage

```bash
sks naruto run "implement this change"
sks naruto run "review independent release domains" --agents 3 --max-threads 12
sks naruto run "create an XLSX report" --trusted-project
sks naruto status latest --json
sks naruto subagents latest --json
sks naruto proof latest --json
# Codex App internal finalization only:
printf '%s' '<sks.subagent-parent-summary.v1 JSON>' \
  | sks naruto parent-summary --mission M-... --stdin --json
```

## Choosing the execution lane

`sks update` creates the global Naruto execution preference at
`~/.sneakoscope/preferences/naruto-execution.json` when it is missing. It seeds
`current-session` for a marked Codex App process and `standalone` for an update
run from a terminal, then preserves a choice made by the operator on later
updates. The preference is deliberately separate from shell environment
variables, so a terminal that inherited `CODEX_THREAD_ID` can be switched
without editing a profile or weakening the App-session trust boundary.

Inspect or change it with:

```bash
sks naruto execution status --json
sks naruto execution set --mode auto --restart --json
sks naruto execution set --mode current-session --restart --json
sks naruto execution set --mode standalone --restart --json
```

`auto` keeps the existing App contract when a thread id is present,
`current-session` requires that id, and `standalone` makes a terminal command
launch the official Codex workflow even when the shell inherited an App id.
SKS Center → Settings → Naruto execution exposes the same values. Apply writes
the preference and asks the restart policy to quit and reopen a running Codex
App on macOS; if Codex is not running, the setting applies at its next launch.
The result reports a launch-guard or restart blocker instead of claiming that a
reboot occurred.

Automatic fan-out starts at four Naruto children for bounded non-trivial work, six for
explicitly parallel work, eight for large-scale work, and sixteen for mass mechanical or exploration
fan-out on the fast and context tiers. After decomposition the parent may resize either lane
up to 256 children, but only when every additional slice is independent, useful, and
verifiable. Explicit `--agents N` and
`--max-threads N` values from 1 through 256 are authoritative and are not reduced to
the automatic starting tiers. `max_threads = 256` is the default hard **child-slot
frame budget** (cap), never a spawn target. At the structural maximum,
`--max-threads 256` means up to 256 children; SKS does not subtract the root a second
time. A Codex multi-agent V2 host may count the root separately and therefore require
257 total session slots. If that external host exposes fewer slots, its limit is the
active limiter and must be reported instead of being presented as SKS-selected 256
concurrency. Remaining requested work reuses returned capacity in later waves.

The fast tier handles tiny mechanical shards, the balanced tier handles
instructed ordinary coding execution, the context tier handles broad search and
exploration shards, and the deep tier handles planning, analysis, review, and
other judgment. The four task-class profiles (mechanical / implementation /
context-tools / judgment) are a **routing LOD**, not an agent-count cap.

`SKS_NARUTO_REMOTE_API_PARALLEL_BUDGET` declares the provider/API
parallel-request budget used by the governor. It can lower or align SKS with a measured
provider allowance; it cannot raise a lower external Codex host/session limit. The
official Codex lane does not add a local CPU/RAM or unmeasured API-default clamp. The
256 value is a structural scheduling ceiling, not a recommended target or evidence
that 256 live agents were load-tested on the current host. Actual active concurrency
remains bounded by the operator frame budget, external host/session slots, an explicit
remote API budget, ready DAG width, disjoint ownership, and verifier/tool capacity.
Before each wave Naruto computes:

```text
C_t = min(
  ready DAG width,
  disjoint ownership,
  verifier capacity,
  tool concurrency,
  external host/session child slots,
  available thread slots after parent/(demand-driven) reviewer reservations,
  workers with positive marginal usefulness
)
```

Naruto launches `n_t <= C_t` and stops expanding when spawn, communication,
verification, integration, or expected-rework cost removes the marginal gain.
An explicit `--agents N` remains authoritative, but every slice must still be
independent and defensible. The parser accepts `--agents N` or `--agents=N` and
the corresponding `--max-threads` forms. Empty tasks, malformed or conflicting
values, and removed options fail before an agent workflow starts.

Children produce candidates; the Naruto parent owns integration (command-buffer /
deferred-apply). Overlapping write scopes are never scheduled concurrently
(false-sharing analog). Waves settle before merge when files conflict; later
root-owned waves reuse returned capacity before starting.

Database, spreadsheet, document-render, and other project-host capability requests
remain fail-closed unless the operator supplies `--trusted-project` after reviewing the checkout.
The signal applies only to that invocation: it is not written to mission state or project config.
When present, Naruto may perform the bounded project MCP inventory/health probe. Standalone runs
launch Codex with only the requested healthy host tools enabled; Codex App runs return bounded
delegation context without a nested spawn. App session identity is used only for mission/run/session
correlation and never grants project trust, so App host-capability requests require the same explicit
`--trusted-project` signal.

## Model Policy

No model family is pinned. Each tier resolves to the newest model the Codex
models cache (`$CODEX_HOME/models_cache.json`) lists for that family, preferring
the highest version; without a cache SKS uses the built-in latest family. When
Codex lists a newer family, every tier moves to it without an SKS release.

| Tier | Effort | Today | Assigned role |
| --- | --- | --- | --- |
| deep | max | `gpt-6-astra` | Standalone root default, planning, analysis, review, architecture, debugging, security, database, release, and ambiguous work |
| balanced | low | `gpt-6.1-sol` | Instructed ordinary UI, backend, logic, core, and native coding execution |
| context | medium | `gpt-6.1-sol` (Terra wins when it is listed at the same or a newer version) | Large documents, logs, long-term memory, repository exploration, rapid large-scale first-draft code processing, plus Browser, Computer Use, and image execution |
| fast | low | `gpt-6-luna` | Tiny, short-context work with clear completion conditions and strong automatic verification |

Active parent model, effort, and service-tier selections are preserved. A
stored role preference on a current model wins for that role; a preference on
an older generation moves to the latest model of the same tier. The four
serialized profile IDs remain stable for compatibility, but their names are
legacy labels: `luna_max_mechanical` is the fast tier (low effort),
`sol_high_implementation` the balanced tier (low), `terra_max_context_tools` the
context tier (medium), and `sol_max_judgment` the deep tier (max, Astra family).
The tier decides model and effort, not the name. With Jev mode on, Jev picks the
tier for each spawn and SKS seals that tier's newest model.

Mixed work is split when practical. If a slice cannot safely separate execution
from judgment, the deep tier owns it. SKS never silently substitutes another model or
recreates a custom process scheduler when the selected official path is
unavailable.

## Agent Configuration

Naruto runs on Codex multi-agent V2. The Codex model catalog selects V2 per model
(`multi_agent_version`), but a model whose catalog row does not select it, including a
model the installed Codex's bundled catalog does not know yet, gets the V1 spawn tool or
none. `[features.multi_agent_v2] enabled = true` gives every model the V2 spawn tool, which
is why SKS writes it.
Hosts that lack MA v2 fail closed with explicit “update Codex CLI” guidance
(`sks codex update` / Menu Bar → Update Codex CLI Now); SKS does not revive a
legacy process runtime. Use the official latest stable Codex CLI; capability
probes, not a pinned channel number, decide what SKS enables. Fresh SKS-owned project
configuration uses:

```toml
[features.multi_agent_v2]
enabled = true
max_concurrent_threads_per_session = 257

[agents]
max_concurrent_threads_per_session = 256
max_depth = 1
default_subagent_model = "gpt-6-astra"   # the latest deep-tier model
default_subagent_reasoning_effort = "low"
```

`agents.enabled`, `agents.interrupt_message` and the spawn tool's `model` /
`reasoning_effort` arguments (`expose_spawn_agent_model_overrides`) already default to
true in Codex, so SKS does not write them; configs that carry them keep them.

`max_concurrent_threads_per_session` under `[agents]` is the configured spawned-child
frame budget (the SKS-owned default is 256), which is also the absolute hard frame
cap. The MA v2 feature total includes the root thread (`256 + 1 = 257`). An
external-host rejection or lower advertised total is a real concurrency limiter and
must remain visible in the plan/evidence instead of being relabeled as a 256-child
wave.
`max_depth = 1` stays as the V1 guard (the Codex schema says V2 ignores it) and SKS
still forbids nested delegation. Legacy `agents.max_threads` and
`job_max_runtime_seconds` are migrated or stripped on SKS-owned configs.

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
disjoint file/module shards, or non-exclusive tool surfaces; homogeneous clones
do not count as extra capacity. Reviewer-only fan-out remains capped at two for
ordinary work and three for critical multi-domain review. Security, database,
release, authorization, and irreversible-effect gates are protected strata and
cannot be offset by aggregate speed or accuracy.

Computer Use and browser (the in-app Browser or Chrome) are exclusive GUI
surfaces: each is one screen or browser session with one pointer and keyboard
focus, so two children on it only repeat the same task. At most one child owns
a surface at a time. All of a surface's work goes in one slice handled by one
`computer_use_operator` or `browser_use_operator` child, or its slices run one
after another once the previous child has stopped; other children work without
the surface and use the owner's returned evidence. The context tier is only the
model choice for that work, not permission to fan it out, so a goal whose
suggested roles are only surface operators never joins the 16-child mass lane.
The SKS PreToolUse hook enforces this on every parent: it denies a second
concurrent `spawn_agent` for a surface until the owning child's `SubagentStop`.
`SubagentStop` ends a child turn, so a resumed operator takes its surface again
with its next tool call when nobody else holds it. A claim also expires, so a
missed event cannot lock a surface: 30 seconds for a spawn that never started
(Codex can reject a spawn after the hook allowed it), 20 minutes without a tool
call from the owner. The gate recognises the operator roles by the `agent_type`
the spawn carries; OpenRouter Only mode routes a managed role to a list role
first, so there the prompt rule alone applies. Image generation is not
exclusive.

TriWiki recall stays bounded: the parent selects a small set of
`attention.use_first` anchors and children hydrate only relevant sources. The
full context pack is not copied into every child.

Codex App sessions reuse the current parent session instead of launching a
nested Codex process. Standalone CLI use may launch one parent process; Codex
itself owns the official subagent threads.

In Codex App, the parent sends the strict `sks.subagent-parent-summary.v1`
object only through `parent-summary --mission <id> --stdin`; that JSON is an
internal lifecycle payload and must not be pasted into the user-visible answer.
After the command accepts it, the parent returns localized Markdown with the
completion summary, verification, remaining gaps, and Honest Mode. A
non-terminal submission may be corrected by a later valid submission for the
same active run. Once the complete terminal bundle is sealed, identical replay
is idempotent and conflicting content is rejected.

## Parent Orchestration Gate

Prompt text alone did not keep the parent from implementing the first slice
itself, so the `PreToolUse` hook enforces it. A source edit from the root
parent thread is denied in two situations: before the mission's first child
thread starts, and while any child of the current run is still running (a
`SubagentStart` without its `SubagentStop`). Source edits are `apply_patch`
(Codex sends the patch text as `tool_input.command`), file write and edit
tools, and shell commands with write intent such as `sed -i`, redirects,
`git commit`, or package installs. The denial names the mission and tells the
parent to spawn children first, or to wait for the running children and then
integrate.

Read-only tools, verification commands, MCP host tools, and writes whose every
target lives under `.sneakoscope/` are never gated. A child thread is never
gated: Codex hook payloads carry no thread id, a child keeps the parent's
`session_id`, and only the `agent_id` / `agent_type` fields mark it.

The ledger `.sneakoscope/missions/<id>/parent-orchestration-gate.json` records
spawns, denials, Jev's last answer, and releases. Each phase releases after two
denials, with one visible warning and a recorded escape, so a host without a
working spawn tool or `SubagentStop` event cannot deadlock. The wait counter
belongs to one set of running children, so a later wave gets its own denials.
When Jev mode is on, each gated call before the first spawn asks one
`delegation` Choice; a confident `parent_owned` answer releases that one edit
as orchestration scaffolding (see `jev-decisions.md`).

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

Standalone Naruto launched with `--trusted-project` runs Codex from the canonical project root and
adds an invocation-only `projects.<root>.trust_level="trusted"` override without replacing either
the user config or project `.codex/config.toml`. The first child hook session atomically claims the
prepared mission/run host-capability runtime from a nonce-hash grant and consumes that grant before
any ACAS tool call. Without the flag, the standalone parent forces the canonical project to
`untrusted`; if a global `acas-tools` registration actually exists, a read-only native inventory
probe adds only `enabled=false`, preserving its stdio or URL transport. MCP configuration writes continue to use the guarded project mutation
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
retrieval first obtains that schema context, then may run up to four bounded
parameterized `SELECT`/CTE queries via `datasource_query_readonly` against the
same schema snapshot, retaining a receipt for each query.

For spreadsheets, creation follows `spreadsheet_create` →
`spreadsheet_inspect` → up to three minimal `spreadsheet_update` steps each
followed by `spreadsheet_inspect`; editing follows an initial
`spreadsheet_inspect` → one to three `spreadsheet_update` steps each followed by
`spreadsheet_inspect`. Document delivery follows
editable source → render → artifact receipt. Slack delivery is ACAS-runtime
owned and is never a model tool. These are host-MCP contracts only: SKS adds no
SKS DB, Excel, Slack, or Center dependency or service.

The standalone runtime narrows the MCP allowlist to the tools required by the
sealed task. Spreadsheet receipts must bind every create/inspect/update call to
one workspace resource, permit at most three updates, and include an inspection
after each mutation including the final one. Document proof requires an observed editable-source
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

<!-- sks-release-version: 8.4.0 Architecture Map (AMG/ADR) -->
