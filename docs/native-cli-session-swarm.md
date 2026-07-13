# Legacy Native CLI Session Swarm

> Compatibility reference only. The Naruto path in SKS 6.1.2 does not
> launch or count these worker processes. Naruto completion now requires
> matched official `SubagentStart`/`SubagentStop` events and a parent summary.
> There is no legacy environment switch or supported opt-in that re-enables
> this process runtime; the details below are migration archaeology only.

Historical SKS builds treated `--agents N` as a target native CLI worker session count. The main orchestrator did not scale by counting Codex internal subagents or scout events. It opened child processes with the worker entrypoint:

```bash
node dist/bin/sks.js --agent worker --intake <worker-intake.json> --json
```

Each worker process receives a parent mission id, slot id, generation index, work item id, persona id, lease context, source-intelligence refs, Goal refs, strategy refs, recursion-guard env, fast-mode env, and independent artifact paths.

Worker artifacts are written under:

```text
sessions/<slot_id>/gen-<n>/worker/
```

Required worker artifacts:

- `worker-heartbeat.jsonl`
- `worker-process-report.json`
- `worker-result.json`
- `worker-patch-envelope.json` when a patch candidate exists

`worker-intake.json` is debug-only (`SKS_DEBUG_ARTIFACTS=1`). Fast-mode, recursion-guard, terminal close, and session proof fields live under `worker-process-report.json`; no-patch rationale lives under `worker-result.json.no_patch_reason`.

The parent writes `agent-native-cli-session-swarm.json`, then `native-cli-session-proof.json` validates requested agents, target active slots, spawned worker process count, max observed worker process count, unique sessions, unique slots, unique generations, process ids, heartbeat files, process-report close fields, and worker artifact directories.

Historical release blockers (process-swarm compatibility only; not current
Naruto release criteria):

- `--agents 10` with enough work must observe at least 10 native worker processes.
- `--agents 20` with enough work must observe at least 20 native worker processes.
- Missing process ids, missing process-report close fields, missing heartbeats, or subagent-only proof block the release.

The npm commands that previously checked PID/process scaling are removed.
Current release validation uses the canonical official-subagent gate:

```bash
node ./dist/scripts/official-subagent-workflow-check.js
```

The former manifest id `agent:native-cli-session-swarm-scaling` is retired.
Use the single `naruto:canonical-stop-gate` official event and structured-parent-summary
check; no PID counting is treated as completion evidence.
