# Runtime Truth Matrix 1.18.7

SKS 1.18.7 writes `sks.runtime-truth-matrix.v1` to `.sneakoscope/reports/runtime-truth-matrix-1.18.7.json`.

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
- `parallel_write`
- `patch_proof`
- `cleanup_v4`
- `ast_type_work_graph`
- `warp_mad_right_lanes`

`SKS_REQUIRE_REAL_TMUX=1`, `SKS_REQUIRE_REAL_DYNAMIC_AGENTS=1`, and `SKS_REQUIRE_WARP_MAD_LANES=1` turn optional missing live evidence into required blockers. Without those envs, unavailable live runtimes are reported as `integration_optional` instead of being promoted to proven evidence.

Run:

```bash
npm run release:runtime-truth-matrix
```

The release readiness report reads the same artifact and surfaces the rows under `runtime_truth_1_18_7.subsystem_rows`, with P6 representing Codex 0.134 and parallel write proof closure.
