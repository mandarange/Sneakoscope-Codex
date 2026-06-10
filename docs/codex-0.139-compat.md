# Codex 0.139 Compatibility

SKS 3.0.1 tracks Codex CLI `rust-v0.139.0` (https://github.com/openai/codex/releases/tag/rust-v0.139.0). The minimum supported baseline stays `rust-v0.136.0`; 0.139 features are detected, recorded, and used opportunistically — never required.

## Capability detection

`detectCodex0139Capability` / `writeCodex0139CapabilityArtifacts` (gate: `codex:0139-capability`) write `.sneakoscope/codex-0139-capability.json` plus a mission-scoped copy on `sks --mad` and `sks naruto run` launches, mirroring the 0.138 capability artifacts. Flags:

| Flag | 0.139 surface |
| --- | --- |
| `supports_code_mode_web_search` | Code mode can call standalone web search directly, including from nested JavaScript tool calls (#26719). |
| `supports_rich_tool_schemas` | Tool/connector input schemas preserve `oneOf`/`allOf`; large schemas keep more shallow structure when compacted (#24118, #27084). |
| `supports_doctor_env_details` | `codex doctor` includes editor/pager environment details, redacted in JSON output (#27081). |
| `supports_marketplace_source_field` | `codex plugin marketplace list --json` includes each marketplace `source` (#27009). |
| `supports_plugin_catalog_cache` | Plugin lists can return from the cached remote catalog before refreshing in the background (#26932). |
| `supports_sandbox_profile_alias` | `-P` sandbox permissions profile alias (#27054). |
| `supports_interrupt_agent_rename` | Multi-agent v2 renamed `close_agent` to `interrupt_agent` (#26994). |

Probe mode (`SKS_CODEX_0139_PROBE=1`) additionally exercises `codex plugin marketplace list --json` (checking the new `source` field shape) and the `-P` alias in `codex --help`. `SKS_CODEX_0139_FAKE=1` with `SKS_CODEX_VERSION_FAKE` drives hermetic gate fixtures.

## Runtime adaptations

- **`interrupt_agent` event classification.** The cockpit subagent-stage classifier accepts both `close_agent` (≤0.138) and `interrupt_agent` (0.139+) so multi-agent v2 lifecycle events keep mapping to `result` stages on newer CLIs.
- **Marketplace `source` tolerance.** The plugin marketplace JSON parser treats the new per-marketplace `source` field as evidence of the 0.139 surface and tolerates array, `marketplaces`, and `items` wrapper shapes.
- **Richer schemas, fewer workarounds.** SKS-generated worker output schemas already avoid deep nesting for compaction safety; on 0.139 the preserved `oneOf`/`allOf` support is recorded so future schema tightening can be gated on `supports_rich_tool_schemas` instead of version sniffing.

## Non-goals

Sandbox proxy-network enforcement (#27035), approval-decision preservation (#24981), TUI fixes, and symbol-archive release chores need no SKS-side changes; they are upstream behavior SKS simply benefits from. The Codex baseline policy (`CODEX_REQUIRED_BASELINE_TAG = rust-v0.136.0`) is unchanged.
