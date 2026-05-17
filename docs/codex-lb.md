# codex-lb Evidence

SKS keeps codex-lb separate from ChatGPT OAuth. The codex-lb proxy key is stored and redacted as `CODEX_LB_API_KEY`; ChatGPT OAuth remains the official Codex login path.

## Commands

```bash
sks codex-lb metrics --json
sks codex-lb doctor --deep --json
sks codex-lb circuit reset
```

## Circuit Policy

- `auth` rejection is a hard failure.
- Repeated `5xx` or timeout failures open the circuit.
- `previous_response_not_found` is recorded as a stateless load-balancer warning.
- If a user explicitly chooses codex-lb, automatic bypass requires an opt-in policy.

Health summaries are written to `~/.codex/sks-codex-lb-health.json` and `.sneakoscope/reports/codex-lb-health.json` when the metrics command runs.
