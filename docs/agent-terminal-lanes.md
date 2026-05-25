# Agent Terminal Lanes 1.18.0

Every native agent now has terminal/session evidence in SKS 1.18.0.

SKS 1.18.1 makes those terminal lane artifacts generation-aware under stable worker slots, so a refilled slot keeps immutable close proof for each completed generation.

Per-agent artifacts live under `agents/sessions/<agent_id>/`:

- `agent-terminal-session.json`
- `agent-terminal-close-report.json`
- `terminal-transcript.log`
- `terminal-stdout.log`
- `terminal-stderr.log`

Fake backend sessions are recorded as `real: false`. Process, Codex exec, and tmux backends record their terminal backend and close status. Agent proof blocks when terminal sessions are missing, left open, or missing close reports.
