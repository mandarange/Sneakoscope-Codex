# Migration 1.18.5 to 1.18.6

SKS 1.18.6 is a zero-gap runtime truth closure release.

- Version metadata moves from `1.18.5` to `1.18.6`.
- Runtime truth matrix output moves to `.sneakoscope/reports/runtime-truth-matrix-1.18.6.json`.
- Real Codex dynamic smoke output moves to `.sneakoscope/reports/agent-real-codex-dynamic-smoke-1.18.6.json`.
- Real tmux physical proof output moves to `.sneakoscope/reports/agent-real-tmux-physical-proof-1.18.6.json`.
- Trust reports now expose `proof_level_by_subsystem` and the runtime truth matrix artifact link when present.
- MAD-SKS now writes explicit Warp/tmux lane UI proof instead of relying on implied terminal visibility.
- Cleanup executor v2 records verified process tree, SIGTERM/SIGKILL, tmux pane, temp dir, and lock after-states.

Recommended verification:

```bash
npm run build
npm run proof:fake-real-policy-v2
npm run agent:cleanup-executor-v2
npm run agent:ast-aware-work-graph
npm run release:runtime-truth-matrix
npm run release:metadata
npm run release:readiness
```
