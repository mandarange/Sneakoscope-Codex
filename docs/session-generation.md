# Session Generation

SKS 1.18.1 separates worker slots from task sessions. A worker slot such as `slot-001` can run multiple immutable session generations:

- `sessions/slot-001/gen-1/`
- `sessions/slot-001/gen-2/`
- `sessions/slot-001/gen-3/`

Each generation has its own `agent-session-generation.json`, `agent-session-record.json`, terminal transcript, terminal close report, and backend report. Closed generations are history and are not reopened or overwritten.

Generation records include the slot id, generation index, work item id, persona id, terminal session id, started/closed timestamps, result artifact path, terminal close report path, Source Intelligence refs, and Goal mode refs. Final proof requires every generation to close and retain both refs.

The flat `sessions/<agent.id>` path remains compatibility-only for old single-generation callers.
