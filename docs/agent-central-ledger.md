# Agent Central Ledger

SKS 1.16.0 release note.

Native agent missions write append-only events under `.sneakoscope/missions/<id>/agents/agent-events.jsonl`. Each entry has a sequence number and hash pointer. Session lifecycle, messages, handoffs, task board, leases, conflict graph, consensus, and proof evidence live in the same `agents/` mission directory.

Agent writes are scoped through `validateAgentLedgerWriteScope`: workers may append central message/event/handoff records and update only their own `sessions/<agent>.json` record. Other session records, aggregate `agent-sessions.json`, proof, roster, leases, consensus, trust, cleanup, timeout, and output-tail artifacts are orchestrator-only.
