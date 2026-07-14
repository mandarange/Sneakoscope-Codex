# Team Compatibility Alias

New Team-style execution uses `$Naruto`, the Codex official subagent workflow.
`$Team` and `sks team "<task>"` remain compatibility aliases that redirect new
missions to Naruto and emit the documented deprecation notice.

## New Work

Use the canonical Naruto surface when possible:

```bash
sks naruto run "wide change" --agents 8 --max-threads 12
sks naruto status latest --json
sks naruto subagents latest --json
sks naruto proof latest --json
```

The parent uses GPT-5.6 Sol Max. Child roles use the same fixed Naruto matrix:
Luna Max only for tiny short-context mechanical work, Sol High for ordinary
implementation, Sol Max for judgment-heavy work, and Terra Medium for
long-context or Computer Use, Browser/Chrome, and image-generation execution.
Official
`SubagentStart`/`SubagentStop` events establish lifecycle, and a trustworthy
structured parent summary must provide the outcome of every stopped thread
before completion can pass.

## Legacy Observation

Read-only Team observation commands remain for missions that already have
historical Team artifacts:

```bash
sks team status latest
sks team watch latest
sks team lane latest --agent native_agent_1 --follow
sks team log latest
```

Legacy `team-gate.json` is read only for old missions. New redirected missions
close through official Naruto artifacts such as `subagent-evidence.json` and
`naruto-gate.json`.
