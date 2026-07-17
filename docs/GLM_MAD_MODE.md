# GLM 5.2 MAD Mode

SKS keeps GLM optimization scoped to `sks --mad --glm`. The default GLM path is a bounded speed profile with no high/xhigh reasoning effort, while ordinary `sks --mad`, `$sks-naruto`, and non-GLM Codex routes keep their existing defaults.

```bash
sks --mad --glm
sks --mad --glm --repair
sks --mad --glm run "fix a small issue"
sks --mad --glm --deep
sks --mad --glm --xhigh
sks --mad --glm --strict
sks --mad --glm --bench
sks --mad --glm --trace
```

`sks --mad --glm` resolves the GLM/OpenRouter provider profile, prints readiness/status, and exits when no task is supplied. Task forms use the bounded direct speed path. MAD widens the permission profile only through SKS gates; it does not bypass patch proof, response model guard, mutation ledgers, or Honest Mode.

## Scope

The 4.0.6 speed defaults apply only when GLM mode is selected:

- `sks --mad --glm` uses the GLM speed profile.
- Non-GLM `sks --mad` does not inherit GLM routing or reasoning defaults.
- `$sks-naruto` and Codex default model routing are unchanged outside the GLM path.
- GLM bench and trace artifacts live under `.sneakoscope/glm/`.

## Model Lock

- Provider: `openrouter`
- Model: `z-ai/glm-5.2`
- Codex App profile id: `sks/glm-5.2-mad`
- Request fallback array: not used
- `provider.allow_fallbacks`: `false`
- GLM speed `provider.require_parameters`: `false`
- GLM deep/strict `provider.require_parameters`: `true`
- GPT/OpenAI fallback: blocked

OpenRouter responses must report a GLM 5.2 model id. If the actual response model is missing, GPT/OpenAI, or unknown, SKS discards the result before mutation and records `glm_model_missing` or `glm_model_mismatch`.

## Profiles

Default GLM mode is `speed`:

```text
mode: mad-glm-speed
reasoning.effort: none/minimal/low or omitted
max_tokens: 4096
temperature: 0.2
top_p: 0.85
stream: true
tool_choice: none
provider.sort: throughput
provider.require_parameters: false
```

Opt-in profiles:

- `--deep`: larger GLM context/completion budget with high reasoning and automatic tools.
- `--xhigh`: larger GLM context/completion budget with xhigh reasoning.
- `--strict`: deep GLM profile plus JSON schema response format.
- `--ttft`: GLM provider preference shifts toward lower latency.
- `--exact-provider <slug>`: GLM provider order is pinned after slug validation.

## OpenRouter Key Resolution

Key priority in GLM mode:

1. `OPENROUTER_API_KEY`
2. `SKS_OPENROUTER_API_KEY`
3. User SKS secret store
4. Interactive prompt

`OPENAI_API_KEY` is intentionally ignored for GLM mode.

Stored keys live outside the project under the user SKS home:

```text
${SKS_HOME:-~/.sneakoscope}/secrets/openrouter-api-key
```

The secret directory is created with `0700`, the key file with `0600`, and metadata stores only a SHA-256 hash plus a short redacted preview.

## Repair

Use repair to rotate the stored key:

```bash
sks --mad --glm --repair
sks codex-app set-openrouter-key --api-key-stdin
```

Repair prompts for a new OpenRouter key, atomically replaces the stored key, writes redacted metadata, and validates the key with a tiny GLM request unless `--skip-validation` is supplied. Validation never falls back to GPT.
`sks codex-app set-openrouter-key --api-key-stdin` stores the same key in the SKS user secret store and installs/repairs Codex Desktop-compatible OpenRouter GLM profiles in one non-interactive command.

## Codex App Profile

Install or inspect the model profile:

```bash
sks codex-app glm-profile install
sks codex-app glm-profile doctor --json
```

The profile metadata is:

```text
id: sks/glm-5.2-mad
label: GLM 5.2 (MAD Speed / OpenRouter)
provider: openrouter
model: z-ai/glm-5.2
strictModelLock: true
gptFallbackAllowed: false
defaultProfile: speed
```

Install also writes Codex Desktop-compatible `~/.codex/config.toml` entries:

```text
[model_providers.openrouter]
[profiles.sks-glm-52-mad]
[profiles.sks-glm-52-minimal]
[profiles.sks-glm-52-low]
[profiles.sks-glm-52-medium]
[profiles.sks-glm-52-high]
[profiles.sks-glm-52-xhigh]
```

Each `sks-glm-52-*` profile selects `model = "z-ai/glm-5.2"` through OpenRouter and pins the matching `model_reasoning_effort`, so Codex Desktop can choose GLM and its reasoning level through native profile selection. SKS does not monkey patch Codex App UI; it uses Codex-native provider/profile config and follows App/MCP dedupe and selected executor plugin boundaries.

Generic native-agent scheduling follows the same rule in GLM mode: every SKS child/native worker keeps `z-ai/glm-5.2` and receives a GLM effort tier. Simple slices use `minimal`, ordinary implementation uses `low`, safety/DB/schema/release lanes use `high`, and explicit xhigh work uses `xhigh`.

## Proof Artifacts

GLM mode writes redacted, bounded proof summaries:

```text
.sneakoscope/glm/mad-glm-session.json
.sneakoscope/glm/openrouter-request-summary.json
.sneakoscope/glm/model-guard.json
.sneakoscope/glm/bench-result.json
.sneakoscope/glm/bench-blocked.json
.sneakoscope/glm/traces/*-glm-*-trace.json
```

Raw OpenRouter keys, Authorization headers, and raw key-bearing stack traces must not appear in these files.
