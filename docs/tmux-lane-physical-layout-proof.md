# tmux Lane Physical Layout Proof 1.18.11

SKS 1.18.11 strengthens tmux lane proof from "a lane was requested" to "a right-side tmux pane existed, contained the expected worker UI, and survived until drain."

## Proof Contract

A physical right lane is proven only when all of these checks pass:

- `tmux split-window -h` was executed for the right lane manager.
- `tmux list-panes -F` captured before and after pane rows for the target session/window.
- the right-lane pane id exists in the after rows and is a real tmux pane id.
- coordinate comparison proves the right-lane pane is to the right of the orchestrator pane.
- `tmux capture-pane -p` captured the right-lane pane content.
- captured content contains lane header, worker, patch/status, and verification/blocker sections.
- before-drain evidence proves the pane stayed alive after worker generation completion.
- after-drain evidence proves the lane closed or reported drained only after the drain signal.

The minimum `list-panes` format for coordinate proof is:

```bash
tmux list-panes -t <session>:<window> -F '#{pane_id}|#{pane_left}|#{pane_top}|#{pane_width}|#{pane_height}|#{pane_current_command}'
```

The minimum content proof command is:

```bash
tmux capture-pane -p -t <right_lane_pane_id>
```

## Failure Classification

`proven`: every physical coordinate, capture-content, and lifecycle check passed.

`blocked`: tmux was attempted but the command failed, the pane could not be captured, the content was incomplete, or coordinates could not be reconciled.

`real_required_missing`: real tmux proof was required but no physical pane evidence was available.

`integration_optional`: tmux was unavailable and the gate was not configured to require real tmux proof.

The proof must never promote these signals to `proven` by themselves:

- a lane manifest row.
- a launch ledger entry.
- a zsh process, shell prompt, or command string.
- a Warp terminal detection flag.
- a synthetic pane id.
- a screenshot or prose assertion without `list-panes` and `capture-pane` evidence.

## Right-Lane Content Checks

The capture verifier must check for the expected right-lane cockpit sections:

- `SKS RIGHT LANE` or equivalent lane header.
- mission id and slot id.
- worker id, role, or current assignment.
- patch summary or explicit no-change state.
- verification summary, tests run, or blocker text.
- drain state when the lane is draining or drained.

These checks make the pane useful to an operator and prevent a blank shell, stale zsh prompt, or manifest-only row from satisfying the physical proof gate.

## Persistent Renderer

The renderer is slot-owned. It refreshes the same pane as worker generations change, and it keeps rendering until drain. Generation completion updates content; it does not close the lane. The physical proof gate should compare before-drain and after-drain artifacts so early pane closure is treated as a failure.

## Operator Attach Command

If automatic visual inspection is unavailable, write a machine-readable `operator_action_required` entry with:

- `reason`: why automatic proof could not finish.
- `attach_command`: `tmux attach -t <session>`.
- `target`: session/window/pane identifiers.
- `remaining_evidence`: the missing coordinate, capture, or lifecycle checks.

This is an inspection instruction, not fallback proof. The lane remains unproven until the missing evidence is collected.
