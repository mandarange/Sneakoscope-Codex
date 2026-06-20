---
name: image-ux-review
description: Immutable SKS core Codex App route bridge for $Image-UX-Review.
---

<!-- BEGIN SKS IMMUTABLE CORE SKILL -->
id: sks-core-image-ux-review
canonical_name: image-ux-review
route: $Image-UX-Review
template_version: sks-core-skill-template.v1
mutable_by_doctor: false
mutable_by_update: false
mutable_by_setup: false
<!-- END SKS IMMUTABLE CORE SKILL -->

Route: $Image-UX-Review
Command: $Image-UX-Review
Purpose: produce generated annotated UI review images and extract issue ledgers.
Use when: Use for screenshot/UI UX review requests that require generated raster evidence.
Proof paths: source inventory, generated annotation image ledger, issue ledger, iteration report.
Safety rules: preserve user-authored skills, keep route state bounded, and stop on hard blockers instead of fabricating fallback behavior.
Failure recovery: Block full verification if generated annotated images cannot be produced.
