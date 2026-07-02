# Deprecated Team Alias

New execution work uses `$Naruto` / `sks naruto run`. `sks team "<task>"` remains only as a deprecated compatibility alias: it prints a deprecation warning, redirects to Naruto, and writes `team-alias-to-naruto.json` beside the Naruto gate artifacts.

## New Work

Use Naruto directly:

```bash
sks naruto run "wide change" --clones 8 --work-items 16
sks naruto status latest --json
sks naruto proof latest --json
```

## Legacy Observation

Read-only Team observation commands remain for old missions that already have Team artifacts:

```bash
sks team status latest
sks team watch latest
sks team lane latest --agent native_agent_1 --follow
sks team log latest
```

Legacy `team-gate.json` is read only for old missions. New missions close through `naruto-gate.json`.
