# Completion Proof

SKS `0.9.12` adds a unified completion proof surface for serious routes. The first implementation is intentionally small and release-gated: it gives every route a shared schema, redaction policy, validation command, and latest proof location.

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
sks proof export --md
```

Proof writing and validation redact secret-shaped values, including Codex access tokens, OpenAI API keys, and codex-lb API keys, with the common marker `[redacted]`.
