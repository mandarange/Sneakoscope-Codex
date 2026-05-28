# Real Codex Parallel Workers 1.18.11

SKS 1.18.11 separates native worker process proof from real Codex child task proof.

Native CLI workers still prove that SKS can launch bounded worker processes, but real Codex parallelism now requires additional evidence:

- a `worker-backend-router-report.json` per worker;
- a `codex-worker-process-report.json` per Codex backend worker;
- an `output-last-message` JSON file parsed through the agent result schema;
- patch envelopes whose `source` is `model_authored`;
- child process start and finish timestamps that prove wall-clock overlap;
- fast mode and service tier recorded on every worker and child report.

The fake backend remains fixture-only. The process backend is hermetic and proves a real child process can execute a task. The `codex-exec` backend is the real Codex path; it is integration-optional unless `SKS_TEST_REAL_CODEX_PARALLEL=1` or `SKS_REQUIRE_REAL_CODEX_PARALLEL=1` is set.

Real proof is written as `real-codex-parallel-proof.json`. It reports native worker process count, Codex child process count, maximum child overlap, output-last-message count, model-authored patch envelope count, fixture envelope count, and blockers.
