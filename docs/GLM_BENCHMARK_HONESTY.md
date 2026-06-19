# GLM Benchmark Honesty

GLM benchmark proof separates measured facts from unavailable evidence.

4.0.14 rules:

- Missing latency, usage, verifier, or merge data is reported as `null` or `unavailable`, never as fake zero.
- The direct GLM case is labeled `direct-glm-speed`; Naruto cases are labeled `glm-naruto-1`, `glm-naruto-4`, `glm-naruto-8`, and `glm-naruto-12`.
- `model-lock-proof.json` checks case-level model and fallback flags, then separately reports whether request summaries were available for deeper fallback/OpenAI-key scans.
- `no_mutation_proof.user_cwd_unchanged` is the real git-status comparison result.

Use `--live --no-apply` only when OpenRouter credentials are available. Dry runs remain network-free and do not claim live model accuracy.
