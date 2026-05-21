# PPT Imagegen Review

The 1.14.0 PPT review route treats deck review as visual evidence, not prose. `sks ppt review --fixture --json` writes slide export, generated callout, issue extraction, patch handoff, patch result, recheck, Image Voxel relation, Completion Proof, and Trust Report evidence artifacts. Real mode distinguishes LibreOffice/PowerPoint/manual export, generated slide review images, pending extraction, and fixed deck re-review instead of treating manual or mock paths as verified real evidence.

Required scripts:

- `npm run ppt:imagegen-review-fixture`
- `npm run imagegen:capability`
- `npm run imagegen:gpt-image-2-request-validator`
- `npm run ppt:real-export-adapter`
- `npm run ppt:real-imagegen-wiring`
- `npm run ppt:reexport-rereview`
- `npm run ppt:imagegen-blackbox`
- `npm run ux-ppt:structured-extraction`
- `npm run ppt:slide-export-fixture`
- `npm run ppt:no-text-fallback`
- `npm run ppt:no-mock-as-real`
- `npm run ppt:issue-extraction-fixture`
- `npm run ppt:image-voxel-relations`
- `npm run ppt:proof-trust-fixture`

The fixture is deterministic and local-only. Text-only review fallback and mock-as-real promotion are release blockers. The fake imagegen blackbox must execute the PPT review command path, but it remains mock-like evidence and cannot be promoted to a real generated slide review.
