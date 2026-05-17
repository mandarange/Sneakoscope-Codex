# Pipeline Architecture

SKS 0.9.18 keeps `src/core/pipeline.mjs` as a compatibility facade and exposes split module surfaces under `src/core/pipeline/`.

## Modules

- `plan-schema.mjs`: plan constants.
- `stage-policy.mjs`: stage policy exports.
- `scout-stage-policy.mjs`: scout-stage policy exports.
- `route-prep.mjs`: route preparation entrypoint.
- `stop-gate.mjs`: Context7, subagent, proof, reflection, and stop-gate exports.
- `active-context.mjs`: active route context export.
- `prompt-context.mjs`: prompt context exports.
- `pipeline-plan-writer.mjs`: plan build/write/validate exports.
- `validation.mjs`: plan validation export.

## Budget

`npm run pipeline-budget:check` enforces:

- `src/core/pipeline.mjs` is at most 200 lines.
- each `src/core/pipeline/*.mjs` file is at most 1000 lines.
- all required split module files exist.

Existing imports from `src/core/pipeline.mjs` continue to work.
