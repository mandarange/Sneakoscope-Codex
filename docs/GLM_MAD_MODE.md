# GLM 5.2 MAD Mode

SKS 4.0.3 adds a GLM-only MAD profile for OpenRouter.

```bash
sks --mad --glm
sks --mad --glm --repair
```

`sks --mad --glm` resolves the `mad-glm` provider profile and keeps the existing SKS proof/task pipeline active. MAD widens the permission profile only through SKS gates; it does not bypass patch proof, response model guard, mutation ledgers, or Honest Mode.

## Model Lock

- Provider: `openrouter`
- Model: `z-ai/glm-5.2`
- Codex App profile id: `sks/glm-5.2-mad`
- Request fallback array: not used
- `provider.allow_fallbacks`: `false`
- `provider.require_parameters`: `true`
- GPT/OpenAI fallback: blocked

OpenRouter responses must report a GLM 5.2 model id. If the actual response model is missing, GPT/OpenAI, or unknown, SKS discards the result before mutation and records `glm_model_missing` or `glm_model_mismatch`.

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
label: GLM 5.2 (MAD / OpenRouter)
provider: openrouter
model: z-ai/glm-5.2
strictModelLock: true
gptFallbackAllowed: false
```

SKS does not monkey patch Codex App UI. The profile is represented as SKS metadata and follows Codex-native App/MCP dedupe and selected executor plugin boundaries.

## Proof Artifacts

GLM mode writes redacted, bounded proof summaries:

```text
.sneakoscope/glm/mad-glm-session.json
.sneakoscope/glm/openrouter-request-summary.json
.sneakoscope/glm/model-guard.json
```

Raw OpenRouter keys, Authorization headers, and raw key-bearing stack traces must not appear in these files.
