# MAD-SKS Rollback

SKS 1.15.1 adds an executable rollback apply path for MAD-SKS file executor plans.

```bash
sks mad-sks rollback-apply --rollback-plan <path> --dry-run --json
sks mad-sks rollback-apply --rollback-plan <path> --yes --json
```

Rollback apply reads a `sks.mad-sks-rollback-plan.v1` artifact, verifies the target root boundary and immutable harness guard for every file restore, records a rollback audit ledger, writes proof evidence, and keeps artifacts local-only. New target files are removed when the rollback plan says the file did not exist before. Existing files are restored from the local rollback snapshot.

Package, service, and DB rollback entries are preserved as explicit instructions unless a route-specific adapter can execute them safely. Missing snapshots, protected-core targets, and unavailable rollback actions return structured blockers instead of claiming a verified rollback.
