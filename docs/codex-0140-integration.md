# Codex 0.140 Integration

SKS 3.1.12 treats Codex CLI 0.140 as a capability surface, not a hard assumption.

- `codex:0140-capability` detects Codex >= 0.140 and records feature booleans.
- `codex:0140-feature-probes` validates the hermetic fixture path for release gates.
- Feature gates cover `/usage`, `/goal` attachment preservation, session delete, import, unified mentions, Bedrock managed auth, MCP reliability, SQLite recovery, non-TTY interrupt, and large repo responsiveness.
- `codex:0140-real-probes` is optional by default and reports skipped probes when real Codex 0.140 evidence is unavailable.
- `codex:0140-real-probes:require-real` fails closed when the real environment cannot prove 0.140 support.

No gate prints raw credential values. Destructive session deletion remains represented as a safety wrapper surface and requires explicit confirmation in real operator flows.
