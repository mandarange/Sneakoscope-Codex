# Upgrade Reconciliation

SKS upgrades preserve user configuration while reconciling installed files to the current public surface.

## Guarantees

1. User-selected model, service tier, reasoning effort, feature flags, plugin settings, and MCP configuration are preserved unless the user explicitly authorizes a scoped change.
2. Invalid generated configuration is backed up before structural repair, and repair is verified by loading the resulting configuration.
3. Current official subagent defaults are merged without overwriting valid explicit project or global values.
4. SKS-owned retired skills, roles, runtime artifacts, state fields, reports, and generated bridge entries are removed rather than redirected.
5. A user-authored path that collides with a managed cleanup target is quarantined and recorded instead of deleted.
6. Update migration fails closed when managed residue remains, cleanup errors occur, or current command/catalog validation fails.

## Operator commands

```bash
sks doctor --json
sks doctor --fix --yes --json
sks update check --json
sks update now --json
sks update rollback --json
```

`sks commands --json` and `sks dollar-commands --json` are the authoritative post-upgrade catalogs. Cleanup reports provide counts, ownership decisions, quarantine totals, and blockers without republishing retired command names.
