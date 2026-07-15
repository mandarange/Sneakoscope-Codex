# GLM Naruto Benchmarking

The GLM Naruto bench command is:

```bash
sks --mad --glm naruto --bench --live --no-apply
```

Safety rules:

- Live mode requires an OpenRouter key.
- Bench cases run in a temporary fixture repo.
- `--no-apply` is the default-safe benchmark mode.
- GPT/OpenAI comparison is not part of the default bench.

Reported live cases cover a single-worker baseline plus 4, 8, and 12 worker GLM Naruto runs. Each case records wall-clock timing, p50/p90 TTFT, p50/p90 total latency, candidate count, gate pass rate, verifier pass rate, merge success, cache token counters, reasoning token counters, and worker completion/failure counts when available.

`--no-apply` only prevents final main-workspace mutation. It still runs gates, verifier, conflict planning, scoreboard generation, and merge planning. Use `--skip-verifier` only when intentionally measuring a verifier-free run; that choice is recorded as a warning.
