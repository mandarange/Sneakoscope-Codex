# Codex 0.140 Integration

SKS 3.1.13 treats Codex CLI 0.140 as an evidence-bearing capability surface, not a hard assumption.

- `codex:0140-capability` detects Codex >= 0.140 and records feature booleans, feature states, and certainty values.
- `codex:0140-feature-probes` and `codex:0140-deep-probes` validate the hermetic fixture path plus version-only warning behavior for release gates.
- `codex:0140-usage-real-parser` parses JSON and text usage output for daily, weekly, cumulative, token, and limit fields.
- `codex:0140-goal-attachment-roundtrip` records checksum evidence for large goal text plus attachment metadata preservation.
- Feature gates cover `/usage`, `/goal` attachment preservation, session delete, import, unified mentions, Bedrock managed auth, MCP reliability, SQLite recovery, non-TTY interrupt, and large repo responsiveness.
- `codex:0140-real-probes` is optional by default and reports skipped probes when real Codex 0.140 evidence is unavailable.
- `codex:0140-real-probes:require-real` fails closed when the real environment cannot prove 0.140 support.
- Loop/Naruto concurrency reports include `codex_usage_signal` and `usage_budget_source` so runtime decisions can distinguish Codex 0.140 usage evidence from local estimates.

No gate prints raw credential values. Destructive session deletion remains represented as a safety wrapper surface and requires explicit confirmation in real operator flows.
