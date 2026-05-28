# Patch Proof And Rollback

SKS 1.18.9 patch proof is built from queue state, merge planning, apply results, verification rows, and rollback proof.

`agent-patch-proof.json` includes:

- `patch_queue_ok`
- `patch_apply_ok`
- `patch_verification_ok`
- `patch_rollback_ok`
- `parallel_patch_apply_verified`
- `patch_conflict_count`
- `serial_bottleneck_count`
- `changed_files_by_agent`
- `lease_compliance_by_patch`
- `rollback_digest_count`

Rollback data is deterministic. Each applied patch records whether the file existed, the before hash, the after hash precondition, and the original content when a restore is needed. Newly created files produce delete plans.

`sks agent rollback-patches latest --dry-run --json` validates after-hash preconditions without changing files. `sks agent rollback-patches latest --apply --json` applies the stored restore/delete plan only when those preconditions still match.
