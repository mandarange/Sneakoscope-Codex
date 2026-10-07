# TriWiki Runtime State

Durable TriWiki memory and runtime scratch state are separate.

- Durable memory remains in `.sneakoscope/wiki`.
- Runtime reports, launch proofs, lane heartbeats, and temporary inventories live under `.sneakoscope/reports`, `.sneakoscope/missions/<id>`, and `.sneakoscope/state`.
- SQLite or JSONL runtime stores must not become the long-term TriWiki source of truth unless promoted through a wiki refresh/validate flow.

Jev vNext follows the same boundary. Mission intake, task leases, and plan
receipts are runtime artifacts. Canonical memory remains in the existing
sharded records, wrongness, avoidance, image-voxel, summary, and tombstone
subtrees. Align copies those canonical subtrees into the generated wiki
generation under the TriWiki lock and rebuilds derived indexes from the copied
records; generated code graph artifacts never become memory source truth.
