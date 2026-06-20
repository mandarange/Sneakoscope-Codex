---
name: qa-loop
description: Immutable SKS core Codex App route bridge for $QA-LOOP.
---

<!-- BEGIN SKS IMMUTABLE CORE SKILL -->
id: sks-core-qa-loop
canonical_name: qa-loop
route: $QA-LOOP
template_version: sks-core-skill-template.v1
mutable_by_doctor: false
mutable_by_update: false
mutable_by_setup: false
<!-- END SKS IMMUTABLE CORE SKILL -->

Route: $QA-LOOP
Command: $QA-LOOP
Purpose: dogfood UI/API behavior with safety gates and QA reports.
Use when: Use when route completion needs human-proxy verification, rechecks, and QA ledgers.
Proof paths: qa-ledger.json, dated QA report, qa-gate.json, and post-fix verification.
Safety rules: preserve user-authored skills, keep route state bounded, and stop on hard blockers instead of fabricating fallback behavior.
Failure recovery: Mark unverified browser/native surfaces explicitly; never substitute fake visual evidence.
