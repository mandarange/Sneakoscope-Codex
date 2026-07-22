# Codex App

SKS uses Codex App as the app-facing control surface for dollar-command skills, managed hooks, image generation, Codex Chrome Extension web verification, and native macOS Computer Use evidence.

## Current Compatibility Baseline

SKS 7.0.4 prefers the OpenAI Codex CLI/App channel `rust-v0.145.0` as the package-tracked latest, with the 0.145.0 SDK/CLI dependency graph, active release manifest, and App Server v2 schemas kept in lockstep for release proof. Runtime policy remains version-agnostic: feature routes capability-gate, and Menu Bar / Center induce updates to preferred latest. Hook output validation uses the vendored OpenAI Codex `latest` generated schemas plus the SKS zero-warning strict subset documented in [codex-cli-compat.md](codex-cli-compat.md). Codex 0.134-0.139 notes remain inherited historical compatibility evidence; they are not an exclusive product lock.

## Chat, Pro Models, And Fast UI Preservation

SKS 6.5.0 repairs native Desktop selection when an SKS-owned global
`model_provider`, `model`, or `model_reasoning_effort` lock suppresses the Chat
entry, Pro model access, or Fast picker. The repair is provenance-scoped: it
does not delete unmarked user settings, provider definitions, provider URLs,
credential references, `service_tier = "fast"`, or `[features].fast_mode`.

SKS 7.0.5 also reports the active nonsecret auth class. When codex-lb API-key
auth is active and a ChatGPT OAuth backup is available, Center labels the
Chat/Pro surface as inactive and exposes **Restore Chat / Pro (OAuth)**. The
switch is explicit because the two modes share Codex's active auth slot;
restoring OAuth keeps the saved codex-lb provider and credentials available for
later reuse. `sks update` preserves whichever mode the user selected and never
uses an OAuth backup as permission to change providers.

Fast is treated as a service tier independent from reasoning effort. The SKS
menu bar exposes authoritative Fast status plus direct On/Off actions and shows
Unavailable if status cannot be verified. A restarted ChatGPT/Codex Desktop
and user-visible post-restart observation are still required before claiming
that the native picker is visible on a particular machine.

Useful checks:

```bash
sks codex-app check
sks codex-app set-openrouter-key --api-key-stdin
sks codex-app use-openrouter --model z-ai/glm-5.2
sks codex-lb status
sks codex-lb use-oauth --restart-app
sks codex-lb use-codex-lb --restart-app
sks codex-app chrome-extension --json
sks codex compatibility --require rust-v0.145.0 --json
sks codex 0.144 --json
sks codex schema --json
sks codex update-status --json
sks fast-mode status --json
sks computer-use status --json
sks computer-use require --route '$sks-qa-loop' --json
sks computer-use smoke --json
```

Web/browser/webapp verification uses the official Codex Chrome Extension path first: https://learn.chatgpt.com/docs/chrome-extension. If the extension is not installed/enabled, QA-LOOP, UX review, and browser verification must halt rapidly and ask the user to set it up before continuing. Computer Use is reserved for native Mac, desktop-app, OS-settings, and non-web visual targets. MAD-SKS can explicitly authorize these target-project scopes (`computer_use`, `browser_use`, `generated_assets`, and file permission changes), but it cannot fake host capability availability.

The generated `sks-fast-high` profile intentionally omits `sandbox_mode`. Codex App and IDE permission settings own the sandbox choice, including Full Access vs workspace-write, while SKS supplies the model, Fast service tier, approval, and reasoning defaults. High-power MAD launches continue to use the explicit `sks-mad-high` profile and `danger-full-access` launch arguments after the user opens the MAD-SKS permission gate.

`sks codex-app check` prints Provider UI, OpenRouter/GLM Model, and codex-lb Key rows. OpenRouter setup uses `sks codex-app set-openrouter-key --api-key-stdin` plus `sks codex-app use-openrouter --model <id>`; legacy Desktop GLM picker profiles (`sks-glm-52-*`) are stripped on update/doctor. codex-lb key setup uses `sks codex-lb setup --host <domain> --api-key-stdin --yes` or `sks codex-lb set-key --api-key-stdin`. These checks report only redacted presence/source states, never raw keys.

Imagegen/gpt-image-2 remains a Codex App capability first. UX-Review/PPT require generated gpt-image-2 callout evidence before verified visual claims. `npm run imagegen:capability` checks that the official Codex App `$imagegen` surface is visible, but full visual verification still needs an actual generated output file with hash/dimensions/provider metadata. Direct OpenAI API, Responses image-generation, codex-lb, or `CODEX_LB_API_KEY` fallback paths are non-Codex API fallbacks and do not satisfy Codex App imagegen evidence unless a separate API task is explicitly requested. When the official app, Chrome Extension, or OS blocks required capabilities, SKS records the external block and marks live verification unverified instead of substituting browser automation or prose-only critique.

Secrets such as `CODEX_ACCESS_TOKEN`, `OPENAI_API_KEY`, and `CODEX_LB_API_KEY` are reported only as redacted presence states.
