# Migration 1.18.6 to 1.18.7

SKS 1.18.7 is the ultra-stability release for the Codex 0.134 surface.

- Version metadata moves from `1.18.6` to `1.18.7`.
- Codex compatibility now targets `rust-v0.134.0` while keeping 0.133 and 0.132 as inherited baselines.
- Native agent runners can pass Codex `--profile` without dropping user profile config.
- Codex managed proxy environment keys are propagated to Codex child processes.
- Source Intelligence has a bounded local Codex conversation history search adapter.
- MCP 0.134 readiness records per-server environments, streamable HTTP OAuth evidence, advisory `readOnlyHint` concurrency, and `$ref`/`$defs` schema preservation.
- The native agent patch kernel adds queue, apply, merge, rollback, and proof artifacts for proof-safe parallel writes.
- Runtime truth matrix output moves to `.sneakoscope/reports/runtime-truth-matrix-1.18.7.json` and includes P6 closure rows.
