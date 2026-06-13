# Loop Merge Strategy

Loop integration merge uses a recorded strategy ladder:

1. `git apply --check`
2. `git apply`
3. `git apply --3way --check`
4. `git apply --3way`
5. `git cherry-pick --no-commit <loop-head>` when a loop commit is available
6. `git merge --no-ff --no-commit <loop-branch>` when branch merge is explicitly allowed
7. conflict handoff

Each attempt writes `strategy`, `ok`, `exit_code`, stdout/stderr tails, duration, and blockers under `integration-merge.json`. The graph proof summarizes apply, 3-way apply, cherry-pick, no-commit merge, and handoff counts.

The strategy never silently resolves conflicts with `-X ours` or `-X theirs`. Same-file edits from multiple loops block by default unless a future explicit non-overlap compatibility proof is present. Already-applied patches are detected with reverse apply checks and recorded as `already_applied` rather than failing the graph.

Binary patches are passed through `git diff --binary --full-index`; failures produce handoff blockers instead of corrupting target files.
