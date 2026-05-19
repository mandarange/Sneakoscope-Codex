# Image Wrongness

Image wrongness stores visual negative evidence separately from ordinary image voxel anchors.

## Files

- `.sneakoscope/wiki/image-wrongness-index.json`
- `.sneakoscope/missions/<id>/image-wrongness-ledger.json`

`sks wiki image-validate` writes image wrongness when validation fails. The image wrongness adapter also creates ordinary TriWiki wrongness records so trust and proof gates can see the same visual blocker.

Examples:

- missing anchors become `visual_anchor_error`
- bbox or dimension issues become `image_bbox_error`
- stale image evidence becomes `stale_evidence`

Do not rely on UI, screenshot, generated-review, bbox, or before/after claims while active image wrongness exists for the same route or mission.
