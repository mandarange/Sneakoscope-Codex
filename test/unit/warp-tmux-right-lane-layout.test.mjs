import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeWarpTmuxRightLaneLayout } from '../../dist/core/tmux/warp-tmux-right-lane-layout.js';

test('warp tmux right-lane layout writes coordinate and physical proof artifacts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-warp-layout-'));
  const result = await writeWarpTmuxRightLaneLayout(root, { missionId: 'M-layout', laneCount: 2 });
  assert.equal(result.layout.ok, true);
  assert.equal(result.coordinate_proof.lane_panes_right_of_main, true);
  await fs.access(path.join(root, 'warp-tmux-right-lane-layout.json'));
  await fs.access(path.join(root, 'tmux-right-lane-coordinate-proof.json'));
  await fs.access(path.join(root, 'tmux-right-lane-physical-layout-proof.json'));
});
