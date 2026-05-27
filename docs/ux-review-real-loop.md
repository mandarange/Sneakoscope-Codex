# UX-Review Real Loop

SKS 1.0.8 treats `$UX-Review this screenshot with gpt-image-2 callouts, then fix the issues` as an execution route, not a prose review. A valid run needs:

- A real source screenshot from Codex Chrome Extension for web/browser/webapp targets, Codex Computer Use for native Mac/non-web targets, or a user-provided local image.
- A generated gpt-image-2 annotated callout image created through Codex App imagegen/$imagegen.
- Schema-bound callout extraction into `image-ux-issue-ledger.json`.
- P0/P1-first fix task planning and a bounded safe fix loop when fixes are requested.
- Recapture/re-review evidence before any changed-screen visual fix is verified.
- Image Voxel source/generated/fixed relations plus Completion Proof, Trust Report, and Wrongness evidence.

Commands:

```bash
sks ux-review run --image screen.png --fix --json
sks ux-review callouts --image screen.png --json
sks ux-review extract-issues --generated-image review.png --json
sks ux-review fix latest --json
sks ux-review recapture latest --json
sks ux-review recheck latest --json
sks ux-review status latest --json
```

Mock fixtures remain `verified_partial`. Text-only screenshot critique, placeholder generated images, fabricated ledgers, and mock-as-real evidence are blocked by `image-ux-review-gate.json`.

If gpt-image-2 annotated images cannot be created or linked, the route may stop as `verified_partial/reference-only` instead of looping forever. That status is allowed only when source screenshots plus hashes, docs evidence, source Image Voxel anchors, and Honest Mode evidence exist, and the gate plainly records that generated-image callout extraction and full UX verification are unavailable.
