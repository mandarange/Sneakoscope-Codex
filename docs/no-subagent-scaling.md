# Official Codex Subagent Scaling

`$sks-naruto` uses Codex official subagents as its default execution workflow.
SKS no longer treats native child-process count, PID overlap, terminal display count,
or a custom active pool as Naruto completion evidence.

Managed children run on model tiers. Each tier resolves to the newest model
Codex lists for it (see the Model Policy section of [naruto.md](naruto.md)). The
canonical effort policy is:

- standalone parent: deep tier with `model_reasoning_effort="max"`; active Codex tasks keep their selected model and effort
- tiny short-context mechanical worker: fast tier with `model_reasoning_effort="low"`
- ordinary implementation: balanced tier with `model_reasoning_effort="low"`
- review, debugging, planning, architecture, security, database, research,
  release, ambiguity, and judgment: deep tier with `model_reasoning_effort="max"`
- long-context, long-term memory, large documents/repository reads, rapid
  large-scale first-draft code processing, Computer Use, Browser/Chrome, and
  image-generation execution: context tier with `model_reasoning_effort="medium"`
- mixed work is split by execution versus judgment when possible; an
  unsplittable mixed slice uses the deep tier
- Computer Use and Browser/Chrome are single-owner GUI surfaces: one child per surface at a time, all of that surface's work in one slice, so a goal whose suggested roles are only surface operators never joins the 16-child mass lane (see the Delegation Contract in [naruto.md](naruto.md))
- automatic requested children start at 4 for bounded non-trivial work, 6 for explicit parallel work, 8 for large-scale work, and 16 for mass mechanical or exploration work on the fast and context tiers; after decomposition either lane may expand to 256 only when ready DAG width, disjoint ownership, verifier/tool capacity, real host slots, and positive marginal usefulness all permit it
- reviewer-only fan-out: at most 2 for ordinary work and 3 for critical multi-domain review
- explicit `--agents N` and `--max-threads N` values from 1 through 256 remain authoritative when the operator supplies them
- default `agents.max_concurrent_threads_per_session`: 256 child slots for fresh SKS-owned project config when Codex multi-agent V2 is available
- `features.multi_agent_v2.max_concurrent_threads_per_session`: 257 total session slots (root + 256 children)
- concurrency is a hard cap, not a utilization target; the parent is accounted outside the child cap and reviewer reservations are demand-driven
- `agents.max_depth`: 1 (V1-only; ignored by MA v2, still fail-closed in SKS)
- hard SKS child-frame safety cap: 256, with a measured lower Codex host or provider/API allowance remaining authoritative and returned capacity reused across waves

Completion requires matched thread evidence from official `SubagentStart` and
`SubagentStop` events, zero failed requested threads, and a trustworthy
`sks.subagent-parent-summary.v1` object with one explicit outcome per thread.
`delegation_context_ready` is preparation only and cannot pass the gate.

Canonical artifacts are:

```text
subagent-plan.json
subagent-events.jsonl
subagent-parent-summary.json
subagent-evidence.json
naruto-summary.json
naruto-gate.json
```

The historical Naruto process runtime and its environment opt-in are removed.
Legacy backend, scheduler, pool, and model flags fail closed. A standalone
terminal invocation launches at most one deep-tier (max effort) `codex exec` parent, and a
Codex App/Desktop invocation returns official delegation context to the current
parent without nesting another Codex process.

The parent reuses only bounded TriWiki `attention.use_first` anchors and hydrates
their source hints on demand. It does not inject the full context pack into each
child or require repeated repository-wide context discovery.

The legacy release-gate ids `agent:native-cli-worker-runtime-scaling` and
`agent:fast-mode-policy` are retired. `naruto:canonical-stop-gate` validates
the official event-evidence contract once.
