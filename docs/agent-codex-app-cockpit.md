# Agent Codex App Cockpit

SKS 1.17.0 adds Codex App-friendly agent cockpit artifacts derived from the native agent central ledger.

The ledger remains the source of truth. Cockpit files are read models written under `agents/`:

- `agent-codex-dashboard.md`
- `agent-codex-dashboard.json`
- `agent-session-cards.md`
- `agent-live-summary.json`
- `agent-progress-timeline.md`
- `agent-codex-cockpit-events.jsonl`

The dashboard shows mission id, project hash, backend, agent count, concurrency, lifecycle state, heartbeat age, lease ownership, blockers, recent event tails, and proof artifacts in a Markdown table that is easy to open from Codex App.
