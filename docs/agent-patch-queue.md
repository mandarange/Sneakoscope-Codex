# Agent Patch Queue

The 1.18.10 patch queue persists route-local proof-safe patch application, and each entry records created/updated times plus every state transition in an append-only event list. Queue JSON includes an `ownership_ledger` that binds agents, leases, strategy task or micro-win ids, verification nodes, rollback nodes, and write paths.

Supported operations:

- `replace`
- `write`
- `unified_diff`

The apply worker records before/after hashes, rollback content for existing files, rollback digests, lockfile evidence, and verification status. A blocked operation prevents partial mutation. The transaction journal mirrors the queue lifecycle so final proof can reject pending entries, missing strategy references, missing verification/rollback refs, or applied patches without rollback proof.
