# Agent Backfill Blackboxes 1.18.3

SKS 1.18.4 adds blackbox route realism checks so Agent, Team, Research, and QA helpers cannot satisfy release gates through Agent-only stand-ins.

SKS 1.18.3 release readiness includes route-truth blackboxes for dynamic backfill.

The required route gates are:

```bash
npm run agent:dynamic-pool-route-blackbox
npm run agent:backfill-route-blackbox
npm run agent:route-truth-backfill
npm run team:backfill-route-blackbox
npm run team:actual-route-backfill
npm run research:backfill-route-blackbox
npm run research:actual-route-backfill
npm run qa:backfill-route-blackbox
npm run qa:actual-route-backfill
```

Each gate runs the native orchestrator through the actual route command surface with `--agents 5 --work-items 8 --target-active-slots 5 --minimum-work-items 5 --mock --json`. Agent uses `sks agent run`, the deprecated Team compatibility surface uses `sks team` only to prove Naruto redirection, Research uses `sks research prepare` plus `sks research run`, and QA uses `sks qa-loop prepare` plus `sks qa-loop run`. The fixture delays the first two work items so they finish early, keeps three first-wave items slower, and verifies that replacement generations launch from the pending queue before drain. A non-Agent route fails if proof shows a generic `sks agent run --route` stand-in.

The blackboxes assert:

- task graph schema is `sks.agent-task-graph.v1`.
- task graph, work queue, scheduler, and proof all report the requested work count.
- target active slots are `5`.
- total work items are `8`.
- max observed active slots are `5`.
- expected backfill count is at least `2`.
- actual backfill count satisfies expected backfill.
- queue drains.
- all generations close.
- terminal close reports cover generations.
- Source Intelligence and Goal refs propagate.
- the proof records `real_route_command_used: true`.
- tmux lane no-flicker proof is true.

## 1.18.6 Runtime Truth Note

SKS 1.18.6 keeps this surface in the runtime-truth release closure and links it to the lifecycle tmux proof, real Codex smoke v2, cleanup executor v2, AST-aware work graph, fake-real policy v2, and runtime truth matrix gates.
