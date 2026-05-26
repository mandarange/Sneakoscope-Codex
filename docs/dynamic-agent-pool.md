# Dynamic Agent Pool

SKS 1.18.3 treats `agents` as the target number of active worker slots, not as a fixed total session count. A run with `agents=5 --work-items 8` keeps five active slots running while the route work queue still has pending, dependency-released items.

The orchestrator builds a work-item-first task graph before the scheduler starts. The graph writes `agents/agent-task-graph.json` and separates:

- `target_active_slots`: the desired active worker slots.
- `desired_work_items`: the requested route work item count.
- `minimum_work_items`: the minimum work queue size.
- `total_work_items`: the total route work queue length.
- `route_work_count_summary`: operator-facing confirmation that work items may exceed active slots.

The scheduler writes:

- `agents/agent-scheduler-state.json`
- `agents/agent-scheduler-events.jsonl`
- `agents/agent-work-queue.json`
- `agents/agent-work-queue-events.jsonl`
- `agents/agent-worker-slots.json`
- `agents/agent-session-generations.json`

When one session finishes and work remains, the slot becomes idle, the scheduler immediately leases the next pending item, and the same slot opens a new immutable session generation. Proof blocks if pending work exists while active slots are zero, if expected backfill events are missing, or if the queue is not drained.

The release gates exercise actual Agent, Team, Research, and QA route commands where five active slots start, two early sessions close, and replacement generations launch from the pending queue before drain. The standalone scheduler fixture remains low-level evidence only. Route truth requires `agent-task-graph.json`, `agent-work-queue.json`, `agent-scheduler-state.json`, `agent-proof-evidence.json`, terminal generation close reports, Source Intelligence refs, Goal refs, and the tmux lane supervisor to agree on the same work count and active-slot contract.
