# Tmux Lane Persistence 1.18.3

SKS 1.18.4 adds physical pane reconciliation, lane capture freshness checks, and after-drain closure evidence for persistent tmux lane proof.

SKS 1.18.3 treats tmux lanes as persistent worker-slot UI. In scheduler tmux mode, the supervisor owns slot-level lane panes; worker generations update the slot lane render files and reuse the lane pane instead of launching a fresh pane per generation.

The lane supervisor writes:

- `agents/agent-tmux-lane-supervisor.json`
- `agents/agent-tmux-lane-supervisor-events.jsonl`
- `agents/lanes/<slot_id>/lane.md`
- `agents/lanes/<slot_id>/lane.json`
- `agents/lanes/.drain`

Generation completion updates the lane render files and slot history. It does not close the lane. Drain creates the drain signal and then closes lanes. Proof blocks if a lane closes before drain, if survival was not checked, if no-flicker verification is missing, or if a real tmux lane launch fails when real tmux mode is requested.

Useful checks:

```bash
npm run agent:tmux-lane-persistence
npm run agent:tmux-lane-no-flicker
npm run agent:tmux-supervisor-integrated
npm run agent:tmux-slot-lane-runtime
```

## 1.18.6 Runtime Truth Note

SKS 1.18.6 keeps this surface in the runtime-truth release closure and links it to the lifecycle tmux proof, real Codex smoke v2, cleanup executor v2, AST-aware work graph, fake-real policy v2, and runtime truth matrix gates.
