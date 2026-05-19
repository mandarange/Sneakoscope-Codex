# Codex App Hooks and PAT Evidence

SKS hook replay uses the same shared hook policy path as runtime hooks. Fixture replay compares the runtime decision against strict expected snapshots and redacts token-shaped values with `[redacted]`.

Core commands:

```sh
sks hooks trust-report --json
sks hooks replay test/fixtures/hooks/pre-tool-db-drop.json --json
sks hooks codex-schema --json
sks hooks codex-validate --json
sks hooks warning-check --json
sks hooks replay-codex-fixtures --json
sks codex-app pat status --json
```

## Codex `rust-v0.131.0` Hook Shape

SKS 1.0.4 validates Codex hook output against vendored OpenAI Codex CLI `rust-v0.131.0` generated schemas in `src/vendor/openai-codex/rust-v0.131.0/hooks/`.

Supported event names are `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `SessionStart`, `UserPromptSubmit`, and `Stop`.

Command hook config must use the upstream handler fields `command`, `commandWindows` or `command_windows`, `timeout`, `async`, and `statusMessage`. `allow_managed_hooks_only = true` is valid only in `requirements.toml`; SKS must not write it to `config.toml`.

Output uses camelCase Codex fields. Examples:

```json
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "SKS policy blocked the requested command."
  }
}
```

```json
{
  "continue": false,
  "stopReason": "SKS Completion Proof missing",
  "decision": "block",
  "reason": "SKS serious route cannot finalize without valid Completion Proof."
}
```

Snake_case output keys, legacy top-level `permissionDecision`, PermissionRequest reserved fields, unsupported config fields, and Stop blocks without a reason are release-blocking warning patterns.

PAT and access-token policy:

- `CODEX_ACCESS_TOKEN`, `OPENAI_API_KEY`, `CODEX_LB_API_KEY`, GitHub tokens, `sk-*`, `sk-proj-*`, `sk-clb-*`, and bearer tokens must never appear in plaintext artifacts.
- Hook replay output records `secret_policy: "redacted"`.
- Codex App PAT status reports only presence/redacted state, not token contents.

Strict replay supports exact `decision`, `permissionDecision`, `gate`, and `continue` matching plus `reason_contains`, `missing_contains`, and `issues_contains`. Stop fixtures cover missing proof, invalid proof, missing visual anchors, valid visual anchors, and app git/settings events.
