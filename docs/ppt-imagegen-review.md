# PPT Imagegen Review

The 1.14.1 PPT review route treats deck review as visual evidence, not prose. `sks ppt review --fixture --json` writes slide export, generated callout, issue extraction, patch handoff, patch result, recheck, Image Voxel relation, Completion Proof, and Trust Report evidence artifacts. The 1.14.1 release gates also run a synthetic deck E2E blackbox and artifact graph validator so fake exports remain explicitly mock/partial and never become verified real imagegen evidence.

Required scripts:

- `node ./dist/scripts/imagegen-capability-check.js`
- `node --test test/unit/imagegen-request-validator.test.mjs`
- `node ./dist/scripts/ppt-real-export-adapter-check.js`
- `npm run ppt:real-imagegen-wiring`
- `node ./dist/scripts/ppt-reexport-rereview-check.js`
- `node ./dist/scripts/ppt-full-e2e-blackbox-check.js`

The fixture is deterministic and local-only. Text-only review fallback and mock-as-real promotion are release blockers. The fake imagegen blackbox must execute the PPT review command path, but it remains mock-like evidence and cannot be promoted to a real generated slide review.
