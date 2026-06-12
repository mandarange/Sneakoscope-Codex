# SKS Core Skill Engine

The Core Skill Engine treats a skill as the **frozen agent's external, versioned
state**. An optimizer proposes *bounded* edits to a single skill document; an edit
is accepted **only** on strict held-out improvement; deployment reads an immutable
accepted snapshot and **never** calls the optimizer. None of this mutates code,
config, or global files — the model/agent itself is never changed.

## SkillOpt → SKS mapping

| SkillOpt concept | SKS Core Skill Engine artifact | Module |
| --- | --- | --- |
| Skill document | **Core Skill Card** (`sks.core-skill-card.v1`) | `core/skills/core-skill-card.ts` |
| Optimizer | **Core Skill Optimizer** (pure, no model/inference call) | `core/skills/core-skill-epoch.ts` (`proposeSkillPatch`) |
| Bounded add/delete/replace edit | **Core SkillPatch** (`sks.core-skill-patch.v1`) | `core/skills/core-skill-patch.ts`, `core-skill-patch-apply.ts` |
| Held-out validation | **Gate Validation Split** (strict held-out acceptance) | `core/skills/core-skill-validation.ts` |
| Textual learning-rate budget | **Textual Edit Budget** (`max_added/deleted/replaced_chars`) | `core/skills/core-skill-epoch.ts` (`DEFAULT_TEXTUAL_LEARNING_RATE`) |
| Rejected-edit buffer | **Rejected SkillPatch Buffer** (`rejected-skill-patches.jsonl`) | `core/skills/rejected-skill-patch-buffer.ts` |
| Optimization epoch | **Core Skill Epoch** (one accepted candidate at most) | `core/skills/core-skill-epoch.ts` (`runSkillEpoch`) |
| Zero inference-time optimizer calls | **Deployment Skill Snapshot** (immutable, read-only inference path) | `core/skills/core-skill-deployment.ts`, `core-skill-runtime.ts` |
| Transfer across harnesses | **Harness-Portable artifact** (plain JSON card/patch/trace, no runtime state) | `core/skills/core-skill-types.ts` |
| Reflection → aggregation → selection | **Skill Reflection stage** (deterministic, per-dimension lessons) | `core/skills/core-skill-reflection.ts` |
| Epoch-wise meta-update (LR schedule) | **Learning-Rate Meta-Update** (decay on rejection, bounded regrowth on acceptance) | `core/skills/core-skill-meta-update.ts` |
| Training loop / `best_skill.md` export | **Skill Trainer** (`trainSkill`, multi-epoch, exports `best-skill.json` + training report) | `core/skills/core-skill-trainer.ts` |

The rollout scorer (`core/skills/core-skill-scorer.ts`) and rollout trace
(`core/skills/core-rollout-trace.ts`) produce the evidence the optimizer and the
held-out split consume.

## Safety contract

1. **Skills are external, versioned state.** A skill edit changes only the skill
   document version; it never changes the agent, model, weights, or any prompt
   wiring beyond injecting the deployed skill body as a read-only instruction
   fragment.
2. **Patches edit only the single skill doc.** A `Core SkillPatch` may target only
   a `section:` / `sentence:` / `paragraph:` of one skill card. Any filesystem,
   code, config, or global target (e.g. `file:src/x.ts`, `section:../../src/evil.ts`)
   is rejected (`patch_target_is_external` / `patch_target_invalid`), and a patch
   whose `skill_id` differs from the card is rejected (`patch_targets_other_skill`).
3. **Bounded edits.** Every patch is constrained by a textual learning-rate budget
   (`max_added_chars`, `max_deleted_chars`, `max_replaced_chars`); overruns are
   rejected (`budget_*_chars_exceeded`).
4. **Strict held-out acceptance.** A candidate is accepted **only** when its
   held-out score strictly improves *and* no safety/quality dimension regresses
   (side-effect-zero, requested-scope, proof completeness, rollback readiness,
   catastrophic latency). Train-only gains with a worse held-out are rejected
   (`heldout_not_improved`). A side-effect violation is a hard fail
   (`side_effect_zero_failed`). Rejected patches are buffered by hash so the same
   failed edit is never retried.
5. **Immutable deployed snapshots.** Promotion writes `deployed.json`. A changed
   body requires a strictly higher version
   (`snapshot_changed_without_version_increment`); the previous snapshot is archived
   under `deployed-history/` for rollback. Only an `accepted` card may be promoted
   (`promote_requires_accepted_status`). A candidate sharing a `skill_id` is a
   separate file and never overwrites the deployed snapshot.
6. **No optimizer/model call in the deployment/inference path.** In a deployment
   context (`setDeploymentContext(true)` or `SKS_SKILL_DEPLOYMENT_CONTEXT=1`) only
   the deployed snapshot is read; any optimizer/epoch call
   (`proposeSkillPatch`, `runSkillEpoch`) throws `SkillDeploymentViolationError`.
   The route proof record (`skillProofRecord`) records `optimizer_invoked: false`
   and carries the selected skill `skill_id` / `version` / `hash`.
7. **Rollback via archived snapshots.** `rollbackDeployment` restores the most
   recent archived snapshot below the current version.

## Release gates

| Gate id | Script |
| --- | --- |
| `core-skill:card-schema` | `scripts/core-skill-card-schema-check.mjs` |
| `core-skill:rollout-scoring` | `scripts/core-skill-rollout-scoring-check.mjs` |
| `core-skill:patch` | `scripts/core-skill-patch-check.mjs` |
| `core-skill:heldout-validation` | `scripts/core-skill-heldout-validation-check.mjs` |
| `core-skill:deployment-snapshot` | `scripts/core-skill-deployment-snapshot-check.mjs` |
| `core-skill:no-inference-optimizer` | `scripts/core-skill-no-inference-optimizer-check.mjs` |
| `core-skill:trainer-loop` | `scripts/core-skill-trainer-check.mjs` |

Each gate is mirrored by a packed blackbox test under
`test/blackbox/core-skill-*-packed.test.mjs` that spawns the gate script and asserts
exit 0.

## Artifacts

- `.sneakoscope/skills/<route>/<skill_id>/candidate-v<N>.json` — proposed candidate cards.
- `.sneakoscope/skills/<route>/<skill_id>/accepted-v<N>.json` — held-out-accepted cards.
- `.sneakoscope/skills/<route>/<skill_id>/deployed.json` — the immutable deployed snapshot (inference path reads this only).
- `.sneakoscope/skills/<route>/<skill_id>/deployed-history/v<N>.json` — archived snapshots for rollback.
- `.sneakoscope/skills/rejected-skill-patches.jsonl` — the Rejected SkillPatch Buffer (one rejected entry per line, deduped by patch hash).
- `.sneakoscope/reports/core-skill-rollout-score.json` — the latest persisted rollout score.
- `.sneakoscope/skills/<route>/<skill_id>/best-skill.json` — the trainer's best held-out card (SkillOpt `best_skill.md` analogue).
- `.sneakoscope/reports/core-skill-training-report.json` — per-epoch trainer record (accept/reject reason, score delta, learning rate).

## Schemas

- `schemas/skills/core-skill-card.schema.json` (`$id` `sks.core-skill-card.v1`)
- `schemas/skills/core-skill-patch.schema.json` (`$id` `sks.core-skill-patch.v1`)
