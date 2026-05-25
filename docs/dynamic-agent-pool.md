# Dynamic Agent Pool

SKS 1.18.1 treats `agents` as the target number of active worker slots, not as a fixed total session count. A run with `agents=5` keeps up to five active slots running while the work queue still has pending, dependency-released items.

The scheduler writes:

- `agents/agent-scheduler-state.json`
- `agents/agent-scheduler-events.jsonl`
- `agents/agent-work-queue.json`
- `agents/agent-work-queue-events.jsonl`
- `agents/agent-worker-slots.json`
- `agents/agent-session-generations.json`

When one session finishes and work remains, the slot becomes idle, the scheduler immediately leases the next pending item, and the same slot opens a new immutable session generation. Proof blocks if pending work exists while active slots are zero, if expected backfill events are missing, or if the queue is not drained.

The release gate exercises the blackbox case where five active slots start, two early sessions close, and two replacement generations launch before the remaining three first-wave sessions finish.
