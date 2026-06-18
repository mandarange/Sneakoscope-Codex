# Glossary

## GLM MAD Mode

`mad-glm` is the SKS 4.0.3 mode entered by `sks --mad --glm`. It combines the existing MAD permission profile with the OpenRouter GLM 5.2 provider profile while keeping SKS proof and mutation gates active.

## GLM 5.2 Model Lock

The runtime invariant that GLM mode sends `model: "z-ai/glm-5.2"`, disables provider fallback, omits fallback `models`, and rejects responses whose actual model id is not GLM 5.2.

## OpenRouter Key Store

The user-scoped secret location at `${SKS_HOME:-~/.sneakoscope}/secrets/openrouter-api-key`. It is outside project files and stores raw key material separately from redacted metadata.

## Codex App GLM Profile

The SKS model profile metadata with id `sks/glm-5.2-mad` and label `GLM 5.2 (MAD / OpenRouter)`. It records provider/model policy without monkey-patching Codex App UI.

## Codex 0.141 Delegation

The 4.0.3 compatibility policy that delegates remote relay, cwd/shell/path preservation, selected executor plugin MCP activation, App/MCP dedupe, prompt-image cache bounds, feedback upload bounds, and terminal resize behavior to Codex-native semantics when Codex `rust-v0.141.0` is available.
