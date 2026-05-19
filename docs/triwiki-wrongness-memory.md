# TriWiki Wrongness Memory

Wrongness memory is the negative-evidence side of TriWiki. It records claims, assumptions, fixtures, tests, image anchors, DB classifications, hook replays, and trust status claims that turned out wrong, stale, unsupported, or overconfident.

## Files

- `.sneakoscope/wiki/wrongness-ledger.json`
- `.sneakoscope/wiki/wrongness-index.json`
- `.sneakoscope/wiki/wrongness-summary.md`
- `.sneakoscope/wiki/wrongness/<wrongness-id>.json`
- `.sneakoscope/wiki/avoidance-rules/<rule-id>.json`
- `.sneakoscope/missions/<id>/wrongness-ledger.json`
- `.sneakoscope/missions/<id>/wrongness-summary.md`
- `.sneakoscope/missions/<id>/wrongness-triwiki-links.json`

## Commands

```bash
sks wrongness list --json
sks wrongness add --kind incorrect_claim --claim "Claim text" --reason "Why it was wrong" --json
sks wrongness resolve WRONG-... --reason "Corrected by current evidence" --json
sks wrongness summarize latest --json
sks wrongness validate project --json
sks wrongness context --route '$Team' --json
sks wrongness publish latest --shared --json
sks wiki wrongness list --json
```

## Trust Rules

Active high-severity wrongness blocks full trust. Active medium-severity wrongness keeps completion at `verified_partial`. Mock, fixture, stale, missing, image, DB, hook, and trust-overclaim issues are stored as negative evidence so the next scout, proof, or trust validation pass can retrieve avoidance rules before reusing the same claim.

Wrongness evidence is attached to Completion Proof under `evidence.wrongness`, indexed by the evidence router as `wrongness` and `image_wrongness`, and surfaced in `trust-report.json`.

Shared wrongness shards are merged back into project wrongness context. That means a fresh checkout can still retrieve active avoidance rules after `sks wrongness publish latest --shared` has committed the shard files.
