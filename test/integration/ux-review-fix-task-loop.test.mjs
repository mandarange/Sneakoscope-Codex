import test from 'node:test';
import assert from 'node:assert/strict';
import { planImageUxFixTasks } from '../../dist/core/image-ux-review/fix-task-planner.js';
import { runImageUxFixLoop } from '../../dist/core/image-ux-review/fix-loop.js';

test('UX-Review fix task loop records patch and recapture requirement', () => {
  const issueLedger = { issues: [{ id: 'issue-1', severity: 'P1', status: 'open', source_screen_id: 'screen-1', callout_id: 'c1', candidate_files: ['src/ui.tsx'], fix_action: 'Fix spacing' }] };
  const plan = planImageUxFixTasks(issueLedger);
  const loop = runImageUxFixLoop(issueLedger, plan, { patchApplied: true, changedFiles: ['src/ui.tsx'], patchCommands: ['apply_patch'] });
  assert.equal(loop.passed, true);
  assert.equal(loop.recapture_required, true);
  assert.deepEqual(loop.changed_files, ['src/ui.tsx']);
});
