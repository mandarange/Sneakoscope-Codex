# Warp MAD tmux Lanes 1.18.6

SKS 1.18.6 records MAD-SKS lane visibility through `sks.mad-sks-tmux-lane-ui.v1`.

When `sks --mad` opens a MAD lane, the command writes:

- `<mission>/mad-sks-tmux-lane-ui.json`
- `.sneakoscope/reports/mad-sks-tmux-lane-ui.json`

The proof records the mission id, tmux session, attach command, terminal program, Warp detection, pane list rows, `visible_lane_contract`, `proof_level`, and blockers. A real visible lane is `proven`; a required missing lane is `real_required_missing`; an attempted but unverifiable lane is `blocked`.

`SKS_REQUIRE_WARP_MAD_LANES=1` is historical. In SKS 1.18.13+, use `SKS_REQUIRE_ZELLIJ=1` plus `npm run zellij:pane-proof` and `npm run zellij:screen-proof` for required interactive runtime proof.
