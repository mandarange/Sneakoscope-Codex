# Patch Transaction Journal

SKS 1.18.11 writes `agent-patch-transaction-journal.jsonl` for patch swarm missions and summarizes it in `agent-patch-transaction-journal-summary.json`.

The journal is append-only and records each patch entry lifecycle: enqueue, lock acquire/release, apply start/finish, verification start/finish, rollback dry-run start/finish, and final status. Events carry entry, agent, lease, changed files, before/after hashes, rollback digest, verification status, duration, and violations when present.

Patch proof links the journal summary through `transaction_journal`; Trust Report links the same summary so a human can follow the queue-to-apply-to-rollback chain without reading raw logs. A changed patch entry that is missing lifecycle coverage blocks the journal summary and therefore blocks final patch proof.
