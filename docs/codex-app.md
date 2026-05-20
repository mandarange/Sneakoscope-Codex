# Codex App

SKS uses Codex App as the app-facing control surface for dollar-command skills, managed hooks, image generation, and macOS Computer Use evidence.

## 1.0.8 Compatibility Notes

Codex CLI/App runtime compatibility targets OpenAI Codex CLI `rust-v0.132.0`. Hook output validation remains pinned to the vendored `rust-v0.131.0` generated schemas plus the SKS zero-warning strict subset documented in [codex-cli-compat.md](codex-cli-compat.md).

Useful checks:

```bash
sks codex-app check
sks codex compatibility --json
npm run codex:0.132-compat
sks hooks warning-check --json
sks hooks codex-validate --json
sks computer-use status --json
sks computer-use require --route '$QA-LOOP' --json
sks computer-use smoke --json
```

Computer Use and imagegen/gpt-image-2 are treated as Codex App/macOS capabilities, not MAD-SKS permissions. Visual/UI routes may require Computer Use evidence and UX-Review requires generated gpt-image-2 callout evidence before verified visual claims; when the official app or OS blocks those capabilities, SKS records the external block and marks live UI verification unverified instead of substituting browser automation or prose-only critique.

Secrets such as `CODEX_ACCESS_TOKEN`, `OPENAI_API_KEY`, and `CODEX_LB_API_KEY` are reported only as redacted presence states.
