---
name: init-deep
description: Immutable SKS core Codex App route bridge for $Init-Deep.
---

<!-- BEGIN SKS IMMUTABLE CORE SKILL -->
id: sks-core-init-deep
canonical_name: init-deep
route: $Init-Deep
template_version: sks-core-skill-template.v1
mutable_by_doctor: false
mutable_by_update: false
mutable_by_setup: false
<!-- END SKS IMMUTABLE CORE SKILL -->

Route: $Init-Deep
Command: $Init-Deep
Purpose: refresh project-local memory, directory rules, and loop memory hints.
Use when: Use when deeper local context or directory-specific recall is required.
Proof paths: .sneakoscope/context/AGENTS.generated.md and managed memory artifacts.
Safety rules: preserve user-authored skills, keep route state bounded, and stop on hard blockers instead of fabricating fallback behavior.
Failure recovery: Preserve user content and skip directories that cannot be safely updated.
