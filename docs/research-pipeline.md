# SKS Research Pipeline

SKS Research is a read-only route for source-backed discovery and implementation handoff. It writes only mission-local artifacts under `.sneakoscope/missions/<id>/`; repository source, package metadata, docs, config, and generated harness files remain out of scope during a normal research run.

As of 2.0.14, every research mission is created with `research-quality-contract.json`. The default contract requires at least 12 total sources, 5 covered source layers, 2 counterevidence sources, 8 key claims, 6 triangulated claims, 8 implementation blueprint sections, 4 falsification cases, 5 experiment steps, and a 2200-word research report before the gate can pass.

The native run writes `research-work-graph.json` and executes a dependency-aware cycle runner. Source layers become parallel `source_shard_*` stages, then `source_ledger_merge`, `claim_matrix_build`, `falsification`, `implementation_blueprint`, `experiment_plan`, `synthesis`, `final_review`, and `verification` run only after their dependencies finish. Research is not a code-change route: stages may write mission artifacts, but source/package/docs/config mutation is blocked.

`source-ledger.json` is merged from source shard partials, and `claim-evidence-matrix.json` is built from the merged source, novelty, and falsification ledgers. The implementation blueprint is repository-aware and leaves `team-handoff-goal.md` for `$Team` or `$Naruto`; it is not an implementation patch.

Final review has two layers: `research-final-review.static.json` from deterministic validators and `research-final-review.codex.json` from Codex/GPT review in real runs. Mock fixtures may use a mock Codex reviewer artifact, but real source blockers or missing Codex/GPT review keep the gate unpassed.

Fast checks:

```sh
npm run research:quality-gates
npm run research:stage-cycle-runtime-blackbox
npm run research:short-report-rejection
npm run codex-sdk:research-pipeline
sks research run latest --mock --json
```
