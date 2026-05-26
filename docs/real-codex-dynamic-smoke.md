# Real Codex Dynamic Smoke 1.18.4

SKS 1.18.4 adds an opt-in real Codex dynamic worker smoke:

```bash
SKS_TEST_REAL_DYNAMIC_AGENTS=1 npm run agent:real-codex-dynamic-smoke
```

The smoke launches a small read-only dynamic scheduler run with real `codex exec` workers. The default fixture uses 2 active slots and 3 work items; `--full` uses 3 active slots and 5 work items.

The gate verifies `codex exec --output-schema`, `--output-last-message`, parsed result-file JSON, agent-result schema validation, scheduler backfill counts, terminal close reports, Source Intelligence refs, Goal mode refs, empty `changed_files`, process cleanup evidence, and agent worker environment injection.

Without `SKS_TEST_REAL_DYNAMIC_AGENTS=1`, or when the installed Codex binary lacks the required flags, the gate writes `integration_optional` to `.sneakoscope/reports/agent-real-codex-dynamic-smoke-1.18.4.json`.
