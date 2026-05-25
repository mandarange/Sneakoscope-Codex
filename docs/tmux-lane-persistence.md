# Tmux Lane Persistence 1.18.2

SKS 1.18.2 treats tmux lanes as persistent worker-slot UI.

The lane supervisor writes:

- `agents/agent-tmux-lane-supervisor.json`
- `agents/agent-tmux-lane-supervisor-events.jsonl`
- `agents/lanes/<slot_id>/lane.md`
- `agents/lanes/<slot_id>/lane.json`
- `agents/lanes/.drain`

Generation completion updates the lane render files and slot history. It does not close the lane. Drain creates the drain signal and then closes lanes. Proof blocks if a lane closes before drain, if survival was not checked, or if no-flicker verification is missing.

Useful checks:

```bash
npm run agent:tmux-lane-persistence
npm run agent:tmux-lane-no-flicker
```
