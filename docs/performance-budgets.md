# Performance Budgets

SKS 0.9.20 records core hot-path budgets with:

```bash
sks bench core --json
```

Artifacts:

- `.sneakoscope/reports/performance/core-bench.json`
- `.sneakoscope/reports/performance/core-bench.md`

## Initial Budgets

| Metric | p95 Budget |
| --- | ---: |
| `sks --version` | 50ms |
| `sks help` | 80ms |
| `sks root --json` | 80ms |
| `sks commands --json` | 120ms |
| `sks proof validate --json` | 250ms |
| `sks trust validate latest --json` | 300ms |
| `sks wiki image-validate --json` | 300ms |
| `sks features check --json` | 1200ms |
| `sks scouts engines --json` | 1000ms |

Budget misses are evidence, not marketing copy. README or release notes should only claim a speed win when the benchmark artifact exists and passes on the target environment.
# 1.0.0 Tiered Budgets

Performance budgets are tiered by execution environment and stored in `src/core/performance-budgets.json`, which is copied to `dist/core/performance-budgets.json` during build.

Tiers:

- `source-local`
- `source-ci`
- `packed-local`
- `global-shim`
- `npx-one-shot`

Use `sks bench core --tier source-ci --json` for release CI. `perf:gate` selects `source-ci` when `CI=true`; otherwise it uses the local tier unless `SKS_PERF_TIER` is set.
