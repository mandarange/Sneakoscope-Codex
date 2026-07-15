# $Naruto — Codex Official Subagent Workflow

`$Naruto` and `sks naruto run` are the single current SKS execution surface for
Codex official subagent work. `$Work` is the intentional plan-execution alias;
it resolves the newest SKS plan and continues through the same Naruto evidence
contract. Retired route names and command spellings are unrecognized instead
of warning, redirecting, or activating a compatibility runtime.

## Usage

```bash
sks naruto run "implement this change"
sks naruto run "review independent release domains" --agents 3 --max-threads 12
sks naruto status latest --json
sks naruto subagents latest --json
sks naruto proof latest --json
```

Automatic fan-out is two children for non-trivial work and may expand to three
only for critical multi-domain risk. An explicit `--agents N` remains
authoritative, but every slice must be independent and defensible. The parser
accepts `--agents N` or `--agents=N` and the corresponding `--max-threads`
forms. Empty tasks, malformed or conflicting values, and removed options fail
before an agent workflow starts.

## Model Policy

- parent: GPT-5.6 Sol with maximum reasoning
- Luna Max: tiny, short-context, mechanical work only
- Sol High: ordinary UI, logic, backend, core, and native implementation
- Sol Max: review, debugging, planning, architecture, security, database,
  research, release, ambiguity, and other judgment-sensitive work
- Terra Medium: long-context analysis and direct Computer Use, Browser/Chrome,
  or image-generation execution

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

TriWiki recall stays bounded: the parent selects a small set of
`attention.use_first` anchors and children hydrate only relevant sources. The
full context pack is not copied into every child.

Codex App sessions reuse the current parent session instead of launching a
nested Codex process. Standalone CLI use may launch one parent process; Codex
itself owns the official subagent threads.

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
