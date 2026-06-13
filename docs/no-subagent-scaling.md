# No-Subagent Scaling

SKS 1.18.11 worker count is native process count, not Codex internal subagent/scout event count.

Codex official subagents and Codex App tool capabilities are allowed as helper
lanes. They are useful for bounded parallel exploration and for official
capabilities such as `$imagegen` / `gpt-image-2`, but they never increase native
worker capacity.

Policy artifact:

```json
{
  "schema": "sks.no-subagent-scaling-policy.v1",
  "main_orchestrator_scaling_primitive": "native_cli_process",
  "subagent_events_counted_as_worker_sessions": false,
  "scout_events_counted_as_worker_sessions": false,
  "official_codex_subagent_helper_lane_allowed": true,
  "official_helper_lane_worker_capacity_credit": 0,
  "official_helper_lane_events_counted_as_worker_sessions": false
}
```

Official Codex hook compatibility still supports `SubagentStart` and `SubagentStop`, but SKS-owned worker lifecycle UI records `NativeSessionStart` and `NativeSessionStop`. Subagent hook events never prove SKS worker capacity. The release gate requires `native-cli-session-proof.json` and `agent-native-cli-session-swarm.json` with real child process ids.

Allowed helper behavior:

- A native worker may use an internal scout as a helper.
- The parent may ask Codex official subagents to run bounded helper work in
  parallel with SKS native workers when the user explicitly asked for
  subagents/parallel agents or when a Codex App capability lane is required.
- Codex App `$imagegen` / `gpt-image-2` can be used through the helper lane for
  generated raster evidence, but the real output still needs path, hash, byte
  size, dimensions, and model/surface proof.
- Helper scout/subagent events are recorded separately.
- Helper scout/subagent events never increase `requested_agents`,
  `target_active_slots`, `spawned_worker_process_count`, or
  `max_observed_worker_process_count`.
- Direct API image generation fallback does not count as Codex App imagegen
  evidence unless the route explicitly accepts non-Codex API fallback proof.
- Generated image reports must keep evidence classes explicit:
  `codex_app_builtin` for Codex App `$imagegen` output and `api_fallback`
  for OpenAI API fallback output.

Release gate:

```bash
npm run agent:no-subagent-scaling
npm run agent:official-subagent-helper-policy
```
