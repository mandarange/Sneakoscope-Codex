# Legacy Native CLI Session Swarm

> Compatibility reference only. The default Naruto path in SKS 6.1.1 does not
> launch or count these worker processes. Naruto completion now requires
> matched official `SubagentStart`/`SubagentStop` events and a parent summary.
> Enable historical Naruto process behavior only with the explicit legacy
> environment switch documented in `docs/naruto.md`.

SKS 1.18.11 treats `--agents N` as a target native CLI worker session count. The main orchestrator does not scale by counting Codex internal subagents or scout events. It opens child processes with the worker entrypoint:

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

Release blockers:

- `--agents 10` with enough work must observe at least 10 native worker processes.
- `--agents 20` with enough work must observe at least 20 native worker processes.
- Missing process ids, missing process-report close fields, missing heartbeats, or subagent-only proof block the release.

Release gates:

```bash
npm run agent:native-cli-session-swarm
npm run agent:native-cli-session-swarm-10
npm run agent:native-cli-session-swarm-20
npm run agent:native-cli-session-proof
```
