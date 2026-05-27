# tmux Right-Lane Cockpit 1.18.0

SKS 1.18.0 records a tmux cockpit manifest where the orchestrator/main pane is on the left and agent lanes are indexed as a right vertical stack.

SKS 1.18.4 requires real tmux cockpit proof to reconcile against `tmux list-panes` and captured lane content before proof can claim physical lane truth.

SKS 1.18.2 treats each right lane as a worker slot and requires pane launch evidence plus generation history when dynamic pool replenishment refills that slot.

SKS 1.18.2 backs cockpit rows with the persistent lane supervisor, lane render files, drain signal, and no-flicker proof gates.

SKS 1.18.3 requires the orchestrator to initialize that slot-level supervisor for tmux scheduler runs and blocks proof when generation-level pane launches masquerade as persistent worker-slot lanes.

Artifacts:

- `agents/agent-tmux-layout.json`
- `agents/agent-tmux-lanes.json`

The lane manifest records agent id, persona, task, status, heartbeat age, transcript tail, close marker, blocker marker, attach command, keyboard hint, and cleanup command hint. Up to 20 agents are indexed with pagination metadata so large Team runs remain inspectable.

## 1.18.6 Runtime Truth Note

SKS 1.18.6 keeps this surface in the runtime-truth release closure and links it to the lifecycle tmux proof, real Codex smoke v2, cleanup executor v2, AST-aware work graph, fake-real policy v2, and runtime truth matrix gates.
