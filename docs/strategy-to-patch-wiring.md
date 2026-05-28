# Strategy To Patch Wiring

SKS 1.18.10 wires Strategy Compiler output into patch runtime ownership instead of treating strategy artifacts as narrative-only evidence.

The handoff is:

1. `user-request-strategy.json` stores the full strategy compile result.
2. `file-ownership-plan.json` identifies write owners, owner personas, micro-win ids, protected path checks, conflict prediction ids, verification node ids, and rollback node ids.
3. `buildAgentWorkPartition` receives the strategy ownership plan.
4. The lease planner enriches write leases with `strategy_task_id`, `micro_win_id`, `owner_agent`, `owner_persona`, `write_paths`, `protected_path_check`, `conflict_prediction_id`, `verification_node_id`, and `rollback_node_id`.
5. Patch envelopes and queue entries carry lease metadata forward into merge, apply, verification, rollback, dashboard, and final proof artifacts.
6. Work slices are also enriched with the strategy verification and rollback nodes, so patch envelopes emitted by worker backends reference nodes that exist in `verification-rollback-dag.json`.

Missing strategy artifacts, overlapping ownership, or protected write targets block write-capable routes before the scheduler starts.
