# Pipeline Architecture

SKS keeps `src/core/pipeline.ts` as the only compatibility facade. It re-exports the pipeline plan, prompt-context, route-preparation, active-context, and stop-gate APIs directly from `src/core/pipeline-internals/runtime-core.ts`.

## Modules

- `src/core/pipeline-internals/runtime-core.ts`: plan constants, plan build/write/validate, route preparation, prompt context, active route context, and Context7/subagent evidence.
- `src/core/pipeline-internals/runtime-gates.ts`: stop-gate evaluation and gate status projection.
- `src/core/pipeline/finalize-pipeline-result.ts`, `gpt-final-required.ts`, `final-gpt-patch-stage.ts`, `final-gpt-review-stage.ts`: the final GPT review stage for pipeline results.

## Guard

`npm run pipeline-runtime:check` verifies the duplicate runtime facade `src/core/pipeline-runtime.ts` stays absent; imports must use `src/core/pipeline.ts`. `npm run architecture:check` runs that guard.

Existing runtime imports resolve through built `dist/core/pipeline.js`.
