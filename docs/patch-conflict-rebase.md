# Patch Conflict Rebase

SKS 1.18.10 adds `agent-patch-conflict-rebase-results.json` as the serial conflict executor proof for patch swarm missions.

The merge coordinator still identifies disjoint parallel groups first. When it also reports serial merge groups, the rebase executor receives the pending queue entries plus merge evidence and attempts safe serial re-application for same-file conflicts, subtree conflicts, and stale-context patches. Domain conflicts stay blocked unless policy explicitly allows a domain retry. Protected paths, unleased paths, dirty unrelated changes, and unreconcilable patch operations remain blockers.

The result artifact records attempt count, succeeded entry ids, failed entry ids, blocked entry ids, per-entry apply results, blockers, and latency. Patch proof consumes this artifact through `conflict_rebase`; a failed or blocked rebase row prevents the final proof from claiming the conflict was resolved.
