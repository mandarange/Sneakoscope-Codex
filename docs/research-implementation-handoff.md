# Research Implementation Handoff

Research mode does not implement code changes. It prepares a handoff for `$Naruto` or another current execution route.

The handoff surface is:

- `implementation-blueprint.json`: structured implementation guidance.
- `implementation-blueprint.md`: human-readable version of the blueprint.
- `implementation-handoff.patch-plan.json`: empty patch plan scaffold that records source artifacts and confirms implementation is not allowed in Research.
- `naruto-handoff-goal.md`: follow-up goal text for the current execution route.
- `decision-log.md`: route-local decisions and constraints.

Before acting on research output, the follow-up execution route should re-read `source-ledger.json`, `claim-evidence-matrix.json`, `source-quality-report.json`, `implementation-blueprint.json`, `experiment-plan.json`, `replication-pack.json`, `research-final-review.json`, and `research-gate.evaluated.json`.

The handoff must contain context, key claims, evidence summary, implementation blueprint, at least four parallel work items, acceptance tests, rollback guidance, and a source appendix. Every work item should include a file list or an explicit blocker. `$Naruto` can consume `naruto-handoff-goal.md` as the next goal, then revalidate current code before modifying files. A passed research gate means the artifact contract was satisfied; it does not mean the proposed implementation is already correct.
