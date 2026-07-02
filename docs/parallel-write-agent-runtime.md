# Parallel Write Agent Runtime

SKS 1.18.11 route flags are runtime inputs, not proof by themselves.

The relevant flags are:

```bash
sks agent run "task" --agents 5 --work-items 10 --write-mode parallel --apply-patches
sks naruto run "task" --clones 5 --work-items 10 --write-mode parallel --apply-patches
sks dfix "task" --agents 5 --work-items 10 --write-mode parallel --apply-patches
```

`--write-mode parallel` requests disjoint patch grouping. `--apply-patches` allows the apply worker to write to the route root. `--dry-run-patches` keeps the same queue, merge, verification, and rollback proof path while leaving files unchanged.

A route does not pass because the flags were recorded. It passes only when patch envelopes are generated, central queue artifacts exist, merge coordination groups independent patches or serial rebase attempts, apply results are verified, transaction journal proof is complete, rollback proof is ready, and `agent-proof-evidence.json` has no patch blockers.

For rollback inspection, use:

```bash
sks agent rollback-patches latest --dry-run --json
sks agent rollback-patches latest --apply --json
```
