#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.mjs';

const mod = await importDist('core/agents/tmux-lane-supervisor.js');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-lane-no-flicker-'));
await mod.initializeTmuxLaneSupervisor(root, { missionId: 'M-no-flicker', targetActiveSlots: 1, sessionName: 'sks-M-no-flicker' });
let supervisor = await mod.updateTmuxLaneSupervisorFromSlots(root, {
  missionId: 'M-no-flicker',
  slots: [slot('s1', 1, 'running', null)]
});
const paneId = supervisor.lanes[0].pane_id;
supervisor = await mod.updateTmuxLaneSupervisorFromSlots(root, {
  missionId: 'M-no-flicker',
  slots: [slot(null, null, 'idle', 'completed')]
});
assertGate(supervisor.lanes[0].closed_at === null, 'lane must not close when generation 1 completes', supervisor.lanes[0]);
supervisor = await mod.updateTmuxLaneSupervisorFromSlots(root, {
  missionId: 'M-no-flicker',
  slots: [slot('s2', 2, 'running', 'completed')]
});
assertGate(supervisor.lanes[0].pane_id === paneId, 'same pane must show generation 2', supervisor.lanes[0]);
supervisor = await mod.verifyTmuxLaneSurvival(root);
assertGate(supervisor.unexpected_close_count === 0, 'no unexpected close before drain', supervisor);
supervisor = await mod.drainTmuxLaneSupervisor(root);
assertGate(supervisor.no_flicker_verified === true, 'no-flicker must be verified after drain', supervisor);
assertGate(supervisor.lanes[0].closed_at !== null, 'lane closes only after drain', supervisor.lanes[0]);
emitGate('agent:tmux-lane-no-flicker', { pane_id: paneId, no_flicker_verified: supervisor.no_flicker_verified });

function slot(session, generation, status, previousStatus) {
  const history = [];
  if (previousStatus) history.push({ session_id: 's1', generation_index: 1, task_id: 'w1', opened_at: new Date().toISOString(), closed_at: new Date().toISOString(), status: previousStatus });
  if (session) history.push({ session_id: session, generation_index: generation, task_id: `w${generation}`, opened_at: new Date().toISOString(), closed_at: null, status: 'running' });
  return { slot_id: 'slot-001', current_session_id: session, current_generation_index: generation, generation_count: generation || 1, status, history };
}
