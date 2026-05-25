import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeTmuxLaneSupervisor, drainTmuxLaneSupervisor } from '../../dist/core/agents/tmux-lane-supervisor.js';
import test from 'node:test';

test('tmux lane supervisor writes persistent lane files and drains', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-unit-lane-'));
  const initialized = await initializeTmuxLaneSupervisor(root, { missionId: 'M', targetActiveSlots: 1 });
  assert.equal(initialized.lane_count, 1);
  await fs.access(path.join(root, 'lanes/slot-001/lane.md'));
  const drained = await drainTmuxLaneSupervisor(root);
  assert.equal(drained.all_lanes_closed_after_drain, true);
});
