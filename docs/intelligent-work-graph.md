# Intelligent Work Graph 1.18.5

SKS 1.18.5 upgrades task graph planning with `sks.intelligent-work-graph.v2`.

The planner combines repository inventory, source files, tests, docs, scripts, schemas, import edges, lightweight AST symbol inventory, file-to-symbol and symbol-to-file maps, exported API ownership, command/module ownership, route/module ownership, changed-file candidates, route domain priority, test ownership beyond basename heuristics, source-to-test relations, critical path, integration bottlenecks, parallelizable groups, and serial dependency groups.

Agent runs write:

- `agents/agent-intelligent-work-graph.json`
- `agents/agent-test-ownership-map.json`
- `agents/agent-critical-path.json`
- `agents/agent-integration-bottlenecks.json`

The task graph carries `work_graph_quality_score`, `ast_coverage`, `test_ownership_confidence`, proof level, dependencies, lease hints, and artifact refs. Low AST/test ownership produces warnings and a partial work graph status; very low quality is a release gate blocker. Integration and verifier personas receive bottleneck, critical path, changed-file priority, and test ownership context through the graph artifacts.
