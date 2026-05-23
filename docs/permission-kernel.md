# Permission Kernel

The 1.15.0 permission kernel turns MAD-SKS authority into explicit state and evidence instead of broad implicit bypass.

## Modes

- `disabled`: default state; no MAD-SKS authority is active.
- `plan_only`: computes required permissions without writes.
- `authorized`: an authorization manifest exists for the target root and requested scopes.
- `full_system_authority`: write-capable mode for explicitly approved system scopes.
- `blocked`: requested action violates protected core, missing consent, or high-risk policy.

## Consent Scopes

MAD-SKS scopes are additive. Target project writes do not imply system writes, DB writes, package installs, service control, admin operations, network operations, Computer Use, browser automation, destructive delete, or generated asset edits. Each scope must be requested, recorded, and reflected in proof.

## Release Invariants

Permission decisions must resolve real paths, reject symlink/path traversal escapes, classify destructive shell commands, redact secrets from stdout/stderr, and emit structured blockers when authorization is missing. Proof cannot pass unless permission decisions, audit ledger entries, rollback notes, and verification evidence agree.
