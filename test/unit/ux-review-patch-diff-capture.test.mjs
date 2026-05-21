import test from 'node:test';
import assert from 'node:assert/strict';
import { runImageUxFixLoop } from '../../dist/core/image-ux-review/fix-loop.js';

test('ux-review fix loop records changed files and recapture requirement', () => {
  const loop = runImageUxFixLoop({ issues: [{ id: 'i1', severity: 'P1', status: 'open' }] }, { tasks: [{ id: 't1', issue_id: 'i1', candidate_files: ['src/app.ts'], risk_level: 'low' }] }, { apply: true, patchApplied: true, changedFiles: ['src/app.ts'] });
  assert.deepEqual(loop.changed_files, ['src/app.ts']);
  assert.equal(loop.recapture_required, true);
});
