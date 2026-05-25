# Parallel Verification Engine

SKS 1.17.0 treats release verification as a dependency DAG.

Each verification task declares an id, command, cwd/env, inputs, outputs, dependencies, timeout, and read-only flag. Independent tasks can run in parallel; tasks that write the same output artifact must be connected by dependency edges or the DAG is rejected.

`release:check` delegates to `release:check:parallel`, which runs build/dist freshness first, then executes independent runtime, route proof, cockpit, janitor, namespace, typecheck, schema, and release metadata checks with `SKS_VERIFY_CONCURRENCY` support. Reports are written to `.sneakoscope/reports/release-parallel-report.json` and `.sneakoscope/reports/release-parallel-report.md`.
