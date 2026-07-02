# Pipeline Architecture

SKS keeps `src/core/pipeline.ts` as the only compatibility facade and exposes split module surfaces under `src/core/pipeline/`.

## Modules

- `plan-schema.mjs`: plan constants.
- `stage-policy.mjs`: stage policy exports.
- `agent-stage-policy.mjs`: native agent stage policy exports.
- `route-prep.mjs`: route preparation entrypoint.
- `route-prep-team.mjs`, `route-prep-research.mjs`, `route-prep-qa.mjs`, `route-prep-ppt.mjs`, `route-prep-image-ux.mjs`, `route-prep-db.mjs`, `route-prep-gx.mjs`: route-family preparation surfaces.
- `stop-gate.mjs`: Context7, subagent, proof, reflection, and stop-gate exports.
- `stop-gate-context7.mjs`, `stop-gate-subagents.mjs`, `stop-gate-proof.mjs`: focused stop-gate surfaces.
- `active-context.mjs`: active route context export.
- `prompt-context.mjs`: prompt context exports.
- `prompt-context-dfix.mjs`, `prompt-context-answer.mjs`, `prompt-context-computer-use.mjs`: focused prompt context surfaces.
- `pipeline-plan-writer.mjs`: plan build/write/validate exports.
- `validation.mjs`: plan validation export.

## Budget

`npm run pipeline-budget:check` enforces:

- `src/core/pipeline.ts` is at most 200 lines.
- `src/core/pipeline-runtime.ts` is absent; imports must use `src/core/pipeline.ts`.
- each `src/core/pipeline/*.ts` file is at most 1000 lines.
- no direct `src/core/pipeline/*.ts` module imports more than 35 modules.
- all required split module files exist.

`npm run pipeline-runtime:check` independently verifies the duplicate runtime facade stays absent. `npm run pipeline-budget:check` includes the same guard so a new shim cannot bypass the release gate.

Existing runtime imports resolve through built `dist/core/pipeline.js`.
