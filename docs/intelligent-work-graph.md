# Intelligent Work Graph 1.18.6

SKS 1.18.6 upgrades task graph planning with `sks.intelligent-work-graph.v2`.

The planner combines repository inventory, source files, tests, docs, scripts, schemas, import edges, lightweight AST symbol inventory, file-to-symbol and symbol-to-file maps, exported API ownership, command/module ownership, route/module ownership, changed-file candidates, route domain priority, test ownership beyond basename heuristics, source-to-test relations, critical path, integration bottlenecks, parallelizable groups, and serial dependency groups.

Agent runs write:

- `agents/agent-intelligent-work-graph.json`
- `agents/agent-intelligent-work-graph-v2.json`
- `agents/agent-symbol-ownership-map.json`
- `agents/agent-route-ownership-map.json`
- `agents/agent-command-ownership-map.json`
- `agents/agent-test-ownership-map.json`
- `agents/agent-source-test-ownership-v2.json`
- `agents/agent-critical-path.json`
- `agents/agent-critical-path-v2.json`
- `agents/agent-integration-bottlenecks.json`
- `agents/agent-integration-bottlenecks-v2.json`

The task graph carries `work_graph_quality_score`, `ast_coverage`, `test_ownership_confidence`, proof level, dependencies, lease hints, and artifact refs. The AST inventory uses the TypeScript compiler API in syntax-only mode, so exported/imported symbol ownership is evidence-backed without claiming type-checker precision. Low AST/test ownership produces warnings and a partial work graph status; very low quality is a release gate blocker. Integration and verifier personas receive bottleneck, critical path, changed-file priority, and test ownership context through the graph artifacts.
