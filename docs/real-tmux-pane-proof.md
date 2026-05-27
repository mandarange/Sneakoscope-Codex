# Real tmux Pane Proof 1.18.6

SKS 1.18.6 wires physical tmux runtime truth into the native agent orchestrator lifecycle.

Real tmux proof is written under the agent ledger root:

- `agent-tmux-physical-proof.json`
- `agent-tmux-physical-proof-before-drain.json`
- `agent-tmux-physical-proof-after-drain.json`
- `agent-tmux-physical-proof-final.json`
- `agent-tmux-physical-proof-summary.json`
- `agent-tmux-list-panes.json`
- `agent-tmux-pane-reconciliation.json`
- `agent-tmux-lane-content-truth.json`
- `agent-tmux-capture-<phase>-<slot>.txt`

In real tmux mode, proof requires `tmux list-panes -a -F`, valid physical pane ids such as `%101`, supervisor-to-launch-ledger-to-lane-manifest reconciliation, `tmux capture-pane` content, lane slot id visibility, generation or idle/drained status, queue summary visibility, before-drain alive evidence, and after-drain closed/drained evidence. Fake pane ids such as `fake-pane-slot-001` are always fixture-only and block real tmux proof.

Each report includes `required_mode` and `proof_level`. If tmux is not available during `release:real-check`, the gate reports `integration_optional`; it does not promote fake pane ids or manifest-only evidence to real proof. `SKS_REQUIRE_REAL_TMUX=1` turns missing tmux, missing `list-panes`, or missing lifecycle phase artifacts into `real_required_missing` blockers.
