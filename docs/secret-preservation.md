# Secret Preservation

SKS 3.1.8 protects Supabase and secret-like config values across setup, update, and doctor repair paths.

Protected surfaces include common Supabase environment keys, Supabase JSON config paths, and Supabase MCP config keys. Secret snapshots record:

- key name
- source path
- present/missing state
- redacted preview
- SHA-256 fingerprint

Raw secret values are never written to reports.

`withSecretPreservationGuard(root, operationName, fn)` captures a before snapshot, runs the operation, captures an after snapshot, and fails with `secret_preservation_failed` if a previously present protected key disappears. Reports are written under `.sneakoscope/reports/secret-preservation-*.json`.

Relevant gates:

```bash
npm run secret:preservation
npm run config:managed-merge
npm run secret:preservation-guard
npm run secret:supabase-preservation-blackbox
npm run update:preserves-supabase-keys
```
