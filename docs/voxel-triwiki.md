# Image-Based Voxel TriWiki

SKS `0.9.13` promotes image evidence into route-gated Image Voxel TriWiki anchors. Screenshots, generated review images, Computer Use evidence, and visual callouts can be hashed, validated, anchored by bbox, related as before/after evidence, and linked into Completion Proof.

## Files

- `.sneakoscope/wiki/image-voxel-ledger.json`
- `.sneakoscope/wiki/image-assets.json`
- `.sneakoscope/wiki/visual-anchors.json`
- `.sneakoscope/missions/<id>/image-voxel-ledger.json`
- `.sneakoscope/missions/<id>/visual-anchors.json`

## Commands

```bash
sks wiki image-ingest <path> --source codex-computer-use --json
sks wiki image-validate [ledger.json] --json
sks wiki image-summary --json
sks wiki anchor-add --image-id screen-home-before --bbox 120,240,360,80 --label "CTA contrast issue" --source gpt-image-2 --evidence image-ux-generated-review-ledger.json --json
sks wiki relation-add --type before_after --before screen-home-before --after screen-home-after --anchors ux-callout-001 --json
sks wiki image-link-proof latest --json
```

Validation fails when an anchor references a missing image, a screenshot lacks dimensions, a bbox falls outside image dimensions, or a visual route completion has zero anchors. Generic image ingest may stay anchorless as `not_verified` or `verified_partial`; visual/UI completion claims require anchors, and before/after fix claims require relations or must remain partial.
