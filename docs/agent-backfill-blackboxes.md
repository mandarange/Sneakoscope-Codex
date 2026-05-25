# Agent Backfill Blackboxes 1.18.2

SKS 1.18.2 release readiness includes route-level blackboxes for dynamic backfill.

The required route gates are:

```bash
npm run agent:dynamic-pool-route-blackbox
npm run agent:backfill-route-blackbox
npm run team:backfill-route-blackbox
npm run research:backfill-route-blackbox
npm run qa:backfill-route-blackbox
```

Each gate runs the native orchestrator through the command surface with `--agents 5 --work-items 8 --target-active-slots 5 --mock --json`. The fixture delays the first two work items so they finish early, keeps three first-wave items slower, and verifies that replacement generations launch from the pending queue before drain.

The blackboxes assert:

- task graph schema is `sks.agent-task-graph.v1`.
- target active slots are `5`.
- total work items are `8`.
- max observed active slots are `5`.
- expected backfill count is at least `2`.
- actual backfill count satisfies expected backfill.
- queue drains.
- all generations close.
- terminal close reports cover generations.
- Source Intelligence and Goal refs propagate.
- tmux lane no-flicker proof is true.
