# UX-Review Release Gate

UX-Review is release-gated as an image evidence route. A passing 1.11.0 fixture must generate annotated callout image evidence, extract an issue ledger, produce a patch handoff/fix task plan, and record recapture/recheck status before visual claims can move beyond fixture trust.

Required scripts:

- `npm run ux-review:generate-callouts-fixture`
- `npm run ux-review:extract-real-callouts-fixture`
- `npm run ux-review:patch-handoff-fixture`
- `npm run ux-review:recapture-recheck-fixture`
- `npm run ux-review:no-text-fallback`
- `npm run ux-review:no-fake-callouts`
- `npm run ux-review:image-voxel-relations`

Mock or generated fixture images remain `verified_partial`; they do not claim a real production UX review.
