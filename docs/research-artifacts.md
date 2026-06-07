# Research Artifacts

Required 2.0.13 research artifacts include:

- `research-quality-contract.json`: threshold contract for source count, source layers, counterevidence, claim support, blueprint depth, falsification, experiments, and report length.
- `claim-evidence-matrix.json`: key claims, source ids, counterevidence ids, triangulation, unsupported claims, confidence, and test probes.
- `source-quality-report.json`: metadata completeness and claim citation coverage for `source-ledger.json`.
- `implementation-blueprint.json` and `implementation-blueprint.md`: read-only handoff sections for later execution routes.
- `experiment-plan.json` and `experiment-plan.md`: validation steps, metrics, controls, and acceptance threshold.
- `replication-pack.json`: inputs, commands, expected artifacts, and reproduction notes.
- `research-final-review.json`: final static reviewer decision. `approved=true` is required before the research gate can pass.
- `research-gate.evaluated.json`: computed gate result with quality metrics and blockers.

The legacy core artifacts still matter: `research-report.md`, the dated research paper artifact, `research-source-skill.md`, `source-ledger.json`, `agent-ledger.json`, `debate-ledger.json`, `novelty-ledger.json`, `falsification-ledger.json`, and `research-gate.json`.
