# Troubleshooting tmux Lanes 1.18.0

If tmux lanes are missing, check:

- `agents/agent-tmux-layout.json`
- `agents/agent-tmux-lanes.json`
- `sks team open-tmux <mission-id>`
- `sks team cleanup-tmux <mission-id>`

tmux mode proof requires a lane manifest. Non-tmux runs can still write the manifest as an operator read model.
