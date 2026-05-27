# Strategy-First Parallel Write

SKS 1.18.8 requires a concrete strategy pass before proof-safe write agents run. The compiler emits:

- `user-request-strategy.json`
- `parallel-modification-plan.json`
- `file-ownership-plan.json`
- `verification-rollback-dag.json`
- `strategy-gate.json`

The strategy gate checks file ownership overlap, rollback readiness, Appshots requirements for visual work, and scheduler permission. Parallel write claims are allowed only when the merge coordinator can show non-overlapping path batches and serial conflicts are explicit.

Run:

```bash
npm run strategy:parallel-modification-plan
npm run strategy:file-ownership-plan
npm run strategy:verification-rollback-dag
npm run agent:parallel-write-kernel
```
