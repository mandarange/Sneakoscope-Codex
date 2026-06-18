# Codex 0.141 Compatibility

SKS 4.0.3 aligns its Codex integration boundary with OpenAI Codex `rust-v0.141.0`.

Primary source:

```text
https://github.com/openai/codex/releases/tag/rust-v0.141.0
```

## SKS Policy

SKS delegates or narrows duplicate functionality when Codex 0.141 provides the native behavior:

| Codex 0.141 surface | SKS 4.0.3 policy |
| --- | --- |
| Remote executor Noise relay | Delegate to Codex remote executor relay |
| Native cwd/shell/path preservation | Preserve Codex-native PathUri/native path semantics |
| Permission path preservation | Treat Codex app-server/exec-server path as source of truth |
| Selected executor plugin MCP per thread | Avoid global duplicate MCP activation |
| Plugin/App/MCP dedupe | Keep SKS declarations minimal and dedupe by Codex app declaration |
| Child threads and external-agent imports | Cross-link SKS ledgers instead of duplicating import accounting |
| Rate-limit reset credits | Prefer Codex credit API when available |
| Realtime startup context | Avoid startup-context injection hacks that fight Codex controls |
| TUI prompt timeout | Prefer Codex auto-resolve timer |
| PostToolUse blocking | Respect Codex blocking results; do not override |
| Tool-heavy sessions | Avoid repeated request/history copies in SKS context builders |
| Prompt-image cache | Keep any SKS-owned cache at or below 64 MiB |
| Feedback upload subtree | Keep related-thread upload bundles at or below eight threads |
| Terminal resize reflow | Treat reflow as always enabled; ignore obsolete disable flags |

## Gate

The compatibility fixture is:

```bash
npm run codex:0.141-compat
```

The gate records `sks.codex-0141-capability.v1` feature states and fails when a fake or real Codex version below `0.141.0` is required for 0.141-specific behavior.

The command surface is also available through:

```bash
sks codex 0.141 --json
```

## GLM Profile Interaction

The GLM Codex App profile follows the same boundary:

- It stores provider/model metadata, not duplicate App/MCP declarations.
- It keeps selected executor plugin MCP behavior delegated to Codex-native routing.
- It preserves native cwd/shell/path semantics.
- It marks GPT fallback disabled in both metadata and runtime result.
