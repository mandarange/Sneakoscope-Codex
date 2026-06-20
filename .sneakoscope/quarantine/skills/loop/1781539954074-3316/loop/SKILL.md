---
name: loop
description: Immutable SKS core Codex App route bridge for $Loop.
---

<!-- BEGIN SKS IMMUTABLE CORE SKILL -->
id: sks-core-loop
canonical_name: loop
route: $Loop
template_version: 3.1.8-core-skill-template.v1
mutable_by_doctor: false
mutable_by_update: false
mutable_by_setup: false
<!-- END SKS IMMUTABLE CORE SKILL -->

Route: $Loop
Command: $Loop
Purpose: compile persisted route work into bounded loop plans with continuation evidence.
Use when: Use for resumable route stages, memory hints, and loop mission artifacts.
Proof paths: .sneakoscope/loops/** plus route-local proof artifacts.
Safety rules: preserve user-authored skills, keep route state bounded, and stop on hard blockers instead of fabricating fallback behavior.
Failure recovery: Record the unavailable surface as blocked; do not fabricate a loop proof.
