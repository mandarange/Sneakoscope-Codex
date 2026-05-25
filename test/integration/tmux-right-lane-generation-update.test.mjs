import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTmuxRightLaneCockpit } from '../../dist/core/agents/tmux-right-lane-cockpit.js';

test('tmux lane shows slot generation updates', () => {
  const cockpit = buildTmuxRightLaneCockpit({ slots: [{ slot_id: 'slot-001', status: 'running', current_generation_index: 2, current_session_id: 's2', pane_id: 'fake-pane', history: [{ generation_index: 1, status: 'closed' }] }] });
  assert.equal(cockpit.lanes.lanes[0].slot_id, 'slot-001');
  assert.equal(cockpit.lanes.lanes[0].generation_index, 2);
  assert.equal(cockpit.lanes.actual_pane_ids.length, 1);
});
