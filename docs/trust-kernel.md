# SKS Trust Kernel

The SKS Trust Kernel binds serious route completion to three mission-local artifacts:

- `completion-proof.json`
- `route-completion-contract.json`
- `evidence-index.json`

`trust-report.json` is the user-facing diagnosis that combines those artifacts.

## Status Values

Trust status uses the Completion Proof enum:

- `verified`
- `verified_partial`
- `blocked`
- `failed`
- `not_verified`

Mock, fixture, and static-contract evidence can support release tests, but cannot support a real `verified` claim.

## Commands

```bash
sks trust report latest --json
sks trust validate latest --json
sks trust status latest
sks trust explain latest
```

## Hard Invariants

- Serious route without `completion-proof.json` is blocked.
- Visual claim without fresh image voxel anchors is blocked or `verified_partial`.
- DB write risk without DB safety evidence is blocked.
- Mock/static evidence cannot become high-trust real evidence.
- Evidence older than the last route event is stale.
- Missing route completion contract is a trust blocker.
