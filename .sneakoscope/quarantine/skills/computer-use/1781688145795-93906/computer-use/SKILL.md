---
name: computer-use
description: Immutable SKS core Codex App route bridge for $Computer-Use.
---

<!-- BEGIN SKS IMMUTABLE CORE SKILL -->
id: sks-core-computer-use
canonical_name: computer-use
route: $Computer-Use
template_version: sks-core-skill-template.v1
mutable_by_doctor: false
mutable_by_update: false
mutable_by_setup: false
<!-- END SKS IMMUTABLE CORE SKILL -->

Route: $Computer-Use
Command: $Computer-Use
Purpose: operate native macOS desktop apps through Codex Computer Use.
Use when: Use only for native Mac/non-web app or OS-setting surfaces.
Proof paths: native desktop interaction evidence where live Computer Use is available.
Safety rules: preserve user-authored skills, keep route state bounded, and stop on hard blockers instead of fabricating fallback behavior.
Failure recovery: Do not use Computer Use as browser/web evidence; mark unavailable surfaces unverified.
