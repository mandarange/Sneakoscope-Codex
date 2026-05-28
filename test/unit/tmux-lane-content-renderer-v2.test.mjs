import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWarpTmuxRightLaneLayout } from '../../dist/core/tmux/warp-tmux-right-lane-layout.js';

test('right-lane content proof requires lane header, worker, patch queue, and current file', async () => {
  const result = await buildWarpTmuxRightLaneLayout('/tmp', {
    laneCount: 1,
    listPanesText: 's\t@1\t%1\t0\t0\t80\t40\tzsh\ns\t@1\t%2\t81\t0\t40\t40\tsh',
    captureByPaneId: { '%2': 'SKS lane\nworker status: idle\npatch queue: empty\ncurrent file: none\n' }
  });
  assert.equal(result.coordinate_proof.content_proof[0].ok, true);
});
