# Warp tmux Right-Lane Layout 1.18.11

SKS 1.18.11 requires the Warp/tmux right-lane cockpit to be a physical tmux layout, not a manifest-only or shell-only claim.

The right lane manager must create a real right-side lane with `tmux split-window -h`. The lane is only proven when `tmux list-panes -F` reports a lane pane whose `pane_left` is greater than the orchestrator pane's `pane_left`, whose `pane_width` is positive, and whose right edge is at or beyond the orchestrator pane's right edge. A lane id must be a real tmux pane id such as `%101`; synthetic ids, manifest ids, and zsh process ids are not physical lane proof.

Required right-lane evidence:

- `split_command`: the actual `tmux split-window -h` command used for the lane.
- `session` and `window_id`: the tmux target that owns the cockpit.
- `orchestrator_pane_id` and `right_lane_pane_id`: real pane ids from `tmux list-panes`.
- `list_panes_before` and `list_panes_after`: parsed rows including `pane_id`, `pane_left`, `pane_top`, `pane_width`, `pane_height`, and `pane_current_command`.
- `coordinate_proof`: a computed result that the lane is physically to the right of the orchestrator pane.
- `attach_command`: a noninteractive operator action such as `tmux attach -t <session>` for Warp or any terminal with tmux support.

The right lane renderer must persist until drain. Worker generations update the lane header, worker state, patch summary, verification summary, and blockers in the same right-lane pane. A completed worker generation must not close the pane. The pane can close only after the supervisor writes the drain signal and records before-drain alive evidence plus after-drain closed or drained evidence.

Capture proof is mandatory. `tmux capture-pane -p -t <right_lane_pane_id>` must contain:

- lane header text naming the SKS mission and right-lane slot.
- worker identity or worker-slot text.
- patch/status text, including changed-file or no-change state.
- verification text, including tests run or blocker reason.

If any capture check is missing, the proof level is `blocked` or `real_required_missing`, never `proven`.

## Operator Action

When automatic Warp visibility cannot be proven, the runtime must emit an `operator_action_required` record instead of inventing fallback UI proof:

```bash
tmux attach -t <session>
```

The action is noninteractive for the SKS gate: it tells the operator exactly how to inspect the existing tmux session, and the gate remains unproven until physical coordinates and captured lane content are recorded.

## MAD-SKS Proof Rule

MAD-SKS must not mark a lane as proven from a zsh command, manifest row, launch ledger, or terminal-program hint alone. MAD proof is `proven` only when the same physical right-lane checks pass: real pane id, right-side `list-panes` coordinates, captured lane header/worker/patch/verification content, and persistent renderer lifecycle evidence through drain.
