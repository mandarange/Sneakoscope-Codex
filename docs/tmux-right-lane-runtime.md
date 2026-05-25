# Tmux Right-Lane Runtime

SKS 1.18.1 tmux lanes represent worker slots. A lane title includes the slot and current generation, while lane history records closed generations for the same slot.

The tmux runner records pane launch evidence in:

- `agents/agent-tmux-pane-launch-ledger.jsonl`
- `agents/agent-tmux-layout.json`
- `agents/agent-tmux-lanes.json`

When real tmux is available and explicitly requested, the runner launches panes and records real pane ids. In hermetic release fixtures, fake tmux pane ids are accepted as fake-runtime evidence; `optional_not_launched` is no longer an accepted tmux runtime state.

Proof requires pane launch evidence for tmux mode, and the cockpit is refreshed after scheduler launch, completion, backfill, and drain events.
