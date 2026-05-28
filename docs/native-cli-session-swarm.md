# Native CLI Session Swarm

SKS 1.18.10 treats `--agents N` as a target native CLI worker session count. The main orchestrator does not scale by counting Codex internal subagents or scout events. It opens child processes with the worker entrypoint:

```bash
node dist/bin/sks.js --agent worker --intake <worker-intake.json> --json
```

Each worker process receives a parent mission id, slot id, generation index, work item id, persona id, lease context, source-intelligence refs, Goal refs, strategy refs, recursion-guard env, fast-mode env, and independent artifact paths.

Worker artifacts are written under:

```text
sessions/<slot_id>/gen-<n>/worker/
```

Required worker artifacts:

- `worker-intake.json`
- `worker-heartbeat.jsonl`
- `worker-process-report.json`
- `worker-result.json`
- `worker-patch-envelope.json` or `worker-no-patch-reason.json`
- `worker-terminal-close-report.json`
- `worker-fast-mode.json`
- `worker-recursion-guard.json`
- `worker-session-proof.json`

The parent writes `agent-native-cli-session-swarm.json`, then `native-cli-session-proof.json` validates requested agents, target active slots, spawned worker process count, max observed worker process count, unique sessions, unique slots, unique generations, process ids, heartbeat files, close reports, and worker artifact directories.

Release blockers:

- `--agents 10` with enough work must observe at least 10 native worker processes.
- `--agents 20` with enough work must observe at least 20 native worker processes.
- Missing process ids, missing close reports, missing heartbeats, or subagent-only proof block the release.

Release gates:

```bash
npm run agent:native-cli-session-swarm
npm run agent:native-cli-session-swarm-10
npm run agent:native-cli-session-swarm-20
npm run agent:native-cli-session-proof
```
