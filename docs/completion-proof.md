# Completion Proof

SKS `0.9.14` makes Completion Proof a route-bound completion requirement for serious routes. Serious route finalization writes a valid proof through the central finalizer, and Stop/Honest/HProof-style gates block missing, failed, blocked, invalid, or secret-bearing proof artifacts.

## Files

- `.sneakoscope/proof/latest.json`
- `.sneakoscope/proof/latest.md`
- `.sneakoscope/proof/commands.jsonl`
- `.sneakoscope/proof/file-changes.json`
- `.sneakoscope/proof/unverified.md`
- `.sneakoscope/missions/<id>/completion-proof.json`
- `.sneakoscope/missions/<id>/completion-proof.md`

Serious route proof also includes `evidence.scouts` when five-scout intake is required:

```json
{
  "schema": "sks.scout-proof-evidence.v1",
  "scout_count": 5,
  "completed_scouts": 5,
  "gate": "passed",
  "consensus": ".sneakoscope/missions/<id>/scout-consensus.json",
  "handoff": ".sneakoscope/missions/<id>/scout-handoff.md"
}
```

## Status Values

Proof status must be one of:

- `verified`
- `verified_partial`
- `blocked`
- `not_verified`
- `failed`

Mock fixture evidence can support selftest coverage, but it must not be promoted to `verified` real-run evidence.

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
```

Route finalization lives under `src/core/proof/route-finalizer.mjs`, route policy in `route-finalizer-policy.mjs` and `route-proof-policy.mjs`, route writing in `route-adapter.mjs`, and Stop validation in `route-proof-gate.mjs`.

Proof writing and validation redact secret-shaped values, including Codex access tokens, OpenAI API keys, and codex-lb API keys, with the common marker `[redacted]`. Mock and fixture evidence must stay `verified_partial`, `not_verified`, `mock`, or `fixture`; it must not be claimed as a real verified run.
