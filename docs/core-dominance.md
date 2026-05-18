# SKS Core Dominance

SKS 0.9.20 treats dominance as a trust-kernel problem, not a feature-cloning race. The core loop is:

```text
route command executed
  -> mission state transition
  -> evidence intake
  -> route gate
  -> evidence router
  -> Completion Proof
  -> proof validation
  -> trust report
```

The release target is a smaller and stronger surface:

- `sks run "task"` selects a route and materializes a mission.
- `sks status` shows active proof, trust, scout, image voxel, and DB safety status.
- `sks proof show` exposes Completion Proof.
- `sks trust report latest` explains route completion blockers.
- `sks doctor` keeps install and managed paths inspectable.

SKS does not copy every external harness role, plugin, runtime, or router idea. It strengthens the proof/evidence/safety path that decides whether a Codex task can honestly be called complete.

## Release Evidence

- Trust Kernel: `src/core/trust-kernel/`
- Evidence Router: `src/core/evidence/`
- Route proof integration: `src/core/proof/route-adapter.mjs`
- Core benchmark artifacts: `.sneakoscope/reports/performance/core-bench.json`
- Black-box matrix contract: `.sneakoscope/reports/blackbox-matrix.json`

## Status

0.9.20 is intentionally `verified_partial` for performance dominance claims unless the current machine's benchmark artifacts meet every strict p95 budget. Mock and fixture route checks are release-gated, but they do not claim live model, live browser, or live DB execution.
