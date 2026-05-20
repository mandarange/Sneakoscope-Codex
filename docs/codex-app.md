# Codex App

SKS uses Codex App as the app-facing control surface for dollar-command skills, managed hooks, image generation, and macOS Computer Use evidence.

## 1.0.6 Compatibility Notes

Codex CLI/App hook compatibility is pinned to the OpenAI Codex CLI `rust-v0.131.0` baseline. Hook output validation is handled through the vendored generated schemas plus the SKS zero-warning strict subset documented in [codex-cli-compat.md](codex-cli-compat.md).

Useful checks:

```bash
sks codex-app check
sks codex compatibility --json
sks hooks warning-check --json
sks hooks codex-validate --json
sks computer-use status --json
sks computer-use require --route '$QA-LOOP' --json
sks computer-use smoke --json
```

Computer Use is treated as a Codex App/macOS capability, not a MAD-SKS permission. Visual/UI routes may require Computer Use evidence; when the official app or OS blocks that capability, SKS records the external block and marks live UI verification unverified instead of substituting browser automation.

Secrets such as `CODEX_ACCESS_TOKEN`, `OPENAI_API_KEY`, and `CODEX_LB_API_KEY` are reported only as redacted presence states.
