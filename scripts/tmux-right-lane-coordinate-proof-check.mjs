#!/usr/bin/env node
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.mjs';
const mod = await importDist('core/tmux/warp-tmux-right-lane-layout.js');
const result = await mod.writeWarpTmuxRightLaneLayout(`${root}/.sneakoscope/reports`, { missionId: 'coordinate-gate', laneCount: 1 });
assertGate(result.coordinate_proof.ok === true, 'right-lane coordinate proof must pass', result.coordinate_proof);
assertGate(result.coordinate_proof.lane_panes[0].pane_left > result.coordinate_proof.main_pane.pane_left, 'lane pane must be right of main pane', result.coordinate_proof);
emitGate('tmux:right-lane-coordinate-proof', { lane_panes_right_of_main: result.coordinate_proof.lane_panes_right_of_main });
