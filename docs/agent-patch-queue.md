# Agent Patch Queue

The 1.18.8 patch queue remains in-memory for route-local proof-safe patch application, but each entry now records created/updated times and every state transition in an append-only event list. Queue JSON includes an `ownership_ledger` that binds agents, leases, and write paths.

Supported operations:

- `replace`
- `write`
- `unified_diff`

The apply worker records before/after hashes, rollback content for existing files, rollback digests, and verification status. A blocked operation prevents partial mutation.
