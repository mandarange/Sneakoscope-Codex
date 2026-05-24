# Agent Non-Recursive Pipeline

SKS 1.16.0 release note.

Native workers run under `AGENT_WORKER_PIPELINE` and must not call top-level route orchestrators such as `sks team`, `sks agent run`, `sks research run`, `$Team`, `$Research`, `$AutoResearch`, `$QA-LOOP`, or `$Goal`. Recursion guard violations are recorded as blockers in agent proof evidence.

## Non-Recursive Pipeline Policy Report

`npm run agent:non-recursive-pipeline-report` scans the worker pipeline, recursion guard, docs, stdout/stderr transcript samples, and agent-result samples for nested route launches or global state writes. The report writes `.sneakoscope/reports/non-recursive-pipeline-report.json` and `.sneakoscope/reports/non-recursive-pipeline-report.md`.

The report contract covers the worker env guard, command and dollar-route denylists, mission creation blocking, `.sneakoscope/state/current.json` write blocking, top-level command blocking, stdout/stderr transcript scanning, agent-result scanning, wrongness-record mapping, secret redaction, local-only evidence routing, and a 1500ms performance budget. A blocked report must be fixed before agent proof is accepted.
