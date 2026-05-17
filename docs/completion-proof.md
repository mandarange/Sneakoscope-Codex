# Completion Proof

SKS `0.9.13` makes Completion Proof a route-bound completion requirement for serious routes. Serious route finalization must write a valid proof, and Stop/Honest/HProof-style gates block missing, failed, blocked, invalid, or secret-bearing proof artifacts.

## Files

- `.sneakoscope/proof/latest.json`
- `.sneakoscope/proof/latest.md`
- `.sneakoscope/proof/commands.jsonl`
- `.sneakoscope/proof/file-changes.json`
- `.sneakoscope/proof/unverified.md`
- `.sneakoscope/missions/<id>/completion-proof.json`
- `.sneakoscope/missions/<id>/completion-proof.md`

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
sks proof export --md
sks proof repair latest --json
```

Route adapters live under `src/core/proof/route-adapter.mjs`, with route policy in `route-proof-policy.mjs` and Stop validation in `route-proof-gate.mjs`.

Proof writing and validation redact secret-shaped values, including Codex access tokens, OpenAI API keys, and codex-lb API keys, with the common marker `[redacted]`. Mock and fixture evidence must stay `verified_partial`, `not_verified`, `mock`, or `fixture`; it must not be claimed as a real verified run.
