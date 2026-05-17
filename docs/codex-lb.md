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

Health summaries are written to `~/.codex/sks-codex-lb-health.json` and `.sneakoscope/reports/codex-lb-health.json` when launch health checks or metrics commands update the circuit.

0.9.13 launch health integration records the same circuit state when the response-chain check runs:

- `previous_response_not_found` records a warning and keeps the circuit closed.
- auth rejection opens the circuit immediately.
- timeout, network, and 5xx failures open the circuit after three recent failures.
- `chain_ok` updates `last_ok_at` and closes a half-open/open circuit.
