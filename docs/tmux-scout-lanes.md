# tmux Scout Lanes

`tmux-lanes` is an opt-in real Scout execution engine. It is not required by the normal release gate because live tmux and Codex CLI availability are host-dependent.

## Commands

```bash
sks scouts run latest --engine tmux-lanes --json
sks scouts run latest --engine tmux-lanes --attach
sks scouts run latest --engine tmux-lanes --no-attach --json
```

## Runtime Contract

- create a session named `sks-scouts-<mission-id>`;
- create one tmux window per scout;
- send a read-only Codex exec command for each scout;
- write raw output to `scout-N.tmux.md`;
- collect stdout/stderr logs;
- watch for output files until timeout;
- parse outputs through `scout-output-parser`;
- clean up the tmux session unless explicitly kept.

If tmux or Codex is unavailable, the engine returns precise blockers. If outputs time out or fail to parse, the affected scouts are blocked and no real-speedup claim is allowed.
