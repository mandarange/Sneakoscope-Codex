# Jev implementation baseline

The baseline is `ce6203869b83fd729be08cfb2f74ec2c632c41ba` (`origin/main`) captured on 2026-10-07 with package version `10.5.6`, Node `v24.19.0`, and npm `11.9.0`. The default decision mode is `off`; this repository evidence does not imply a live OpenRouter request.

A clean temporary worktree at the exact baseline passed `npm run typecheck`, `npm run build:clean`, `npm run architecture:check`, and `npm run test:release` (198/198). The current checkout additionally passes `npm run schema:check`, `npm run runtime:no-src-mjs`, and `npm run runtime:ts-source-of-truth`; the complete results are in [acceptance-evidence.md](acceptance-evidence.md).

The owners are `decisions/types.ts` and `questions.ts` for the fixed-choice bundle, `hooks-runtime/jev-turn-plan.ts` for one eligible-turn call, `pipeline-stage-builder.ts` for the stage manifest/compiler, `runtime-core.ts` and `runtime-gates.ts` for typed state and mutation barriers, `lru-cache.ts`/`route-cache.ts` for bounded digest memoization, `memory-governor.ts`/`evaluation.ts` for lifecycle, `memory/jev-memory-intake.ts` for mission staging, `shared-memory-publish.ts` for canonical promotion and bounded overlay reads, `triwiki-attention.ts` for ranking/projection, and `wiki-image/*` for image ledgers and validation.

Align uses preservation strategy A: generated code-navigation surfaces are swapped atomically while canonical shared-memory subtrees are copied, hash-verified, and indexed in the new generation. The code graph remains source-only. Memory overlay records remain in a separate provenance section and use deterministic coordinate/voxel projection.

Historical 10.3 evidence is retained under `docs/jev/archive/` and is not an active protocol description. The current change manifest, owner map, migration manifest, inventory, and final proof are under `.sneakoscope/reports/jev-vnext/`.
