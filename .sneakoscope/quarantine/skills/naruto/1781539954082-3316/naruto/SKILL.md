---
name: naruto
description: Immutable SKS core Codex App route bridge for $Naruto.
---

<!-- BEGIN SKS IMMUTABLE CORE SKILL -->
id: sks-core-naruto
canonical_name: naruto
route: $Naruto
template_version: 3.1.8-core-skill-template.v1
mutable_by_doctor: false
mutable_by_update: false
mutable_by_setup: false
<!-- END SKS IMMUTABLE CORE SKILL -->

Route: $Naruto
Command: $Naruto
Purpose: fan out bounded native worker lanes while parent integration remains owner.
Use when: Use when the selected route explicitly requires high-scale parallel review or implementation.
Proof paths: agent task graph, worker ledgers, leases, proof evidence, and cleanup artifacts.
Safety rules: preserve user-authored skills, keep route state bounded, and stop on hard blockers instead of fabricating fallback behavior.
Failure recovery: Degrade to parent-owned execution with blockers recorded if native lanes are unavailable.
