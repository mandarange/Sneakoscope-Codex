# Scout Engines

SKS 0.9.19 routes Five-Scout intake through an engine policy and only trusts real engine output after it parses into `sks.scout-result.v1`.

## Engines

- `codex-exec-parallel`: launches one Codex exec job per scout, captures output/stdout/stderr files, parses the output, and blocks unparseable results.
- `tmux-lanes`: opt-in local execution through a `sks-scouts-<mission-id>` tmux session, one lane per scout, watcher timeout, output parsing, and cleanup.
- `codex-app-subagents`: available only when a valid local capability descriptor is exposed; SKS does not trust `SKS_CODEX_APP_SUBAGENTS=1` by itself.
- `local-static`: deterministic fallback for mock and release fixtures.
- `sequential-fallback`: deterministic fallback when parallel execution is not available.

## Commands

```bash
sks scouts engines --json
sks scouts run latest --engine auto --json
sks scouts run latest --engine local-static --mock --json
sks scouts run latest --require-real-parallel --json
sks scouts bench latest --engine local-static --mock --json
sks scouts run latest --engine tmux-lanes --json
sks scouts run latest --engine tmux-lanes --attach
```

## Claim Policy

`scout-performance.json` uses `sks.scout-performance.v2`. Mock/static fallback cannot support real speedup claims. A speedup claim is allowed only when `real_parallel=true`, all five real outputs parse successfully, no scout is blocked, and the measured sequential baseline supports the claim.

## Codex App Capability Descriptor

```json
{
  "schema": "sks.codex-app-subagents-capability.v1",
  "available": true,
  "launch_command": ["codex", "app", "subagents", "run"],
  "event_schema_version": "known-local",
  "supports_output_files": true
}
```

## Read-Only Guard

Scout runs snapshot source files before and after execution. Writes are allowed only under `.sneakoscope/missions/<id>/scout-*` and `.sneakoscope/reports/scout-*`. Source, package, migration, SQL, generated app asset, and git state modifications block the scout gate.
