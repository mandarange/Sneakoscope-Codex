# Agent Cleanup Executor 1.18.6

SKS 1.18.6 makes `sks agent cleanup` and `sks agent close` process-tree-aware cleanup transactions instead of artifact-only readers.

The executor writes:

- `agents/agent-cleanup-proof.json`
- `agents/agent-cleanup-action-ledger.jsonl`
- `agents/agent-command-cleanup.json`

The cleanup proof uses schema `sks.agent-cleanup-proof.v2` and records project namespace, mission id, dry-run/apply mode, process trees, SIGTERM sends, bounded grace waits, SIGKILL escalations, verified process exits, stale tmux panes found and closed, orphan temp dirs found and removed, stale locks found and removed, skipped active sessions, skipped foreign namespace paths, and preserved terminal transcripts.

Safety rules remain narrow and explicit: active sessions are skipped, foreign project namespaces are skipped, terminal transcripts are preserved, and destructive database or project reset behavior is outside the cleanup executor.

Examples:

```bash
sks agent cleanup latest --dry-run --json
sks agent cleanup latest --apply --stale-ms 1800000 --json
sks agent close latest --drain --apply --json
```
