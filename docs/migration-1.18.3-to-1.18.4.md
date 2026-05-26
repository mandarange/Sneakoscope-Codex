# Migration 1.18.3 to 1.18.4

1. Run `npm run build` after upgrading so the TypeScript runtime and `dist` stay aligned.
2. Run `npm run agent:cleanup-executor`, `npm run agent:intelligent-work-graph`, `npm run proof:fake-vs-real-policy`, and `npm run route:blackbox-realism`.
3. Use `sks agent cleanup latest --dry-run --json` before `--apply` when cleaning a real mission.
4. Use `SKS_TEST_REAL_TMUX=1 npm run agent:real-tmux-physical-proof` only when real tmux is available and a live proof is desired.
5. Use `SKS_TEST_REAL_DYNAMIC_AGENTS=1 npm run agent:real-codex-dynamic-smoke` only when real Codex workers are available and read-only live smoke is acceptable.
6. Read `fake-real-proof-policy.json` before claiming real runtime proof; fixture-only evidence remains valid for hermetic release checks but not for physical runtime claims.
