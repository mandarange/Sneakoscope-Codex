# GLM Naruto Benchmarking

The GLM Naruto bench command is:

```bash
sks --mad --glm --naruto --bench --live --no-apply
```

Safety rules:

- Live mode requires an OpenRouter key.
- Bench cases run in a temporary fixture repo.
- `--no-apply` is the default-safe benchmark mode.
- GPT/OpenAI comparison is not part of the default bench.

Reported live cases cover a single-worker baseline plus 4, 8, and 12 worker GLM Naruto runs. Each case records wall-clock timing, candidate count, gate pass rate, merge success, and cache token counters when available.
