import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWarpTmuxRightLaneLayout } from '../../dist/core/tmux/warp-tmux-right-lane-layout.js';

test('right-lane coordinate proof blocks lanes left of main pane', async () => {
  const listPanesText = ['s\t@1\t%1\t80\t0\t80\t40\tzsh', 's\t@1\t%2\t10\t0\t40\t40\tsh'].join('\n');
  const result = await buildWarpTmuxRightLaneLayout('/tmp', {
    laneCount: 1,
    listPanesText,
    captureByPaneId: { '%2': 'SKS lane\nworker status\npatch queue\ncurrent file\n' }
  });
  assert.equal(result.coordinate_proof.ok, false);
  assert.ok(result.coordinate_proof.blockers.some((blocker) => blocker.startsWith('lane_not_right_of_main')));
});
