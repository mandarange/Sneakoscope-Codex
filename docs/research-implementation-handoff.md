# Research Implementation Handoff

Research mode does not implement code changes. It prepares a handoff for `$Team` or another execution route.

The handoff surface is:

- `implementation-blueprint.json`: structured implementation guidance.
- `implementation-blueprint.md`: human-readable version of the blueprint.
- `implementation-handoff.patch-plan.json`: empty patch plan scaffold that records source artifacts and confirms implementation is not allowed in Research.
- `team-handoff-goal.md`: follow-up goal text for the execution route.
- `decision-log.md`: route-local decisions and constraints.

Before acting on research output, the follow-up execution route should re-read `claim-evidence-matrix.json`, `source-quality-report.json`, `experiment-plan.json`, `replication-pack.json`, `research-final-review.json`, and `research-gate.evaluated.json`. A passed research gate means the artifact contract was satisfied; it does not mean the proposed implementation is already correct.
