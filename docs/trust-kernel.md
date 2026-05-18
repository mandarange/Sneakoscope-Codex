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
# 1.0.0 Hardening

The stable Trust Kernel blocks stale and mismatched trust artifacts across the whole proof chain:

- `stale_proof`: Completion Proof is older than the latest route event.
- `stale_evidence_index`: evidence index is older than the proof it claims to support.
- `stale_route_contract`: route completion contract is older than the proof.
- `stale_trust_report`: trust report is older than proof, evidence index, or route contract.
- `mock_or_static_evidence_cannot_verify_real_status`: mock/static evidence cannot support `verified`.
- `static_contract_evidence_for_runtime_route`: runtime routes cannot be satisfied by static contracts.
- evidence records with paths require `sha256`, and unresolved paths are blocked through the evidence router.

Use `sks trust validate latest --json --strict` to require fully verified status; `verified_partial` is blocked in strict mode.
