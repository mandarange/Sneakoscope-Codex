#!/usr/bin/env node
import fs from 'node:fs';
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.mjs';

const mod = await importDist('core/tmux/warp-tmux-right-lane-layout.js');
const result = await mod.writeWarpTmuxRightLaneLayout(`${root}/.sneakoscope/reports`, { missionId: 'mad-attach-gate', laneCount: 1 });
assertGate(result.layout.attach_command.includes('tmux attach -t'), 'MAD attach proof must record exact attach command', result.layout);
assertGate(result.physical_layout_proof.operator_action_required === false, 'non-required fixture gate must not block on attach', result.physical_layout_proof);
fs.writeFileSync(`${root}/.sneakoscope/reports/mad-sks-warp-right-lane-attach.json`, `${JSON.stringify({ ok: true, attach_command: result.layout.attach_command, operator_action_required: result.layout.operator_action_required }, null, 2)}\n`);
emitGate('mad-sks:warp-right-lane-attach', { attach_command: result.layout.attach_command, operator_action_required: result.layout.operator_action_required });
