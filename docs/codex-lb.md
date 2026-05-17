# codex-lb Evidence

SKS keeps codex-lb separate from ChatGPT OAuth. The codex-lb proxy key is stored and redacted as `CODEX_LB_API_KEY`; ChatGPT OAuth remains the official Codex login path.

## Commands

```bash
sks codex-lb metrics --json
sks codex-lb doctor --deep --json
sks codex-lb circuit reset
sks codex-lb circuit record-fixture test/fixtures/codex-lb/5xx.json --json
sks codex-lb proof-evidence --json
```

## Circuit Policy

- `auth` rejection is a hard failure.
- Repeated `5xx` or timeout failures open the circuit.
- `previous_response_not_found` is a stateless-LB warning, not an automatic failure.
- Hard failures are surfaced and recorded in circuit health.
- SKS only bypasses codex-lb when the user chooses fallback or `SKS_CODEX_LB_AUTOBYPASS=1` is set.

Health summaries are written to `~/.codex/sks-codex-lb-health.json` and `<active-project>/.sneakoscope/reports/codex-lb-health.json` when launch health checks or metrics commands update the circuit. Completion Proof evidence includes a `codex_lb` summary from the active project root.

0.9.14 launch health integration records the same circuit state when the response-chain check runs:

- `previous_response_not_found` records a warning and keeps the circuit closed.
- auth rejection opens the circuit immediately.
- timeout, network, and 5xx failures open the circuit after three recent failures.
- `chain_ok` updates `last_ok_at` and closes a half-open/open circuit.
