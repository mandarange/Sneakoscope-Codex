# Image Voxel Ledger

Image Voxel TriWiki records visual evidence as images, bbox anchors, and relations. Generic image ingest may have zero anchors and remain `not_verified` or `verified_partial`; visual route completion must have anchors.

Core commands:

```sh
sks wiki image-ingest screen.png --source codex-computer-use --json
sks wiki anchor-add --image-id screen-home-before --bbox 120,240,360,80 --label "CTA contrast issue" --source gpt-image-2 --evidence image-ux-generated-review-ledger.json --json
sks wiki relation-add --type before_after --before screen-home-before --after screen-home-after --anchors ux-callout-001 --json
sks wiki image-link-proof latest --json
```

Validation fails when anchors point at missing images, bbox values exceed image dimensions, a visual route has no anchors, or a before/after fix claim lacks the relation needed to bind the change.
