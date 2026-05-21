# PPT Imagegen Review

The 1.11.0 PPT review route treats deck review as visual evidence, not prose. `sks ppt review --fixture --json` writes slide export, generated callout, issue extraction, patch handoff, patch result, recheck, Image Voxel relation, Completion Proof, and Trust Report evidence artifacts.

Required scripts:

- `npm run ppt:imagegen-review-fixture`
- `npm run ppt:slide-export-fixture`
- `npm run ppt:no-text-fallback`
- `npm run ppt:no-mock-as-real`
- `npm run ppt:issue-extraction-fixture`
- `npm run ppt:image-voxel-relations`
- `npm run ppt:proof-trust-fixture`

The fixture is deterministic and local-only. Text-only review fallback and mock-as-real promotion are release blockers.
