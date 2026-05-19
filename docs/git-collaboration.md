# Git Collaboration

SKS 1.0.3 makes repository memory merge-friendly by separating shared records from local runtime noise.

## Flow

```bash
sks git install --json
sks wiki publish latest --shared --json
sks wrongness publish latest --shared --json
sks wiki rebuild-index --json
sks wiki validate-shared --json
sks git precommit --json
```

Tracked shared records:

- `.sneakoscope/wiki/records/claims/<claim-id>.json`
- `.sneakoscope/wiki/wrongness/<wrongness-id>.json`
- `.sneakoscope/wiki/image-voxels/<image-asset-id>/<anchor-id>.json`
- `.sneakoscope/wiki/avoidance-rules/<rule-id>.json`
- `.sneakoscope/git-policy.json`
- `.sneakoscope/shared-memory-manifest.json`

Ignored local/generated state:

- `.sneakoscope/missions/`
- `.sneakoscope/reports/`
- `.sneakoscope/tmp/`
- `.sneakoscope/cache/`
- `.sneakoscope/logs/`
- `.sneakoscope/state/`
- `.sneakoscope/memory/`
- `.sneakoscope/proof/`
- `.sneakoscope/wiki/indexes/`
- `.sneakoscope/wiki/context-packs/`

## Trust

`sks git doctor --json` validates ignore rules, attributes, policy files, shared schemas, secret redaction, generated-index freshness, and whether active local wrongness has been published. Trust reports include a `git_collaboration` section.
