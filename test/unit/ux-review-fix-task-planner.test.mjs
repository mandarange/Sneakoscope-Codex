import test from 'node:test';
import assert from 'node:assert/strict';
import { planImageUxFixTasks } from '../../dist/core/image-ux-review/fix-task-planner.js';

test('fix task planner maps P0/P1 and leaves P3 as suggestion by default', () => {
  const plan = planImageUxFixTasks({
    issues: [
      { id: 'p0', severity: 'P0', status: 'open', source_screen_id: 'screen-1', callout_id: 'c1', candidate_files: ['src/a.ts'], fix_action: 'Increase contrast' },
      { id: 'p1', severity: 'P1', status: 'open', source_screen_id: 'screen-1', callout_id: 'c2', candidate_files: ['src/b.ts'], fix_action: 'Fix alignment' },
      { id: 'p3', severity: 'P3', status: 'open', source_screen_id: 'screen-1', callout_id: 'c3', fix_action: 'Nice-to-have polish' }
    ]
  });
  assert.equal(plan.p0_p1_task_count, 2);
  assert.deepEqual(plan.tasks.map((task) => task.issue_id), ['p0', 'p1']);
});
