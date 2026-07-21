# Glossary

## OpenRouter Desktop Activation

Selecting OpenRouter for Codex Desktop via SKS Center Providers or `sks codex-app use-openrouter --model <id>`. Key save alone does not change the active provider/model; activation writes `model_provider` and `model` in Codex `config.toml` after the OpenRouter key and provider block are present.

## OpenRouter Default Model

The SKS default OpenRouter model id `z-ai/glm-5.2` (`OPENROUTER_DEFAULT_MODEL`). Operators may pass any OpenRouter model id that passes `normalizeOpenRouterModelId`.

## OpenRouter Key Store

The user-scoped secret location at `${SKS_HOME:-~/.sneakoscope}/secrets/openrouter-api-key`. It is outside project files and stores raw key material separately from redacted metadata.

## Codex App OpenRouter Profile

Legacy Desktop profile metadata still written for picker compatibility (`sks/glm-5.2-mad`, `sks-glm-52-*` reasoning profiles). Activation is OpenRouter-centered; the retired GLM MAD CLI (`sks --mad --glm`, `sks glm`) is removed and does not change ordinary `sks --mad`.

## Codex 0.141 Delegation

The 4.0.5 compatibility policy that delegates remote relay, cwd/shell/path preservation, selected executor plugin MCP activation, App/MCP dedupe, prompt-image cache bounds, feedback upload bounds, and terminal resize behavior to Codex-native semantics when Codex `rust-v0.141.0` is available.
