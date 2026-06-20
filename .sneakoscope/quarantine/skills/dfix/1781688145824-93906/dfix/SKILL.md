---
name: dfix
description: Immutable SKS core Codex App route bridge for $DFix.
---

<!-- BEGIN SKS IMMUTABLE CORE SKILL -->
id: sks-core-dfix
canonical_name: dfix
route: $DFix
template_version: sks-core-skill-template.v1
mutable_by_doctor: false
mutable_by_update: false
mutable_by_setup: false
<!-- END SKS IMMUTABLE CORE SKILL -->

Route: $DFix
Command: $DFix
Purpose: perform tiny direct fixes with cheap verification.
Use when: Use only for narrow copy/config/docs/labels/spacing/translation/mechanical edits.
Proof paths: focused diff and DFix Honest check.
Safety rules: preserve user-authored skills, keep route state bounded, and stop on hard blockers instead of fabricating fallback behavior.
Failure recovery: Escalate broad implementation to a full execution route.
