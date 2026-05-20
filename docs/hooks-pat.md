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

SKS 1.0.7 validates Codex hook output against vendored OpenAI Codex CLI `rust-v0.131.0` generated schemas and a category-aware semantic validator in `src/core/codex-compat/codex-hook-semantic-validator.ts`. The validator is an upstream-schema baseline plus an SKS zero-warning strict subset, not a claim that SKS mirrors every upstream runtime parser rule exactly.

This page is documentation-only evidence: it distinguishes probe/mock/live evidence, avoids universal Computer Use availability claims, and keeps PAT/secret handling private and redacted. For recovery, run `sks hooks warning-check --json`, `sks computer-use smoke --json`, or `sks codex-lb setup --write-env-file --keychain --launchctl` depending on the failing surface.

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
  "continue": true,
  "decision": "block",
  "reason": "SKS serious route cannot finalize without valid Completion Proof."
}
```

Snake_case output keys, legacy top-level `permissionDecision`, PermissionRequest reserved fields, unsupported config fields, PreToolUse `permissionDecision:"ask"`, PreToolUse `allow` without `updatedInput`, Stop `continue:false`, Stop `stopReason`, and Stop blocks without a reason are release-blocking warning patterns. `sks hooks warning-check --json` reports them by `schema_violation`, `upstream_semantic_unsupported`, `sks_zero_warning_disallowed`, `legacy_shape`, and `policy_disallowed`.

Strict-subset examples include PreToolUse `additionalContext` and PermissionRequest allow `message`: upstream schema may allow them, but SKS rejects them to preserve a zero-warning release surface.

PreToolUse simple allow is:

```json
{
  "continue": true
}
```

PreToolUse rewrite is:

```json
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "updatedInput": {
      "command": "npm test"
    }
  }
}
```

PAT and access-token policy:

- `CODEX_ACCESS_TOKEN`, `OPENAI_API_KEY`, `CODEX_LB_API_KEY`, GitHub tokens, `sk-*`, `sk-proj-*`, `sk-clb-*`, and bearer tokens must never appear in plaintext artifacts.
- Hook replay output records `secret_policy: "redacted"`.
- Codex App PAT status reports only presence/redacted state, not token contents.

Strict replay supports exact `decision`, `permissionDecision`, `gate`, and `continue` matching plus `reason_contains`, `missing_contains`, and `issues_contains`. Stop fixtures cover missing proof, invalid proof, missing visual anchors, valid visual anchors, and app git/settings events.
