# Work Queue Expansion 1.18.3

SKS 1.18.4 uses the intelligent work graph to seed route priorities, task ownership, and serial or parallel bottleneck hints before work queue expansion runs.

SKS 1.18.2 separates route work expansion from active slot count.

SKS 1.18.3 makes the CLI-to-task-graph contract explicit: parsed `--work-items`, `--target-active-slots`, `--minimum-work-items`, and queue expansion limits must propagate into the orchestrator, task graph, queue, scheduler, and final proof.

`agents` is the target active slot count. `--work-items` is the desired work queue length. The orchestrator writes `agents/agent-task-graph.json` before scheduler start, then converts that graph to task slices and `agents/agent-work-queue.json`.

Required invariants:

- `target_active_slots` may be lower than `total_work_items`.
- `work_item_id` is stable for a route, prompt, domain, kind, and index.
- dependencies, priority, persona category, and lease requirements are schema-bound on every work item.
- write leases are deduplicated before slices reach the lease planner.
- route blackboxes use `5` active slots with `8` work items to prove backfill.

Useful checks:

```bash
npm run agent:task-graph-expansion
npm run agent:cli-options-to-task-graph
npm run agent:dynamic-pool-route-blackbox
```

## 1.18.6 Runtime Truth Note

SKS 1.18.6 keeps this surface in the runtime-truth release closure and links it to the lifecycle tmux proof, real Codex smoke v2, cleanup executor v2, AST-aware work graph, fake-real policy v2, and runtime truth matrix gates.
