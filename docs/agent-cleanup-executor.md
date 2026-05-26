# Agent Cleanup Executor 1.18.4

SKS 1.18.4 makes `sks agent cleanup` and `sks agent close` executable cleanup paths instead of artifact-only readers.

The executor writes:

- `agents/agent-cleanup-proof.json`
- `agents/agent-cleanup-action-ledger.jsonl`
- `agents/agent-command-cleanup.json`

The cleanup proof uses schema `sks.agent-cleanup-proof.v1` and records project namespace, mission id, dry-run/apply mode, stale processes found and killed, stale tmux panes found and closed, orphan temp dirs found and removed, stale locks found and removed, skipped active sessions, skipped foreign namespace paths, and preserved terminal transcripts.

Safety rules remain narrow and explicit: active sessions are skipped, foreign project namespaces are skipped, terminal transcripts are preserved, and destructive database or project reset behavior is outside the cleanup executor.

Examples:

```bash
sks agent cleanup latest --dry-run --json
sks agent cleanup latest --apply --json
sks agent close latest --drain --json
```
