# Doctor Production Repair

SKS 3.1.12 hardens `sks doctor --fix` around structured repair artifacts.

- Secret-bearing config mutations run inside `withSecretPreservationGuard`.
- Protected Supabase and MCP tokens are compared by hash, including value changes and empty values.
- If a protected value is deleted or changed, the guard restores the source file from backup, writes rollback evidence, and fails the operation.
- Startup config repair rewrites stale agent `config_file` paths to absolute files, recreates missing managed files, and removes unsupported managed role fields.
- Context7 MCP repair migrates safe stdio config to the remote endpoint while preserving explicitly disabled servers.
- Supabase MCP repair keeps unset `SUPABASE_ACCESS_TOKEN` as precise manual-required evidence for write features instead of globally blocking unrelated readiness.
- `doctor-fix-transaction.json` records the production phase ledger and postcheck state without raw secrets.
