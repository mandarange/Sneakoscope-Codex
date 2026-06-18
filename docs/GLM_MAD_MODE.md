# GLM 5.2 MAD Mode

SKS 4.0.6 keeps GLM optimization scoped to `sks --mad --glm`. The default GLM path is a bounded speed profile with no high/xhigh reasoning effort, while ordinary `sks --mad`, Naruto/Team, and non-GLM Codex routes keep their existing defaults.

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
- Naruto/Team and Codex default model routing are unchanged outside the GLM path.
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
```

Repair prompts for a new OpenRouter key, atomically replaces the stored key, writes redacted metadata, and validates the key with a tiny GLM request unless `--skip-validation` is supplied. Validation never falls back to GPT.

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

SKS does not monkey patch Codex App UI. The profile is represented as SKS metadata and follows Codex-native App/MCP dedupe and selected executor plugin boundaries.

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
