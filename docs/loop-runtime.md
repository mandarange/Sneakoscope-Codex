# Loop Runtime

SKS 3.1.0 treats the user goal as intent and the Loop Graph as the execution SSOT. A request is decomposed into mini-loops, each with a bounded owner scope, budget, durable state, run log, maker/checker policy, local gates, lease, and proof.

The runtime writes artifacts under `.sneakoscope/missions/<mission>/loops`: `loop-plan.json`, per-loop `loop-state.json`, `loop-run-log.jsonl`, `loop-budget.json`, `loop-proof.json`, gate outputs, patch candidates, and the final `loop-graph-proof.json`.

Maker and checker worker counts are derived from owner scope size, risk, and parallelism mode. Checker workers are read-only native review workers; `noMutation` only means read-only and must not silently switch the checker path to deterministic fixtures.

Deterministic loop worker fixtures are test-only. They require `SKS_LOOP_RUNTIME_FIXTURE=1` plus a recognized test/check context such as release check scripts, Node test env, or hermetic temp loop checks. Production/runtime loop execution must fail closed instead of falling back to fixture verification.

Loop levels are `L0-report`, `L1-assisted`, `L2-action`, and `L3-unattended`. New domains do not start at L3, high or critical risk cannot run unattended, L2 requires a checker, and any source mutation requires GPT final arbitration before integration completes.

The CLI surface is `sks loop plan`, `sks loop run`, `sks loop status`, `sks loop proof`, `sks loop kill`, `sks loop resume`, and `sks loop graph`.
