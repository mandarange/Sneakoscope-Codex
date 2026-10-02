# SKS Core Skill Engine

The Core Skill Engine treats a skill as the **frozen agent's external, versioned
state**. A route reads an immutable deployed snapshot of one skill card and injects
its body as a read-only instruction fragment. None of this mutates code, config, or
global files — the model/agent itself is never changed.

The offline optimizer that once proposed bounded edits to a skill card (epoch,
trainer, reflection, scorer, patch buffer) has been removed: nothing at runtime
called it, and no native Codex counterpart exists to replace. Cards are authored
or promoted explicitly; there is no automatic skill rewriting.

## Artifacts

| Concept | SKS Core Skill Engine artifact | Module |
| --- | --- | --- |
| Skill document | **Core Skill Card** (`sks.core-skill-card.v1`) | `core/skills/core-skill-card.ts` |
| Immutable read-only inference path | **Deployment Skill Snapshot** | `core/skills/core-skill-deployment.ts`, `core-skill-runtime.ts` |
| Plain-JSON, harness-portable shape | **Core skill types** | `core/skills/core-skill-types.ts` |

## Safety contract

1. **Skills are external, versioned state.** A skill edit changes only the skill
   document version; it never changes the agent, model, weights, or any prompt
   wiring beyond injecting the deployed skill body as a read-only instruction
   fragment.
2. **Immutable deployed snapshots.** Promotion writes `deployed.json`. A changed
   body requires a strictly higher version
   (`snapshot_changed_without_version_increment`); the previous snapshot is archived
   under `deployed-history/` for rollback. Only an `accepted` card may be promoted
   (`promote_requires_accepted_status`). A candidate sharing a `skill_id` is a
   separate file and never overwrites the deployed snapshot.
3. **No optimizer/model call in the deployment/inference path.** Route selection
   (`selectRouteSkill`) reads only the deployed snapshot. The route proof record
   (`skillProofRecord`) records `optimizer_invoked: false` and carries the selected
   skill `skill_id` / `version` / `hash`.
4. **Rollback via archived snapshots.** `rollbackDeployment` restores the most
   recent archived snapshot below the current version.

## Release gates

| Gate id | Script |
| --- | --- |
| `core-skill:card-schema-deployment-snapshot` | `scripts/core-skill-card-schema-check.mjs`, `scripts/core-skill-deployment-snapshot-check.mjs` |
| `core-skill:route-runtime-integration` | `scripts/core-skill-route-runtime-integration-check.mjs` |

## Artifacts on disk

- `.sneakoscope/skills/<route>/<skill_id>/candidate-v<N>.json` — proposed candidate cards.
- `.sneakoscope/skills/<route>/<skill_id>/accepted-v<N>.json` — accepted cards.
- `.sneakoscope/skills/<route>/<skill_id>/deployed.json` — the immutable deployed snapshot (inference path reads this only).
- `.sneakoscope/skills/<route>/<skill_id>/deployed-history/v<N>.json` — archived snapshots for rollback.

## Schemas

- `schemas/skills/core-skill-card.schema.json` (`$id` `sks.core-skill-card.v1`)
