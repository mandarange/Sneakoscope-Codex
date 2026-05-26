# Real tmux Pane Proof 1.18.4

SKS 1.18.4 separates tmux fixture evidence from physical tmux runtime truth.

Real tmux proof is written under the agent ledger root:

- `agent-tmux-physical-proof.json`
- `agent-tmux-list-panes.json`
- `agent-tmux-pane-reconciliation.json`
- `agent-tmux-lane-content-truth.json`
- `agent-tmux-capture-<slot>.txt`

In real tmux mode, proof requires `tmux list-panes -a -F`, valid physical pane ids such as `%101`, supervisor-to-ledger-to-manifest reconciliation, `tmux capture-pane` content, lane slot id visibility, generation or idle/drained status, queue summary visibility, and drain-close evidence. Fake pane ids such as `fake-pane-slot-001` are always fixture-only and block real tmux proof.

If tmux is not available during `release:real-check`, the gate reports `integration_optional`; it does not promote fake pane ids or manifest-only evidence to real proof.
