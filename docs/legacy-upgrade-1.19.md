# Legacy upgrade: 1.18.x → 1.19.1

SKS 1.19.1 guarantees that upgrading from any 1.18.x install never breaks an
existing user Codex configuration. The canonical `migration:upgrade-safety` gate
(`scripts/legacy-upgrade-matrix-check.mjs`) proves each guarantee below against a
matrix of legacy config states, using throwaway temp dirs — it never touches the
real `~/.codex`.

## Guarantees

1. **User scalars are never overwritten.** `model`, `service_tier`, and
   `model_reasoning_effort` set by the user at the top level of
   `~/.codex/config.toml` are preserved verbatim. SKS only supplies a default
   when the key is absent (set-if-absent).

2. **User-disabled App flags are never re-enabled.** Codex App feature/plugin
   flags follow set-if-absent semantics: a fresh config still receives SKS's
   defaults, but a feature the user disabled in the App (e.g.
   `[features] browser_use = false`) stays disabled. Plugin auto-enable is
   strictly opt-in — set `SKS_MANAGE_CODEX_APP_PLUGINS=1` to let SKS manage the
   `[plugins."name@marketplace"]` tables; otherwise SKS leaves `[plugins]`
   untouched.

3. **Corrupted configs are backed up, then structurally repaired.** A pre-1.19
   mover could append machine-local top-level keys (e.g. `model_provider`,
   `notify`) after the last `[table]`, so TOML absorbed them into that table
   (commonly `[mcp_servers.*.env]`), which Codex rejects. `sks doctor --fix`
   runs `repairCodexConfigStructure`, which backs the file up and hoists the
   misplaced keys back above the first table header so Codex can load it again.

4. **Every mutation is journaled.** Each config mutation during an upgrade or
   `sks doctor --fix` is appended to
   `.sneakoscope/reports/migration-1.19-journal.jsonl` with a before-hash,
   after-hash, and backup path, so every change is auditable and reversible.
   No-op events record `changed: false` / `rollback_available: false`.

5. **tmux is a removed runtime.** SKS no longer ships a tmux runtime. `sks tmux`
   reports `removed_runtime` → `zellij` and exits with code 2. Install Zellij
   with `brew install zellij` (macOS); SKS never auto-installs it.

6. **Gate: `migration:upgrade-safety`.** The gate emits a passing result and
   writes a summary to `.sneakoscope/reports/legacy-upgrade-matrix.json` only
   when every legacy state below holds.

## Legacy states covered

| State | Scenario | Proof |
|-------|----------|-------|
| Corrupted config | machine-local keys absorbed into a `[mcp_servers.*.env]` table | `repairCodexConfigStructure({ apply: true })` backs up and hoists keys above the first table header |
| User config preserved | top-level `model` / `service_tier` / `model_reasoning_effort` | `ensureGlobalCodexFastModeDuringInstall` leaves user scalars intact |
| Flags not re-enabled | `[features] browser_use = false` | set-if-absent never re-enables a user-disabled feature |
| Splitter preserves project | `.codex/config.toml` with `[profiles.sks-default]` + machine-local `notify` | `splitCodexProjectConfigPolicy({ apply: true })` keeps the project profile table; only machine-local keys move out |
| tmux removed runtime | `sks tmux --json` | `status: "removed_runtime"`, `replacement: "zellij"`, exit code 2 |
| Zellij status informational | `sks zellij status --json` | reports a `status` field with `ok: true` when Zellij is missing (informational, not a hard fail) |
| Migration journal | `buildMigrationEvent(...)` | mutated event has distinct before/after hashes + `rollback_available: true`; no-op event has `changed: false` |

## Operator commands

- Recover a corrupted Codex config: `sks doctor --fix`
- Inspect the Zellij runtime: `sks zellij status`
- Install Zellij (macOS): `brew install zellij`
- Roll back a journaled patch: `sks agent rollback-patches`
