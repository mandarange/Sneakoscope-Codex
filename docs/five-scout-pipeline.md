# Five-Scout Pipeline

SKS serious routes now start with a read-only five-scout intake before implementation or route finalization. The scouts inspect code surface, verification, safety/DB, visual/Voxel evidence, and simplification/integration. Their consensus becomes the implementation handoff and is recorded in Completion Proof.

For SKS 1.15.1, Scout evidence remains part of release readiness while MAD-SKS actual executor closure is bound separately through flagship proof graph v4.

## Commands

```bash
sks scouts plan latest --json
sks scouts run latest --engine auto --json
sks scouts run latest --engine local-static --mock --json
sks scouts run latest --engine codex-exec-parallel --require-output-schema --json
sks scouts run latest --require-real-parallel --json
sks scouts status latest --engine-runs --json
sks scouts consensus latest --engine-run-id <engine_run_id> --json
sks scouts handoff latest --engine-run-id <engine_run_id>
sks scouts validate latest --engine-run-id <engine_run_id> --strict --json
sks scouts engines --json
sks scouts bench latest --engine local-static --mock --json
sks scouts smoke latest --engine codex-exec-parallel --require-output-schema --real --json
sks scouts consensus latest --json
sks scouts handoff latest
sks scouts validate latest --strict --json
```

`sks scout ...` is an alias for `sks scouts ...`.

## Artifacts

Each mission writes:

- `scout-team-plan.json`
- `scout-parallel-ledger.jsonl`
- `scout-1-code-surface.md` and `.json`
- `scout-2-verification.md` and `.json`
- `scout-3-safety-db.md` and `.json`
- `scout-4-visual-voxel.md` and `.json`
- `scout-5-simplification-integration.md` and `.json`
- `scout-consensus.json`
- `scout-handoff.md`
- `scout-gate.json`
- `scout-engine-result.json`
- `scout-readonly-guard.json`
- `scout-performance.json`
- real-engine raw outputs such as `scout-1-code-surface.codex.md` or `scout-1-code-surface.tmux.md`

The package-level summary is `.sneakoscope/reports/scout-performance-summary.json`.

In 1.15.1, every Scout intake has a `scout-run-<timestamp>-<engine>-<hash>` `engine_run_id`. Canonical route intake still writes the normal mission-level `scout-*.json` files, while benchmark and real-smoke runs write under `.sneakoscope/missions/<id>/scout-benchmarks/<engine_run_id>/` or a smoke-specific namespace and record `canonical_artifacts_modified:false`.

Engine-run query UX is release-bound: `status`, `consensus`, `handoff`, and `validate` must all accept `--engine-run-id` so users can inspect a specific Scout engine run without confusing it with canonical route intake. Opt-in real smoke verifies Codex exec parallel output-schema sessions when the local Codex runtime is available; unavailable real execution is a structured blocker or verified-partial result, not a synthetic success.

## Route Policy

Default serious routes require the `five_scout_parallel_intake` pipeline stage: Team, QA-LOOP, Research, AutoResearch, PPT, Image UX Review, From-Chat-IMG, Computer Use/CU, DB, GX, MAD-SKS, and serious Goal continuations. MAD-SKS Scout intake must include permission-kernel, immutable-guard, audit/rollback, and protected-core risks. Wiki requires scouts only when it is stateful, visual, or proof-bearing. Lightweight routes such as DFix, Answer, Help, Commit, Commit-And-Push, `sks version`, `sks help`, and `sks root` skip scouts unless explicitly forced.

Force or disable scout planning:

```bash
sks pipeline plan latest --scouts 5 --force-scouts --json
sks pipeline plan latest --no-scouts --json
```

Disabling scouts must be represented as a proof/evidence decision; it does not support parallel speed claims.

## Read-Only Contract

Scouts can read code, docs, tests, mission artifacts, TriWiki state, and safety policy. They must not edit source code, delete files, install packages, apply migrations, write databases, commit, push, or represent mock/static evidence as real execution evidence.

If real parallel execution is unavailable or not requested, SKS records `local-static` or `sequential-fallback` as verified-partial evidence. Mock/static runs set `claim_allowed: false`; real speedup claims require a real parallel engine, five parsed real outputs, a passing read-only guard, and measured sequential baseline evidence.

## Real Output Binding

Real engines write raw markdown/output files first. SKS then parses those files into normal scout JSON artifacts. `sks.scout-result.v3` records `engine_run_id`, `scout_session_id`, `engine_mode`, output-schema use, lifecycle status, stdout/stderr paths, read-only confirmation, and artifact namespace. `scout-consensus.json` promotes only schema-valid completed results. Unparseable or schema-invalid real output becomes a structured blocker; SKS does not replace that result with a synthetic static finding.
