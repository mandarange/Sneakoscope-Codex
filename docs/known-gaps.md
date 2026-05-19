# Known Gaps

## 1.0.4 Known Gaps

No P0 blocker is intentionally left open for Codex CLI `rust-v0.131.0` hook schema validation, hook warning-zero release gates, codex-lb setup/missing-env prevention, or Computer Use/MAD-SKS policy separation.

Bounded claims:

- A local Codex CLI older than `0.131.0` reports `compatibility_degraded`; release hook validation still uses the vendored `rust-v0.131.0` snapshot.
- Live Computer Use availability depends on Codex App and macOS permissions. If the official capability is blocked or unavailable, SKS records the status and does not fabricate UI evidence.
- codex-lb health checks can still report structured network/auth blockers; the fixed invariant is that raw missing `CODEX_LB_API_KEY` messages and secret leaks are release failures.
- The 1.0.4 black-box fixtures validate warning-zero and no forbidden wording; broader real-world Codex App/OS capability permutations remain environment-dependent.

0.9.20 strengthens the core trust kernel, but these claims remain bounded:

- Real model/scout speedup is not claimed unless `real_parallel=true`, parsed outputs are present, and benchmark artifacts pass.
- Fixture and mock route completions are `verified_partial`, not live production evidence.
- `sks bench blackbox` records the budget surface; full package install execution still lives in `npm run blackbox:check` and `npm run blackbox:matrix` with `SKS_REAL_BLACKBOX_MATRIX=1`.
- Some older internal files remain extraction candidates. `npm run architecture:check` warns on files over 1500 lines and fails on 3000-line split-review risk in active `src/`.
- Rust acceleration is optional. JS fallback parity remains the release requirement unless `--require-native` is used.
- Feature quality improved to zero missing fixtures and lower static contracts, but `runtime_mock_verified >= 45` remains a P1 target rather than a 0.9.20 P0 claim.

Static contracts are not runtime verification. They document expected behavior and must be promoted through executable fixtures before being used as completion proof.
# 1.0.3 Known Gaps

No P0 stable-release blocker is intentionally left open for TypeScript-built `dist` runtime, actual typed command registry, package boundary, command import smoke, `sks run --execute`, strict TypeScript suppression gates, feature quality, architecture hard-fail, performance tiers, or Trust Kernel stale/mock/static blocking.

Remaining non-P0 work:

- Broaden DB safety fixture volume and SQL parser edge cases beyond the current release gate.
- Add more native/Rust acceleration paths for large Image Voxel ledgers.
- Legacy `.mjs` source files are retained only outside the published package boundary as compatibility/reference surfaces; the package runtime and command import closure are TypeScript-built `.js` under `dist`.
- Wrongness memory now captures DB, hook, image, trust, and test negative evidence in fixtures; broader real-world classification coverage remains future work and must not be claimed as exhaustive.
- Git collaboration now validates shared memory shards and local runtime ignores, but SKS still does not auto-install Git hooks. Teams must wire `sks git precommit` into their own hook if they want automatic local enforcement.
