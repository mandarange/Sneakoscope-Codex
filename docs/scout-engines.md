# Scout Engines

SKS 0.9.18 routes Five-Scout intake through an engine policy instead of treating every run as local static work.

## Engines

- `codex-exec-parallel`: launches one Codex exec job per scout when the Codex CLI is available.
- `tmux-lanes`: reports tmux lane availability and blocks with a precise reason when lane execution is not active.
- `codex-app-subagents`: available only when a local Codex App subagent capability is explicitly exposed; SKS does not invent schemas or event payloads.
- `local-static`: deterministic fallback for mock and release fixtures.
- `sequential-fallback`: deterministic fallback when parallel execution is not available.

## Commands

```bash
sks scouts engines --json
sks scouts run latest --engine auto --json
sks scouts run latest --engine local-static --mock --json
sks scouts run latest --require-real-parallel --json
sks scouts bench latest --engine local-static --mock --json
```

## Claim Policy

`scout-performance.json` uses `sks.scout-performance.v2`. Mock/static fallback cannot support real speedup claims. A speedup claim is allowed only when `real_parallel=true` and the run has measured sequential baseline evidence that supports the claim.

## Read-Only Guard

Scout runs snapshot source files before and after execution. Writes are allowed only under `.sneakoscope/missions/<id>/scout-*` and `.sneakoscope/reports/scout-*`. Source, package, migration, SQL, generated app asset, and git state modifications block the scout gate.
