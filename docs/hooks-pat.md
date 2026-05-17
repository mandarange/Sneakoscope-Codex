# Codex App Hooks and PAT Evidence

SKS hook replay uses the same shared hook policy path as runtime hooks. Fixture replay compares the runtime decision against strict expected snapshots and redacts token-shaped values with `[redacted]`.

Core commands:

```sh
sks hooks trust-report --json
sks hooks replay test/fixtures/hooks/pre-tool-db-drop.json --json
sks codex-app pat status --json
```

PAT and access-token policy:

- `CODEX_ACCESS_TOKEN`, `OPENAI_API_KEY`, `CODEX_LB_API_KEY`, GitHub tokens, `sk-*`, `sk-proj-*`, `sk-clb-*`, and bearer tokens must never appear in plaintext artifacts.
- Hook replay output records `secret_policy: "redacted"`.
- Codex App PAT status reports only presence/redacted state, not token contents.

Strict replay supports exact `decision`, `permissionDecision`, `gate`, and `continue` matching plus `reason_contains`, `missing_contains`, and `issues_contains`. Stop fixtures cover missing proof, invalid proof, missing visual anchors, valid visual anchors, and app git/settings events.
