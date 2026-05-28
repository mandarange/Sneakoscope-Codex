#!/usr/bin/env node
import fs from 'node:fs';
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.mjs';

const mod = await importDist('core/tmux/warp-tmux-right-lane-layout.js');
const result = await mod.writeWarpTmuxRightLaneLayout(`${root}/.sneakoscope/reports`, { missionId: 'content-gate', laneCount: 1 });
const content = result.coordinate_proof.content_proof[0];
assertGate(content.ok === true, 'right-lane content proof must include header, worker, patch queue, and current file', content);
fs.writeFileSync(`${root}/.sneakoscope/reports/tmux-right-lane-content-proof.json`, `${JSON.stringify({ ok: true, content_proof: result.coordinate_proof.content_proof }, null, 2)}\n`);
emitGate('tmux:right-lane-content-proof', { content_ok: content.ok });
