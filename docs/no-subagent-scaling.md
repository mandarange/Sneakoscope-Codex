# Official Codex Subagent Scaling

`$Naruto` uses Codex official subagents as its default execution workflow.
SKS no longer treats native child-process count, PID overlap, Zellij pane count,
or a custom active pool as Naruto completion evidence.

The canonical policy is:

- parent: GPT-5.6 Sol with `model_reasoning_effort="max"`
- tiny short-context mechanical worker: GPT-5.6 Luna with `model_reasoning_effort="max"`
- ordinary implementation: GPT-5.6 Sol with `model_reasoning_effort="high"`
- review, debugging, planning, architecture, security, database, research,
  release, ambiguity, and judgment: GPT-5.6 Sol with `model_reasoning_effort="max"`
- long-context, Computer Use, Browser/Chrome, and image-generation execution:
  GPT-5.6 Terra with `model_reasoning_effort="medium"`
- mixed work is split by execution versus judgment when possible; an
  unsplittable mixed slice uses Sol Max
- automatic requested children: 1 by default, 2 for explicit parallel work or independent risk domains, and at most 3 for critical multi-domain risk
- explicit `--agents N` remains authoritative when the operator supplies it
- default `agents.max_threads`: 12 for fresh SKS-owned project config
- `agents.max_depth`: 1
- hard SKS request safety cap: 32, with larger requested work planned in waves

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
terminal invocation launches at most one Sol Max `codex exec` parent, and a
Codex App/Desktop invocation returns official delegation context to the current
parent without nesting another Codex process.

The parent reuses only bounded TriWiki `attention.use_first` anchors and hydrates
their source hints on demand. It does not inject the full context pack into each
child or require repeated repository-wide context discovery.

The legacy release-gate ids `agent:native-cli-worker-runtime-scaling` and
`agent:fast-mode-policy` are retired. `naruto:canonical-stop-gate` validates
the official event-evidence contract once.
