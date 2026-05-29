# TriWiki Runtime State

Durable TriWiki memory and runtime scratch state are separate.

- Durable memory remains in `.sneakoscope/wiki`.
- Runtime reports, launch proofs, lane heartbeats, and temporary inventories live under `.sneakoscope/reports`, `.sneakoscope/missions/<id>`, and `.sneakoscope/state`.
- SQLite or JSONL runtime stores must not become the long-term TriWiki source of truth unless promoted through a wiki refresh/validate flow.
