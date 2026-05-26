# Scheduler Proof Gates 1.18.3

SKS 1.18.2 proof requires scheduler truth from route artifacts, not standalone fixtures alone.

SKS 1.18.3 reconciles proof across task graph, work queue, scheduler state, terminal close reports, Source Intelligence refs, Goal refs, and tmux lane supervisor artifacts for the actual route command that launched the run.

Required artifacts:

- `agents/agent-task-graph.json`
- `agents/agent-work-queue.json`
- `agents/agent-scheduler-events.jsonl`
- `agents/agent-worker-slots.json`
- `agents/agent-session-generations.json`
- generation terminal close reports
- Source Intelligence and Goal mode refs on every generation
- tmux lane supervisor state

Blocking invariants:

- pending work with zero active sessions.
- expected backfill greater than actual backfill.
- final active slots not zero.
- queue not drained.
- max observed active slots below target when enough work exists.
- terminal close reports below generation count.
- missing Source Intelligence or Goal refs.
- tmux lane closed before drain.

Useful check:

```bash
npm run agent:scheduler-proof-hardening
npm run agent:proof-contract-reconciled
```
