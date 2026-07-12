# Official Codex Subagent Scaling

`$Naruto` uses Codex official subagents as its default execution workflow.
SKS no longer treats native child-process count, PID overlap, Zellij pane count,
or a custom active pool as Naruto completion evidence.

The canonical policy is:

- parent: GPT-5.6 Sol with `model_reasoning_effort="max"`
- clear bounded worker: GPT-5.6 Luna with `model_reasoning_effort="max"`
- reasoning-sensitive expert: GPT-5.6 Sol with `model_reasoning_effort="max"`
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

The historical process swarm remains available for one compatibility window
only when the operator explicitly sets:

```bash
SKS_NARUTO_LEGACY_PROCESS_SWARM=1 sks naruto run "task"
```

Without that opt-in, `sks naruto run` never launches one SKS-owned child process
per requested subagent. A standalone terminal invocation launches at most one
Sol Max `codex exec` parent, and a Codex App/Desktop invocation returns official
delegation context to the current parent without nesting another Codex process.

The retained release-gate ids `agent:native-cli-session-swarm-scaling`,
`agent:fast-mode-policy`, and `naruto:canonical-stop-gate` now validate this
official event-evidence contract for compatibility with existing gate tooling.
