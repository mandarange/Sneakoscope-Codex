# Image Voxel Ledger

Image Voxel TriWiki records visual evidence as images, bbox anchors, and relations. Generic image ingest may have zero anchors and remain `not_verified` or `verified_partial`; visual route completion must have anchors. In `0.9.14`, route finalization can automatically convert official capture evidence, Image UX Review, PPT, From-Chat-IMG, QA-loop visual claims, and GX visual validation evidence into mission-scoped `image-voxel-ledger.json`, `visual-anchors.json`, and `image-assets.json`.

Core commands:

```sh
sks wiki image-ingest screen.png --source codex-computer-use --json
sks wiki anchor-add --image-id screen-home-before --bbox 120,240,360,80 --label "CTA contrast issue" --source gpt-image-2 --evidence image-ux-generated-review-ledger.json --json
sks wiki relation-add --type before_after --before screen-home-before --after screen-home-after --anchors ux-callout-001 --json
sks wiki image-link-proof latest --json
```

Validation fails when anchors point at missing images, bbox values exceed image dimensions, a visual route has no anchors, or a before/after fix claim lacks the relation needed to bind the change.

0.9.20 also treats stale image evidence as a trust blocker. Images marked `stale` or `freshness: "stale"`, and anchors marked stale or with `voxel_layers.fresh <= 0`, cannot support high-confidence visual completion.

In SKS 1.0.8, UX-Review writes source/generated/fixed image relations such as `generated_callout_review_of`, `issue_detected_in`, `fix_attempt_for_issue`, `after_screenshot_of`, `re_review_of`, and `wrong_callout`. Validators reject unresolved image refs, duplicate relations, stale source screenshots, and bbox coordinates outside image dimensions.

Mock fixtures are allowed for release selftests only when they are marked as mock or `verified_partial`. Real visual completion still requires real screenshots or generated gpt-image-2 callout evidence, valid image hashes, anchors inside image bounds, and before/after relations for fix claims.
