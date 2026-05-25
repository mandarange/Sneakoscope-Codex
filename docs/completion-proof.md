# Completion Proof

SKS `0.9.14` makes Completion Proof a route-bound completion requirement for serious routes. Serious route finalization writes a valid proof through the central finalizer, and Stop/Honest/HProof-style gates block missing, failed, blocked, invalid, or secret-bearing proof artifacts.

In `0.9.20`, route finalization also writes a Trust Kernel envelope:

- `.sneakoscope/missions/<id>/route-completion-contract.json`
- `.sneakoscope/missions/<id>/evidence-index.json`
- `.sneakoscope/missions/<id>/evidence.jsonl`
- `.sneakoscope/missions/<id>/trust-report.json`

Completion Proof includes links to the evidence router and trust report so proof claims can be checked against path-bound evidence.

## Files

- `.sneakoscope/proof/latest.json`
- `.sneakoscope/proof/latest.md`
- `.sneakoscope/proof/commands.jsonl`
- `.sneakoscope/proof/file-changes.json`
- `.sneakoscope/proof/unverified.md`
- `.sneakoscope/missions/<id>/completion-proof.json`
- `.sneakoscope/missions/<id>/completion-proof.md`

In SKS 1.16.0, serious route proof uses native agent evidence for multi-session collaboration:

```json
{
  "schema": "sks.agent-proof-evidence.v1",
  "backend": "codex-exec",
  "real_parallel_claim": true,
  "agent_count": 5,
  "all_sessions_closed": true,
  "ledger_hash_chain_ok": true,
  "no_overlap_ok": true,
  "consensus_ok": true,
  "cleanup_report": "agent-cleanup.json",
  "trust_report": "agent-trust-report.json"
}
```

`evidence.agents` is the route collaboration proof surface for 1.16. Removed legacy multi-agent evidence fields do not satisfy completion proof.

## Status Values

Proof status must be one of:

- `verified`
- `verified_partial`
- `blocked`
- `not_verified`
- `failed`

Mock fixture evidence can support selftest coverage, but it must not be promoted to `verified` real-run evidence.

For SKS 1.0.8 UX-Review missions, Completion Proof includes `evidence.image_ux_review` with source screenshot count, generated gpt-image-2 callout image count, callout extraction schema status, open/fixed P0/P1 counts, recapture/re-review status, Image Voxel relation count, and Computer Use evidence mode. Text-only UX reviews and mock generated callouts cannot produce a real `verified` claim.

## Commands

```bash
sks proof show
sks proof show --json
sks proof latest --json
sks proof validate
sks proof validate --json
sks proof route latest --json
sks proof route <mission-id> --json
sks proof finalize latest --json
sks proof finalize <mission-id> --json
sks proof finalize latest --route '$Team' --json
sks proof finalize latest --strict --json
sks proof export --md
sks proof repair latest --json
sks trust report latest --json
sks trust validate latest --json
```

Route finalization lives under `src/core/proof/route-finalizer.ts`, route policy in `route-finalizer-policy.ts` and `route-proof-policy.ts`, route writing in `route-adapter.ts`, and Stop validation in `route-proof-gate.ts`.

Proof writing and validation redact secret-shaped values, including Codex access tokens, OpenAI API keys, and codex-lb API keys, with the common marker `[redacted]`. Mock and fixture evidence must stay `verified_partial`, `not_verified`, `mock`, or `fixture`; it must not be claimed as a real verified run.
