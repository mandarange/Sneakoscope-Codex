# Troubleshooting Agent Terminal Close 1.18.0

Agent proof blocks when terminal session evidence is incomplete.

Check each `agents/sessions/<agent_id>/` directory for:

- `agent-terminal-session.json`
- `agent-terminal-close-report.json`
- `terminal-transcript.log`
- `terminal-stdout.log`
- `terminal-stderr.log`

If a terminal session is open or the close report is missing, rerun the route or close the agent session before claiming proof completion.
