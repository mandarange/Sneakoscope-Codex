# Native Agent Kernel

SKS 1.16.0 release note.

SKS 1.16 routes Team, Research, AutoResearch, QA-Loop, and review-style work through a native multi-session agent kernel. The legacy multi-agent command surface is removed; route gates use native agent proof only.

## Command Surface

```bash
sks agent run "map this change" --mock --json
sks agent run "map this change" --agents 8 --concurrency 4 --mock --json
sks agent run "release audit" --route '$Release-Review' --agents 10 --concurrency 4 --mock --json
sks agent status latest --json
sks --agent "map this change" --mock --json
```

The agent kernel writes route-local evidence under `.sneakoscope/missions/<mission-id>/agents/`:

- `agent-proof-evidence.json` records backend, pass/block state, session closure, lease overlap status, and fake-backend disclaimers.
- `agent-sessions.json` records opened, heartbeat, and closed sessions.
- `agent-leases.json` and `agent-conflict-graph.json` prove non-overlapping ownership.
- `agent-events.jsonl` is append-only with a hash chain.
- `agent-effort-policy.json` records parent-assigned per-agent effort and dynamic escalation/downshift triggers.
- `agent-consensus.json` summarizes blockers and agreements.
- `agent-output-tails.json` records bounded stdout/stderr tails from process-style workers.
- `agent-timeout-kill-report.json` records timed-out sessions that the orchestrator marked killed before cleanup/proof.

## Recursion Guard

Worker prompts use `AGENT_WORKER_PIPELINE` and are blocked from recursively launching SKS route orchestrators such as `sks team`, `sks agent run`, `sks research run`, `$Team`, `$Goal`, and QA/Review route commands. Violations are written to `agent-recursion-guard.json` and block proof.

`non-recursive-pipeline-report.json` is the release-facing policy artifact for this guard. It proves the env guard, route denylist, worker mission/current-state write blocks, stdout/stderr transcript checks, agent-result checks, wrongness records, trust report, and evidence router all agree before native agent proof is trusted.

## Agent Counts

The default roster is five independent personas. The hard maximum is twenty agents, with a separate concurrency cap so larger rosters batch instead of overlapping leases.

Manual fan-out controls:

- `--agents N` chooses the roster size, from 1 to 20.
- `--concurrency N` chooses how many sessions run in one batch.
- Team prompts also accept role counts such as `$Team <task> executor:8 reviewer:5`.
- Codex App Team prompts can set the Team width with count-first text such as `$Team 20:agents <task>` or `$Team 20:agent <task>`. The budget token is removed from the task prompt, maps to the Team bundle/session budget, and remains capped at 20.

The parent assigns effort per lane: low for narrow read-only/docs work, medium for normal tooling and lease mapping, high for safety/DB/schema/release lanes, and xhigh for frontier or forensic work. A lane can escalate when a blocker, lease conflict, schema failure, DB risk, or release risk appears; unrelated lanes can stay cheaper.

## Truthfulness

The `fake` backend is for fixtures only and must not be described as real parallel execution. Real parallel claims require the `codex-exec` backend and proof evidence that sessions closed, leases did not overlap, and no recursion guard fired.

## Route Collaboration

Review, PPT-Collab, UX-Collab, DB-Review, and Release-Review all write the same native collaboration evidence: central ledger, task board, non-overlap leases, session cleanup, proof graph, trust report, and a route-specific `*-native-agent-plan.json`. These plans include route personas and a native-only backend note.

## 1.16.1 Runtime Closure

SKS 1.16.1 routes release-critical Team, Research, QA, and native agent proof checks through the native agent orchestrator, Codex exec output-last-message parsing, central ledger proof, and no-scout runtime gates.

SKS 1.16.2 keeps that native-agent runtime closure and adds Codex App prompt-side Team budget tokens such as `$Team 20:agents <task>` and `$Team 20:agent <task>`.
