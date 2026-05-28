# Runtime Truth Matrix 1.18.10

SKS 1.18.10 writes `sks.runtime-truth-matrix.v1` to `.sneakoscope/reports/runtime-truth-matrix-1.18.10.json`.

The matrix is generated from current proof artifacts, not from a static release table. It records each subsystem with `proof_level`, `evidence_artifacts`, `blockers`, `next_action`, and `required_mode`.

Required rows:

- `tmux_physical`
- `codex_dynamic`
- `cleanup`
- `intelligent_work_graph`
- `source_intelligence`
- `goal_mode`
- `route_blackbox`
- `dynamic_scheduler`
- `warp_mad_lanes`
- `codex_0_134`
- `mcp_0_134`
- `adhd_orchestration`
- `appshots`
- `parallel_write`
- `patch_proof`
- `native_cli_session_swarm`
- `fast_mode_default`
- `cleanup_v4`
- `ast_type_work_graph`
- `warp_mad_right_lanes`

`SKS_REQUIRE_REAL_TMUX=1`, `SKS_REQUIRE_REAL_DYNAMIC_AGENTS=1`, and `SKS_REQUIRE_WARP_MAD_LANES=1` turn optional missing live evidence into required blockers. Native CLI Session Swarm and Fast mode rows become `proven` only from current proof artifacts such as `native-cli-session-proof.json`, `agent-native-cli-session-swarm.json`, and `fast-mode-propagation-proof.json`; they are not inferred from route flags or subagent events.

Run:

```bash
npm run release:runtime-truth-matrix
```

The release readiness report reads the same artifact and surfaces the rows under `runtime_truth_1_18_8.subsystem_rows`, with P9 representing Native CLI Session Swarm and Fast mode default closure.
