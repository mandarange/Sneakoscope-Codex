# Real Codex Dynamic Smoke 1.18.5

SKS 1.18.5 keeps the real Codex dynamic worker smoke opt-in but makes its proof level stricter:

```bash
SKS_TEST_REAL_DYNAMIC_AGENTS=1 npm run agent:real-codex-dynamic-smoke-v2
```

The smoke launches a small read-only dynamic scheduler run with real `codex exec` workers. The default bounded smoke uses 2 active slots and 3 work items; `--full` uses 3 active slots and 5 work items.

The gate verifies `codex exec --output-schema`, `--output-last-message`, every worker `result_file`, parsed output-last-message JSON, agent-result schema validation, scheduler backfill counts, terminal close reports, Source Intelligence refs, Goal mode refs, empty `changed_files`, and process cleanup after the run.

When `SKS_AGENT_DYNAMIC_BACKFILL_FIXTURE=1` instruments delays, the proof level is `fixture_instrumented_real`, not plain `proven`. Without `SKS_TEST_REAL_DYNAMIC_AGENTS=1`, or when the installed Codex binary lacks the required flags, the gate writes `integration_optional` to `.sneakoscope/reports/agent-real-codex-dynamic-smoke-1.18.5.json`. `SKS_REQUIRE_REAL_DYNAMIC_AGENTS=1` turns those optional states into blockers.
