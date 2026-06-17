# Codex 0.139 Compatibility

SKS 3.1.13 keeps the Codex 0.139 compatibility baseline while hardening Codex 0.140 feature-state certainty, real usage parsing, goal attachment roundtrip proof, doctor transaction evidence, MCP repair reports, native capability proof, and secret line rollback. See [Codex 0.140 Integration](codex-0140-integration.md) for the 0.140 probe and release wiring surface.

SKS 3.1.12 keeps the Codex 0.139 compatibility baseline while adding Codex 0.140 capability/integration detection gates, closing the MAD Zellij stack reconciliation gate, and closing the `doctor --fix` `node_repl` parent/child MCP repair gap.

SKS 3.1.11 keeps the Codex 0.139 compatibility baseline while closing the MAD Zellij stacked-pane minimum, Context7 MCP remote repair, and stale Codex startup config repair gates.

SKS 3.1.10 keeps the Codex 0.139 compatibility baseline while closing the release-ready hardening gates for wiring parity, native capability postchecks, duplicate skill proof, and secret rollback.

SKS 3.1.8 keeps the Codex 0.139 compatibility baseline while closing core skill immutability, native capability repair, duplicate skill dedupe, and Supabase/secret preservation release gates.

SKS 3.1.7 keeps the Codex 0.139 compatibility baseline and hardens Codex Native runtime proof around real route blackboxes, bounded reference caching, read-only feature brokerage, explicit managed-asset repair transactions, and generated-artifact neutrality checks.

SKS 3.1.6 keeps the Codex 0.139 compatibility baseline while productionizing the Codex App harness around typed evidence. Hook approval, `agent_type`, Codex Native reference source analysis, rich skill/agent content, and execution-profile routing now use typed probes or source-backed reports instead of environment-only assumptions.

SKS 3.1.4 is Codex 0.139-aware: it bundles @openai/codex-sdk 0.138.0 at this release boundary, and it detects Codex 0.139 features from the external Codex CLI when that CLI is installed and supports them. The minimum supported baseline stays `rust-v0.136.0`; 0.139 features are detected, recorded, and used opportunistically rather than assumed for every environment. The release gates include hermetic fixtures plus actual real-probe artifacts; `codex:0139-real-probes:require-real` fails when high-value 0.139 probes are skipped or failed. See [Codex 0.139 Real Probes](codex-0.139-real-probes.md).

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

Probe mode (`SKS_CODEX_0139_PROBE=1`) additionally exercises `codex plugin marketplace list --json` (checking the new `source` field shape) and the `-P` alias in `codex --help`. `SKS_CODEX_0139_FAKE=1` with `SKS_CODEX_VERSION_FAKE` drives hermetic gate fixtures. SKS is Codex-0.139-aware capability detection, not a claim that every installed environment bundles or always supports Codex 0.139 features.

## Runtime adaptations

- **`interrupt_agent` event classification.** The cockpit subagent-stage classifier accepts both `close_agent` (≤0.138) and `interrupt_agent` (0.139+) so multi-agent v2 lifecycle events keep mapping to `result` stages on newer CLIs.
- **Marketplace `source` tolerance.** The plugin marketplace JSON parser treats the new per-marketplace `source` field as evidence of the 0.139 surface and tolerates array, `marketplaces`, and `items` wrapper shapes.
- **Richer schemas, fewer workarounds.** SKS-generated worker output schemas already avoid deep nesting for compaction safety; on 0.139 the preserved `oneOf`/`allOf` support is recorded so future schema tightening can be gated on `supports_rich_tool_schemas` instead of version sniffing.

## Non-goals

Sandbox proxy-network enforcement (#27035), approval-decision preservation (#24981), TUI fixes, and symbol-archive release chores need no SKS-side changes; they are upstream behavior SKS simply benefits from. The Codex baseline policy (`CODEX_REQUIRED_BASELINE_TAG = rust-v0.136.0`) is unchanged.
