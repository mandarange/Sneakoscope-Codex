#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.mjs';

const mod = await importDist('core/agents/tmux-lane-supervisor.js');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-lane-persistence-'));
let supervisor = await mod.initializeTmuxLaneSupervisor(root, { missionId: 'M-lane', targetActiveSlots: 1, sessionName: 'sks-M-lane' });
assertGate(supervisor.lanes.length === 1, 'one lane must be opened', supervisor);
const paneId = supervisor.lanes[0].pane_id;
supervisor = await mod.updateTmuxLaneSupervisorFromSlots(root, {
  missionId: 'M-lane',
  slots: [{ slot_id: 'slot-001', current_session_id: 's1', current_generation_index: 1, generation_count: 1, status: 'running', history: [{ session_id: 's1', generation_index: 1, task_id: 'w1', opened_at: new Date().toISOString(), closed_at: null, status: 'running' }] }]
});
assertGate(supervisor.lanes[0].pane_id === paneId, 'pane id must remain stable while generation changes', supervisor.lanes[0]);
assertGate(await exists(path.join(root, 'lanes/slot-001/lane.md')), 'lane markdown must exist');
assertGate(await exists(path.join(root, 'lanes/slot-001/lane.json')), 'lane json must exist');
supervisor = await mod.verifyTmuxLaneSurvival(root);
assertGate(supervisor.pane_survival_checked === true, 'pane survival must be checked', supervisor);
supervisor = await mod.drainTmuxLaneSupervisor(root);
assertGate(supervisor.all_lanes_closed_after_drain === true, 'lanes must close after drain', supervisor);
emitGate('agent:tmux-lane-persistence', { lane_count: supervisor.lane_count, pane_id: paneId });

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
