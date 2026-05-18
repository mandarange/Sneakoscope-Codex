# Rollback

Rollback is explicit and confirmation-gated.

```bash
sks rollback list --json
sks rollback apply rollback-sneakoscope --confirm apply-managed-rollback --json
```

Rollback actions are generated from `.sneakoscope/managed-paths.json`. Applying rollback removes only paths marked `rollback: true`.

Catastrophic or ambiguous cleanup remains blocked. SKS does not delete user-owned files or resolve other harness conflicts without explicit human approval.
