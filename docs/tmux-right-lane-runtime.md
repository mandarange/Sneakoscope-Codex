# Tmux Right-Lane Runtime

SKS 1.18.2 tmux lanes represent persistent worker slots. A lane title includes the slot and current generation, while lane history records closed generations for the same slot. Generation completion updates the lane render files but does not close the lane before scheduler drain.

The tmux runner records pane launch evidence in:

- `agents/agent-tmux-pane-launch-ledger.jsonl`
- `agents/agent-tmux-layout.json`
- `agents/agent-tmux-lanes.json`
- `agents/agent-tmux-lane-supervisor.json`
- `agents/lanes/<slot_id>/lane.md`
- `agents/lanes/<slot_id>/lane.json`

When real tmux is available and explicitly requested, the runner launches panes and records real pane ids. In hermetic release fixtures, fake tmux pane ids are accepted as fake-runtime evidence; `optional_not_launched` is no longer an accepted tmux runtime state.

Proof requires lane supervisor evidence, pane survival checks, no unexpected close before drain, and no-flicker verification. The cockpit and lane render files are refreshed after scheduler launch, completion, backfill, draining, and drained events.
