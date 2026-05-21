# DFix Evidence Loop

DFix is the bounded direct-fix route for tiny copy, config, docs, labels, spacing, translation, and simple mechanical edits. In 1.11.0 it records runtime evidence instead of only static help text.

The command surface is:

```bash
sks dfix diagnose --json
sks dfix plan --json
sks dfix patch --dry-run --json
sks dfix verify --json
sks dfix rollback-plan --json
sks dfix status --json
sks dfix fixture --json
```

The fixture writes diagnosis, root cause, patch plan, patch result, verification, gate, Completion Proof, and Trust Report evidence. It does not mutate source files.
