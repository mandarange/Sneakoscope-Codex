# DFix Evidence Loop

DFix is the bounded direct-fix route for tiny copy, config, docs, labels, spacing, translation, and simple mechanical edits. In 1.12.0 it records runtime evidence instead of only static help text, including Codex patch handoff metadata, git diff capture, verification recommendations, and rollback readiness.

The command surface is:

```bash
sks dfix diagnose --json
sks dfix plan --json
sks dfix patch --dry-run --json
sks dfix verify --command "npm run typecheck" --run --json
sks dfix rollback-plan --json
sks dfix status --json
sks dfix fixture --json
```

The fixture writes diagnosis, root cause, patch plan, patch result, verification suggestion, verification, gate, Completion Proof, and Trust Report evidence. It does not mutate source files. Real verification commands are suggested automatically, but execution requires explicit `--run` or `--verify-auto`.
