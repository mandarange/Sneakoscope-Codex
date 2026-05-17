# Five-Scout Pipeline

SKS serious routes now start with a read-only five-scout intake before implementation or route finalization. The scouts inspect code surface, verification, safety/DB, visual/Voxel evidence, and simplification/integration. Their consensus becomes the implementation handoff and is recorded in Completion Proof.

## Commands

```bash
sks scouts plan latest --json
sks scouts run latest --json
sks scouts status latest --json
sks scouts consensus latest --json
sks scouts handoff latest
sks scouts validate latest --json
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
- `scout-performance.json`

The package-level summary is `.sneakoscope/reports/scout-performance-summary.json`.

## Route Policy

Default serious routes require the `five_scout_parallel_intake` pipeline stage: Team, QA-LOOP, Research, AutoResearch, PPT, Image UX Review, From-Chat-IMG, Computer Use/CU, DB, GX, MAD-SKS, and serious Goal continuations. Wiki requires scouts only when it is stateful, visual, or proof-bearing. Lightweight routes such as DFix, Answer, Help, Commit, Commit-And-Push, `sks version`, `sks help`, and `sks root` skip scouts unless explicitly forced.

Force or disable scout planning:

```bash
sks pipeline plan latest --scouts 5 --force-scouts --json
sks pipeline plan latest --no-scouts --json
```

Disabling scouts must be represented as a proof/evidence decision; it does not support parallel speed claims.

## Read-Only Contract

Scouts can read code, docs, tests, mission artifacts, TriWiki state, and safety policy. They must not edit source code, delete files, install packages, apply migrations, write databases, commit, push, or represent mock/static evidence as real execution evidence.

If parallel execution is unavailable, SKS records `sequential_fallback`. The local deterministic runner can use bounded static parallel work, but `scout-performance.json` sets `claim_allowed: false` until real benchmark evidence supports a speedup claim.
