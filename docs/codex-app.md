# Codex App

SKS uses Codex App as the app-facing control surface for dollar-command skills, managed hooks, image generation, Codex Chrome Extension web verification, and native macOS Computer Use evidence.

## 1.18.8 Compatibility Notes

Codex CLI/App runtime compatibility targets OpenAI Codex CLI `rust-v0.134.0`. Hook output validation uses the vendored OpenAI Codex `latest` generated schemas plus the SKS zero-warning strict subset documented in [codex-cli-compat.md](codex-cli-compat.md). Codex 0.134 profile selection, local history search, MCP modernization, subagent hook context, and managed proxy propagation are represented in the SKS compatibility matrix; Codex 0.133 behavior remains inherited compatibility.

Useful checks:

```bash
sks codex-app check
sks codex-app chrome-extension --json
sks codex compatibility --json
npm run codex:0.134-compat
npm run codex:profile-primary
npm run codex:managed-proxy-env
sks hooks warning-check --json
sks hooks codex-validate --json
sks computer-use status --json
sks computer-use require --route '$QA-LOOP' --json
sks computer-use smoke --json
```

Web/browser/webapp verification uses the official Codex Chrome Extension path first: https://developers.openai.com/codex/app/chrome-extension. If the extension is not installed/enabled, QA-LOOP, UX review, and browser verification must halt rapidly and ask the user to set it up before continuing. Computer Use is reserved for native Mac, desktop-app, OS-settings, and non-web visual targets. MAD-SKS can explicitly authorize these target-project scopes (`computer_use`, `browser_use`, `generated_assets`, and file permission changes), but it cannot fake host capability availability.

The generated `sks-fast-high` profile intentionally omits `sandbox_mode`. Codex App and IDE permission settings own the sandbox choice, including Full Access vs workspace-write, while SKS supplies the model, Fast service tier, approval, and reasoning defaults. High-power MAD launches continue to use the explicit `sks-mad-high` profile and `danger-full-access` launch arguments after the user opens the MAD-SKS permission gate.

Imagegen/gpt-image-2 remains a Codex App capability first. UX-Review/PPT require generated gpt-image-2 callout evidence before verified visual claims. `npm run imagegen:capability` checks that the official Codex App `$imagegen` surface is visible, but full visual verification still needs an actual generated output file with hash/dimensions/provider metadata. Direct OpenAI API, Responses image-generation, codex-lb, or `CODEX_LB_API_KEY` fallback paths are non-Codex API fallbacks and do not satisfy Codex App imagegen evidence unless a separate API task is explicitly requested. When the official app, Chrome Extension, or OS blocks required capabilities, SKS records the external block and marks live verification unverified instead of substituting browser automation or prose-only critique.

Secrets such as `CODEX_ACCESS_TOKEN`, `OPENAI_API_KEY`, and `CODEX_LB_API_KEY` are reported only as redacted presence states.
