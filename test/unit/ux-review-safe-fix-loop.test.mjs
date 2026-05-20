import test from 'node:test';
import assert from 'node:assert/strict';
import { runImageUxFixLoop } from '../../dist/core/image-ux-review/fix-loop.js';

test('safe fix loop stops on repeated blockers and never allows destructive DB operations', () => {
  const result = runImageUxFixLoop({}, { tasks: [] }, {
    blockerEvents: [
      { reason: 'imagegen_capability_missing', detail: 'host unavailable' },
      { reason: 'imagegen_capability_missing', detail: 'host unavailable' }
    ]
  });
  assert.equal(result.repeated_blocker.stop_required, true);
  assert.equal(result.db_destructive_operations_allowed, false);
  assert.ok(result.blockers.includes('repeated_blocker_stop'));
});
