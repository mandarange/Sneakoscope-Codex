# MAD-SKS

MAD-SKS 1.18.8 is user-authorized general permission widening for high-power maintenance, not a DB-only unlock. It can operate on a declared target root and approved resource scopes, but every expanded capability is evidence-bound and the SKS harness protected core remains immutable. Database write access is one explicit executor scope inside MAD-SKS; it is not the identity of MAD-SKS.

## Authority Model

```bash
sks mad-sks plan --target-root <path> --json
sks mad-sks permissions --json
sks mad-sks run --target-root <path> --json
sks mad-sks apply --target-root <path> --yes --json
sks mad-sks rollback-apply --rollback-plan <path> --yes --json
sks mad-sks status --json
sks mad-sks proof --json
```

MAD-SKS starts disabled. Write-capable operation requires an authorization manifest with user intent, target root, allowed scopes, forbidden scopes, timestamp, and hash. `run` is dry-run by default; `apply` performs the guarded executor action only with a valid manifest. Separate consent is required for system access, DB writes, package installation, service control, admin operations, network operations, Computer Use, destructive delete, browser automation, generated asset edits, and file permission changes. Broad authority is assembled from those explicit scopes instead of inferred from a single "database mode."

## Evidence

Every full-system action is recorded in the MAD-SKS audit ledger with action type, before/after hash where available, exit code, duration, risk level, rollback availability, secret-redaction status, protected-core impact, and local-only artifact policy. Completion Proof, Trust Report, Evidence Router, Wrongness Memory, and rollback plans must link to that ledger before MAD-SKS can claim success. Release proof graph v4 additionally requires actual executor blackbox reports for file write, shell argv, package, service, DB, rollback apply, and live protected-core guard behavior.

## Boundaries

MAD-SKS can modify user-authorized target project files, package manager state, build/test/lint/typecheck outputs, local services, DB migrations or data, browser/Computer Use workflows, generated assets, file permissions, network operations, and system configuration only inside the approved scope. It must not store sudo passwords, leak secrets into logs, perform destructive delete without explicit confirmation, or treat third-party systems as authorized targets.

Installed SKS package roots remain protected core. The Sneakoscope engine source repository is the explicit exception: when the target root is the engine source itself, release engineering may edit `src/core`, `src/cli`, `src/commands`, `scripts`, package metadata, docs, and tests through the normal verified route instead of being blocked by protected-core.
