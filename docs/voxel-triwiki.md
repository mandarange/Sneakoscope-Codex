# Image-Based Voxel TriWiki

SKS `0.9.12` promotes image evidence into a first-class Voxel TriWiki ledger. Screenshots, generated review images, and visual callouts can now be hashed, validated, summarized, and linked into completion proof.

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
```

Validation fails when an anchor references a missing image, a screenshot lacks a SHA-256 hash, or a bbox falls outside the image dimensions. Routes that require generated visual review or Codex Computer Use evidence must mark the claim as partial or blocked when the required real artifact is absent.
