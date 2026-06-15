# Secret Preservation

SKS 3.1.10 protects Supabase and secret-like config values across setup, update, and doctor repair paths.

Protected surfaces include common Supabase environment keys, Supabase JSON config paths, and Supabase MCP config keys. Secret snapshots record:

- key name
- source path
- present/missing state
- hash-only redacted preview
- SHA-256 fingerprint

Raw secret values are never written to reports.

`withSecretPreservationGuard(root, operationName, fn)` captures a before snapshot, backs up every secret-bearing source, runs the operation, captures an after snapshot, and compares both missing and changed value hashes. If a previously present protected value disappears or changes, the guard restores affected files from `.sneakoscope/backups/secrets/<operation>/<timestamp>/`. Rollback success is recorded; rollback failure hard-fails the operation.

Nested guards reuse the active outer transaction, so `doctor --fix` can wrap setup, config repair, app UI repair, Zellij repair, native repair, and capability repair in one secret-preservation boundary.

Relevant gates:

```bash
npm run secret:preservation
npm run config:managed-merge
npm run secret:preservation-guard
npm run secret:supabase-preservation-blackbox
npm run update:preserves-supabase-keys
npm run update:secret-preservation-guard
```
