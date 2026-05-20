# Codex CLI Compatibility

SKS 1.0.8 targets the OpenAI Codex CLI `rust-v0.132.0` runtime compatibility baseline. The hook surface intentionally remains pinned to the vendored `rust-v0.131.0` generated hook schemas plus the stricter SKS zero-warning strict subset, because 1.0.8 adds runtime capability detection rather than inventing a new hook schema. The release gate validates generated JSON schemas, upstream semantic unsupported cases, and the stricter SKS zero-warning subset separately. SKS does not claim to mirror every Codex runtime parser rule exactly; it validates the upstream schema and then intentionally rejects additional warning-prone shapes.

Computer Use and codex-lb compatibility notes are bounded: Computer Use live evidence can be `probe_only`, `live_capture_success`, or a structured blocker depending on the local Codex App/macOS capability, and codex-lb can be durable or `process_only_ephemeral` depending on setup choices. Recovery commands are `sks computer-use smoke --json` for a probe-only status and `sks codex-lb setup --write-env-file --keychain --launchctl` for durable persistence. Local screenshots and secrets stay private/redacted by default.

## Checks

```bash
sks codex compatibility --json
sks codex version --json
sks codex doctor --json
sks codex schema --json
npm run codex:0.132-compat
npm run codex:output-schema-fixture
sks hooks codex-validate --json
sks hooks warning-check --json
npm run hooks:semantic-check
npm run hooks:strict-subset-check
```

Version detection checks `codex --version`, `codex exec resume --help`, `codex --help`, installed `@openai/codex`, Homebrew cask metadata, and finally the vendored snapshot metadata. A missing live Codex binary is `integration_optional`; release hook validation uses the vendored snapshot, not the local binary.

## Codex 0.132 Capabilities

The 1.0.8 compatibility matrix records these capability ids:

- `exec_resume_output_schema`: preferred structured output for Scout, UX-Review callout extraction, Completion Proof, and Wrongness artifacts.
- `app_server_image_fidelity`: original-resolution image metadata for UX-Review source screenshots, generated callout images, and Image Voxel coordinate alignment.
- `memory_summary_version_rebuild`: schema-versioned TriWiki, Wrongness, and shared memory summaries with rebuild commands.
- `goal_continuation_blocker_stop`: repeated blocker and usage-limit stops for Goal, QA, Research, and UX-Review loops.
- `tui_probe_batching`: batchable doctor/probe inventory with timeout budgets.
- `remote_executor_standard_auth`, `python_sdk_auth`, and `python_sdk_turn_result`: P1 warning-only review items unless a route explicitly uses those SDK surfaces.

Unknown newer Codex fields are warning-only. Codex versions below 0.132 are degraded but supported, and output-schema fallbacks cannot support claims above `verified_partial`.

## Vendored Snapshot

The release ships upstream generated hook schemas under:

```text
src/vendor/openai-codex/rust-v0.131.0/hooks/
```

The snapshot includes input/output schemas for `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `SessionStart`, `UserPromptSubmit`, and `Stop`. Snapshot metadata records upstream repo, tag, commit, and capture time; every release check confirms all 16 schema files exist and parse as JSON.

SKS hook outputs must use Codex camelCase fields such as `hookSpecificOutput`, `stopReason`, `suppressOutput`, `systemMessage`, `permissionDecision`, `permissionDecisionReason`, `additionalContext`, and `updatedInput`. Snake_case or legacy top-level hook fields are release-blocking `legacy_shape` patterns.

## Validation Categories

- `schema_violation`: the output violates the vendored upstream JSON schema.
- `upstream_semantic_unsupported`: the upstream runtime parser currently fails closed or treats the shape as unsupported.
- `sks_zero_warning_disallowed`: upstream may accept the shape, but SKS bans it to keep release fixtures warning-free and consistent.
- `legacy_shape`: old top-level or snake_case output shape.
- `policy_disallowed`: an SKS trust policy or config policy rejected the output.

## Runtime Semantic Rules

- PreToolUse deny uses `hookSpecificOutput.permissionDecision:"deny"` with non-empty `permissionDecisionReason`.
- PreToolUse simple allow is `{ "continue": true }`; `permissionDecision:"allow"` is allowed only with `updatedInput`.
- PreToolUse `permissionDecision:"ask"`, `continue:false`, `stopReason`, and `suppressOutput:true` are fatal.
- PermissionRequest uses only `hookSpecificOutput.decision.behavior`; deny requires a non-empty `message`.
- PermissionRequest `updatedInput`, `updatedPermissions`, `interrupt:true`, `continue:false`, `stopReason`, and `suppressOutput:true` are fatal.
- PostToolUse and UserPromptSubmit blocks require non-empty `reason`; PostToolUse `updatedMCPToolOutput` is fatal.
- Stop block is `{ "continue": true, "decision": "block", "reason": "..." }`; Stop `continue:false` and `stopReason` are fatal in release fixtures.
- PreCompact and PostCompact emit `{ "continue": true }`.

SKS strict-subset examples:

- PreToolUse `additionalContext` is schema-compatible but `sks_zero_warning_disallowed`.
- PermissionRequest allow `message` is schema-compatible but `sks_zero_warning_disallowed`.
- Optional `systemMessage` in routes that should not emit user-visible output is policy-sensitive and must be justified before use.

`allow_managed_hooks_only = true` belongs in `requirements.toml`, not `config.toml`.

## Release Invariant

`npm run release:check` runs:

```bash
npm run codex:compat
npm run codex:0.132-compat
npm run codex:output-schema-fixture
npm run hooks:codex-validate
npm run hooks:warning-check
npm run hooks:semantic-check
npm run hooks:strict-subset-check
```

Hook warning count must be `0`.
