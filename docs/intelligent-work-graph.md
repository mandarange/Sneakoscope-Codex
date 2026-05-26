# Intelligent Work Graph 1.18.4

SKS 1.18.4 upgrades task graph planning with `sks.intelligent-work-graph.v1`.

The planner combines repository inventory, source files, tests, docs, scripts, schemas, import edges, changed-file candidates, route domain priority, test ownership, source-to-test relations, critical path, integration bottlenecks, parallelizable groups, and serial dependency groups.

Agent runs write:

- `agents/agent-intelligent-work-graph.json`
- `agents/agent-test-ownership-map.json`
- `agents/agent-critical-path.json`
- `agents/agent-integration-bottlenecks.json`

The task graph carries `work_graph_quality_score` plus artifact refs. Low test ownership produces warnings and a partial work graph status; very low quality is a release gate blocker. Integration and verifier personas receive bottleneck and test ownership context through the graph artifacts.
