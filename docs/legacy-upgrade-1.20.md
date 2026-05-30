# Legacy Upgrade → 1.20.1

Upgrading SKS from **1.18.x** or **1.19.x** to **1.20.1** is a zero-break upgrade:
no user choice, no skill card, and no codex-lb auth is ever clobbered. The gate
`scripts/legacy-upgrade-matrix-check.mjs` (id `legacy:upgrade-zero-break`) proves
every guarantee below on temp dirs and writes
`.sneakoscope/reports/legacy-upgrade-matrix.json`.

## Upgrade guarantees

- **User model / service_tier / effort preserved.** Your global Codex config
  (`~/.codex/config.toml`) `model`, `service_tier`, and `model_reasoning_effort`
  are read-only to the installer. Managed defaults are applied set-if-absent only.
- **User-disabled app feature / plugin not re-enabled.** A feature you turned off
  (e.g. `browser_use = false`) stays off — the installer never re-enables it.
- **Corrupted config backed-up + repaired.** A config where machine-local keys were
  absorbed into a TOML table is hoisted back above the first table header, and the
  prior file is backed up before any write.
- **codex-lb auth untouched.** Login, token, and provider auth are never read,
  rewritten, or reset during the upgrade (`codex_lb_auth` is a confirmation-required
  mutation, denied by default — see `docs/side-effect-zero-policy.md`).
- **tmux is a removed runtime — no fallback.** `sks tmux` reports
  `removed_runtime → zellij` and exits non-zero; there is no silent tmux fallback.
- **Zellij required for interactive runs.** `sks zellij status` is informational
  (it does not hard-fail when Zellij is missing), but interactive multi-agent runs
  require Zellij as the only supported terminal multiplexer.
- **Existing skill cards preserved as immutable snapshots.** Deployed skill cards
  are immutable snapshots keyed by `body_hash`; an upgrade reads them but never
  clobbers, re-versions, or edits them in place.
- **Clean 1.19.x config is a no-op.** A 1.19.x config with no machine-local issues
  is left byte-identical (`structure_ok`); the upgrade makes no change and writes
  no backup.
- **Migration journal.** Every config mutation during the upgrade is recorded to
  `.sneakoscope/reports/migration-1.20.1-journal.jsonl` with before/after hashes,
  a `changed` flag, and a `rollback_available` flag.

## States verified by the gate

| State | Guarantee |
| --- | --- |
| `corrupted_config` | Machine-local keys hoisted above the first table; prior config backed up. |
| `user_config_preserved` | User `model` / `service_tier` / `model_reasoning_effort` untouched; backup written on update. |
| `flags_not_reenabled` | User-disabled app feature (`browser_use = false`) not re-enabled. |
| `splitter_preserves_project` | Project-scoped keys/tables preserved; only machine-local keys moved out. |
| `tmux_removed_runtime` | `sks tmux` → `removed_runtime` / `zellij`, exit code 2. |
| `zellij_status_informational` | `sks zellij status` informational (`ok: true`), never a hard fail. |
| `migration_journal` | Mutated event has before/after hashes + `changed` + `rollback_available`; no-op event has neither. |
| `1.19.x_zellij_project_noop` | Clean 1.19.x config → `structure_ok`, byte-identical, no backup. |
| `existing_skill_cards_preserved` | Deployed skill card snapshot is byte-preserved (same `body_hash`) across an upgrade read. |
