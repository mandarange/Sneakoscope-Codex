# Codex CLI Compatibility

SKS 1.0.4 targets OpenAI Codex CLI `rust-v0.131.0` and treats that tag as the hook/config compatibility baseline.

## Checks

```bash
sks codex compatibility --json
sks codex version --json
sks codex doctor --json
sks codex schema --json
sks hooks codex-validate --json
sks hooks warning-check --json
```

Version detection checks `codex --version`, `codex --help`, installed `@openai/codex`, Homebrew cask metadata, and finally the vendored snapshot metadata. A missing live Codex binary is `integration_optional`; release hook validation uses the vendored snapshot, not the local binary.

## Vendored Snapshot

The release ships upstream generated hook schemas under:

```text
src/vendor/openai-codex/rust-v0.131.0/hooks/
```

The snapshot includes input/output schemas for `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `SessionStart`, `UserPromptSubmit`, and `Stop`.

SKS hook outputs must use Codex camelCase fields such as `hookSpecificOutput`, `stopReason`, `suppressOutput`, `systemMessage`, `permissionDecision`, `permissionDecisionReason`, `additionalContext`, and `updatedInput`. Snake_case or legacy top-level hook fields are release-blocking warning patterns.

`allow_managed_hooks_only = true` belongs in `requirements.toml`, not `config.toml`.

## Release Invariant

`npm run release:check` runs:

```bash
npm run codex:compat
npm run hooks:codex-validate
npm run hooks:warning-check
```

Hook warning count must be `0`.
