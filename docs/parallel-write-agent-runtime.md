# Parallel Write Agent Runtime

The default Naruto path delegates parallel work through Codex official
subagents:

```bash
sks naruto run "update independent packages" --agents 8 --max-threads 12
```

`--agents` requests total subagents. `--max-threads` bounds concurrent official
agent threads, and larger requests are handled in waves. `max_depth = 1`
prohibits nested delegation.

Parallel writes are safe only when the parent assigns independent slices with
disjoint file ownership. Overlapping paths must be serialized. Workers do not
integrate each other's output; the parent collects all results, resolves
conflicts, runs scoped verification, and writes the final summary.

A Naruto run is not proven by recorded flags, process counts, patch-envelope
counts, or Zellij panes. Completion requires matched official
`SubagentStart`/`SubagentStop` thread IDs, no failed or open thread, the final
requested count, and a trustworthy `sks.subagent-parent-summary.v1` object with
an explicit completed outcome for every thread. `SubagentStop` alone has no
success status and therefore fails closed without that parent correlation.

The separate `sks agent run` command retains its documented patch queue,
parallel write-mode, apply, and rollback surfaces. Those artifacts may prove an
agent-runtime mission, but they are not substituted for official Naruto event
evidence.

Historical Naruto process-swarm flags such as `--write-mode`, `--apply-patches`,
`--work-items`, and custom backends are rejected on the default path. Operators
who explicitly need the retained compatibility runtime must set
`SKS_NARUTO_LEGACY_PROCESS_SWARM=1`; SKS never enables it automatically.
