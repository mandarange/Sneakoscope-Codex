# tmux Right-Lane Cockpit 1.18.0

SKS 1.18.0 records a tmux cockpit manifest where the orchestrator/main pane is on the left and agent lanes are indexed as a right vertical stack.

Artifacts:

- `agents/agent-tmux-layout.json`
- `agents/agent-tmux-lanes.json`

The lane manifest records agent id, persona, task, status, heartbeat age, transcript tail, close marker, blocker marker, attach command, keyboard hint, and cleanup command hint. Up to 20 agents are indexed with pagination metadata so large Team runs remain inspectable.
