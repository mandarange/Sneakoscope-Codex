# Codex rust-v0.136.0 Compatibility

SKS 1.21.6 promotes OpenAI Codex `rust-v0.136.0` to the current compatibility baseline while keeping 0.135, 0.134, 0.133, and 0.132 rows as inherited evidence.

- `npm run codex:0.136-compat` writes `.sneakoscope/reports/codex-0.136-compat.json`.
- `npm run codex:0.136-compat:require-real` blocks when a local Codex CLI at `rust-v0.136.0` or newer is not detected.
- `sks codex compatibility --json` now includes `codex_0_136`, `codex_0_135`, `codex_0_134`, and inherited 0.133/0.132 surfaces.

## 0.136 Release Mapping

- TUI markdown preserves OSC 8 web links and renders cramped tables as readable key/value records.
- Sessions can be archived and restored with `/archive`, `codex archive`, and `codex unarchive`; archived sessions stay protected from resume/fork until restored.
- App-server integrations can resume a thread with initial turns, report richer MCP server status, and launch stdio mode through `codex app-server --stdio`.
- Remote execution setup supports `CODEX_API_KEY` registration for approved OpenAI hosts, and remote-control websockets use short-lived server tokens.
- Windows sandbox provisioning has an alpha `codex sandbox setup --elevated` path and allowed-implementation requirements support.
- A feature-gated standalone image generation extension can route through the native Codex image artifact completion pipeline.
- ChatGPT auth refresh, command-safety hardening, sandbox cleanup, deny-read preservation, multiline hook output, Vim editing, fs/watch debounce, web search activity, Bedrock region fallback, unsupported service-tier removal, and `rmcp` 1.7.0 compatibility are tracked as release-baseline evidence.

## Checks

```bash
npm run codex:0.136-compat
npm run codex:0.136-compat:require-real
sks codex compatibility --require rust-v0.136.0 --json
codex archive --help
codex unarchive --help
codex app-server --help
codex sandbox setup --help
codex remote-control --help
```

The ordinary release gate is warning-only when local Codex is absent or older than 0.136. The real gate belongs to `npm run release:real-check`, keeping `release:check` hermetic and cacheable.
