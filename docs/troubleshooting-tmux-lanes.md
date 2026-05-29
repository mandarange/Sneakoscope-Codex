# Legacy Troubleshooting: tmux Lanes 1.18.0

For SKS 1.18.13+, use Zellij lane troubleshooting in [Runtime Migration: tmux To Zellij](migration/tmux-to-zellij.md). Historical tmux lane artifacts were:

- `agents/agent-tmux-layout.json`
- `agents/agent-tmux-lanes.json`
- Team open/cleanup commands now use Zellij equivalents.

The removed runtime proof required a lane manifest. Zellij proof now uses layout, pane, and screen artifacts.
