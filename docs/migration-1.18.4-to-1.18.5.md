# Migration 1.18.4 to 1.18.5

SKS 1.18.5 is a runtime-truth hardening release.

- Version metadata moves from `1.18.4` to `1.18.5`.
- Real tmux proof now writes lifecycle artifacts for before-drain, after-drain, and final phases.
- `release:real-check` includes v2 tmux and Codex smoke gates while preserving honest `integration_optional` defaults.
- `SKS_REQUIRE_REAL_TMUX=1` and `SKS_REQUIRE_REAL_DYNAMIC_AGENTS=1` convert optional live-runtime gaps into blockers.
- Cleanup proof schema is now `sks.agent-cleanup-proof.v2` and includes process-tree, SIGTERM, SIGKILL, and verified-exit evidence.
- Intelligent work graph schema is now `sks.intelligent-work-graph.v2` and includes AST/import/test ownership maps.
- Fake-real proof policy schema is now `sks.fake-real-proof-policy.v2` and adds `fixture_instrumented_real` plus `real_required_missing`.

Recommended verification:

```bash
npm run build
npm run agent:tmux-physical-lifecycle-wired
npm run agent:tmux-physical-proof-v2
npm run agent:cleanup-executor-v2
npm run agent:cleanup-command-ux
npm run agent:ast-aware-work-graph
npm run proof:fake-real-policy-v2
npm run release:runtime-truth-matrix
npm run release:metadata
```
