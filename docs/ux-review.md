# UX-Review Release Gate

UX-Review is release-gated as an image evidence route. In 1.14.1, `run`, `callouts`, and `extract-issues` must reach the real gpt-image-2 adapter and real callout extractor when `SKS_TEST_REAL_IMAGEGEN=1` is enabled; otherwise the smoke gate records `integration_optional`. A passing fixture must generate annotated callout image evidence, extract an issue ledger, write `image-ux-callout-extraction-report.json`, produce a patch handoff/fix task plan, and record recapture/recheck status before visual claims can move beyond fixture trust.

Required scripts:

- `npm run ux-review:run-wires-imagegen`
- `npm run ux-review:extract-wires-real-extractor`
- `npm run ux-review:patch-diff-recheck`
- `npm run imagegen:capability`
- `npm run imagegen:gpt-image-2-request-validator`
- `npm run ux-review:imagegen-blackbox`
- `npm run ux-ppt:structured-extraction`
- `npm run ux-review:generate-callouts-fixture`
- `npm run ux-review:extract-real-callouts-fixture`
- `npm run ux-review:patch-handoff-fixture`
- `npm run ux-review:recapture-recheck-fixture`
- `npm run ux-review:no-text-fallback`
- `npm run ux-review:no-fake-callouts`
- `npm run ux-review:image-voxel-relations`

Mock or generated fixture images remain `verified_partial`; they do not claim a real production UX review. The blackbox fake adapter uses the same command path and writes request, response, generated image, extraction, issue, proof, and trust artifacts, but its artifacts stay marked `mock_fixture` / `fake_imagegen_adapter`.

When gpt-image-2 annotated review images cannot be created or linked, UX-Review may close only as `verified_partial/reference-only`. That closeout requires source screenshots with hashes, docs evidence, source Image Voxel anchors, and Honest Mode evidence; it must not claim generated-image callout extraction, fix verification, or a full production UX review.
