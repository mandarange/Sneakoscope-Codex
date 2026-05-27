# Agent Terminal Lanes 1.18.0

Every native agent now has terminal/session evidence in SKS 1.18.0.

SKS 1.18.4 adds physical tmux pane reconciliation and lane content truth artifacts so terminal lane claims can be checked against real pane ids and captured lane output.

SKS 1.18.2 makes those terminal lane artifacts generation-aware under stable worker slots, so a refilled slot keeps immutable close proof for each completed generation.

SKS 1.18.2 requires scheduler-mode terminal calls to carry `slot_id` and `generation_index`, and proof counts terminal close reports by generation.

SKS 1.18.3 adds proof reconciliation that compares terminal close reports with scheduler session generations and the slot-level tmux lane supervisor before route readiness can pass.

Per-agent artifacts live under `agents/sessions/<agent_id>/`:

- `agent-terminal-session.json`
- `agent-terminal-close-report.json`
- `terminal-transcript.log`
- `terminal-stdout.log`
- `terminal-stderr.log`

Fake backend sessions are recorded as `real: false`. Process, Codex exec, and tmux backends record their terminal backend and close status. Agent proof blocks when terminal sessions are missing, left open, or missing close reports.

## 1.18.6 Runtime Truth Note

SKS 1.18.6 keeps this surface in the runtime-truth release closure and links it to the lifecycle tmux proof, real Codex smoke v2, cleanup executor v2, AST-aware work graph, fake-real policy v2, and runtime truth matrix gates.
