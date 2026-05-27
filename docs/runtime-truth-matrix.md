# Runtime Truth Matrix 1.18.6

SKS 1.18.6 writes `sks.runtime-truth-matrix.v1` to `.sneakoscope/reports/runtime-truth-matrix-1.18.6.json`.

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

`SKS_REQUIRE_REAL_TMUX=1`, `SKS_REQUIRE_REAL_DYNAMIC_AGENTS=1`, and `SKS_REQUIRE_WARP_MAD_LANES=1` turn optional missing live evidence into required blockers. Without those envs, unavailable live runtimes are reported as `integration_optional` instead of being promoted to proven evidence.

Run:

```bash
npm run release:runtime-truth-matrix
```

The release readiness report reads the same artifact and surfaces the rows under `runtime_truth_1_18_6.subsystem_rows`.
