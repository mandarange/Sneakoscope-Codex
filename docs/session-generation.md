# Session Generation

SKS 1.18.4 ties session-generation proof to fake-vs-real policy, real tmux pane checks, and Codex dynamic smoke evidence so completed generations do not overclaim runtime truth.

SKS 1.18.2 separates worker slots from task sessions. A worker slot such as `slot-001` can run multiple immutable session generations:

SKS 1.18.3 ties those generations to the actual route command, requested work item counts, terminal close reports, and persistent slot lane evidence so replacement generations cannot be counted without matching scheduler proof.

- `sessions/slot-001/gen-1/`
- `sessions/slot-001/gen-2/`
- `sessions/slot-001/gen-3/`

Each generation has its own `agent-session-generation.json`, `agent-session-record.json`, terminal transcript, terminal close report, and backend report. Closed generations are history and are not reopened or overwritten.

Generation records include the slot id, generation index, work item id, persona id, terminal session id, started/closed timestamps, result artifact path, terminal close report path, Source Intelligence refs, and Goal mode refs. Final proof requires every generation to close and retain both refs.

The flat `sessions/<agent.id>` path remains compatibility-only for old single-generation callers.

## 1.18.5 Runtime Truth Note

SKS 1.18.5 keeps this surface in the runtime-truth release closure and links it to the lifecycle tmux proof, real Codex smoke v2, cleanup executor v2, AST-aware work graph, fake-real policy v2, and runtime truth matrix gates.
