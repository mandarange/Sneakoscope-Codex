# No-Subagent Scaling

SKS 1.18.11 worker count is native process count, not Codex internal subagent/scout event count.

Policy artifact:

```json
{
  "schema": "sks.no-subagent-scaling-policy.v1",
  "main_orchestrator_scaling_primitive": "native_cli_process",
  "subagent_events_counted_as_worker_sessions": false,
  "scout_events_counted_as_worker_sessions": false
}
```

Official Codex hook compatibility still supports `SubagentStart` and `SubagentStop`, but SKS-owned worker lifecycle UI records `NativeSessionStart` and `NativeSessionStop`. Subagent hook events never prove SKS worker capacity. The release gate requires `native-cli-session-proof.json` and `agent-native-cli-session-swarm.json` with real child process ids.

Allowed helper behavior:

- A native worker may use an internal scout as a helper.
- Helper scout events are recorded separately.
- Helper scout events never increase `requested_agents`, `target_active_slots`, `spawned_worker_process_count`, or `max_observed_worker_process_count`.

Release gate:

```bash
npm run agent:no-subagent-scaling
```
