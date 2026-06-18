# GLM Latency Tuning

GLM latency tuning is scoped to `sks --mad --glm`. It is not a global SKS performance policy.

## Levers

- Keep the default GLM reasoning effort at `xhigh`.
- Bound speed-profile completion tokens to avoid oversized default responses.
- Prefer compact source context over full repo, raw logs, or full TriWiki dumps.
- Omit tools by default in speed mode; use `--deep` or `--xhigh` when tool use is required.
- Keep streaming enabled and record time-to-first-token when live execution supplies it.
- Use provider throughput preferences by default; add `--ttft` for latency-biased provider selection.

## Artifacts

```text
.sneakoscope/glm/bench-result.json
.sneakoscope/glm/bench-blocked.json
.sneakoscope/glm/traces/*-glm-*-trace.json
```

The local bench runner is synthetic dry-run evidence only. `--bench --execute` is blocked until a real OpenRouter-backed measurement path exists, so synthetic numbers cannot be mistaken for live performance proof.
