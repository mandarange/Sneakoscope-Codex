#!/usr/bin/env node
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.mjs';
const mod = await importDist('core/tmux/warp-tmux-right-lane-layout.js');
const result = await mod.writeWarpTmuxRightLaneLayout(`${root}/.sneakoscope/reports`, { missionId: 'release-gate', laneCount: 2 });
assertGate(result.physical_layout_proof.ok === true, 'tmux right-lane physical UI proof must pass fixture coordinate gate', result);
assertGate(result.coordinate_proof.lane_panes_right_of_main === true, 'right lane panes must be right of main pane', result.coordinate_proof);
emitGate('tmux:warp-right-lane-physical-ui', { proof_level: result.physical_layout_proof.proof_level, lane_count: result.layout.lane_count });
