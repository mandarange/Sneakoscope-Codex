import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTmuxRightLaneCockpit } from '../../dist/core/agents/tmux-right-lane-cockpit.js';

test('builds left orchestrator and right vertical agent lane manifest', () => {
  const cockpit = buildTmuxRightLaneCockpit({ agents: Array.from({ length: 5 }, (_, index) => ({ id: `a${index + 1}`, role: 'verifier' })) });
  assert.equal(cockpit.layout.orchestrator_pane, 'left');
  assert.equal(cockpit.layout.agent_lane_stack, 'right_vertical');
  assert.equal(cockpit.lanes.lane_count, 5);
});
