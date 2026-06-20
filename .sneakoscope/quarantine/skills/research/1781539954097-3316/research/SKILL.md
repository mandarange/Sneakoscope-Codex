---
name: research
description: Immutable SKS core Codex App route bridge for $Research.
---

<!-- BEGIN SKS IMMUTABLE CORE SKILL -->
id: sks-core-research
canonical_name: research
route: $Research
template_version: 3.1.8-core-skill-template.v1
mutable_by_doctor: false
mutable_by_update: false
mutable_by_setup: false
<!-- END SKS IMMUTABLE CORE SKILL -->

Route: $Research
Command: $Research
Purpose: run evidence-bound discovery, source ledgers, and synthesis cycles.
Use when: Use for discovery, evaluation, external-source claims, or frontier-style research.
Proof paths: research plan, source ledger, cycle record, synthesis, and final review.
Safety rules: preserve user-authored skills, keep route state bounded, and stop on hard blockers instead of fabricating fallback behavior.
Failure recovery: State source/tool unavailability and avoid unsupported live-accuracy claims.
