# Doctor Production Repair

SKS 3.1.13 hardens `sks doctor --fix` around structured repair artifacts, phase-level postchecks, and scoped rollback evidence.

- Secret-bearing config mutations run inside `withSecretPreservationGuard`.
- Protected Supabase and MCP tokens are compared by hash, including value changes and empty values.
- If a protected value is deleted or changed, the guard restores changed assignment lines when possible, writes rollback evidence, and fails the operation without discarding unrelated edits.
- Startup config repair mutates only managed `[agents.*]` TOML blocks, rewrites stale `config_file` paths to absolute managed files, recreates missing managed files from real role templates, and removes unsupported managed role fields.
- Startup postcheck validates managed config paths, TOML table syntax smoke, and orphan MCP child tables.
- Context7 MCP repair migrates safe stdio config to the remote endpoint while preserving explicitly disabled servers and recording remote-probe status.
- Supabase MCP repair keeps unset `SUPABASE_ACCESS_TOKEN` as precise manual-required evidence for write features, migrates unsafe write config to read-only when applicable, and separates write-scope confirmation from readiness.
- `doctor-fix-transaction.json` records phase start/end/duration, required-for-ready, optional manual follow-up, rollback, and postcheck state without raw secrets.
