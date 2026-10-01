# Glossary

## OpenRouter Desktop Activation

Selecting OpenRouter for Codex Desktop via SKS Center Providers. Key save alone does not change the active provider/model; activation writes `model_provider` and `model` in Codex `config.toml` after the OpenRouter key and provider block are present.

## OpenRouter Key Store

The user-scoped secret location at `${SKS_HOME:-~/.sneakoscope}/secrets/openrouter-api-key`. It is outside project files and stores raw key material separately from redacted metadata.

## Codex App OpenRouter Profile

Retired. Legacy Desktop picker tables (`sks-glm-52-*`) are stripped on migrate/doctor/update. OpenRouter activation is provider + top-level `model` only, through SKS Center Providers and `sks bridge`. The retired GLM MAD CLI (`sks --mad --glm`, `sks glm`) remains removed and does not change ordinary `sks --mad`.

## Codex 0.141 Delegation

The 4.0.5 compatibility policy that delegates remote relay, cwd/shell/path preservation, selected executor plugin MCP activation, App/MCP dedupe, prompt-image cache bounds, feedback upload bounds, and terminal resize behavior to Codex-native semantics when Codex `rust-v0.141.0` is available.
