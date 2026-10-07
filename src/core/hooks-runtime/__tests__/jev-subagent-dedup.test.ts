import test from 'node:test';
import assert from 'node:assert/strict';
import { attachOrCreateTask, buildTaskKey, fenceTaskResult, clearTaskLease } from '../../pipeline-internals/runtime-core.js';

test('same task key attaches to one active lease and fences late results', () => {
  const taskKey = buildTaskKey({ planId: 'plan', taskId: 'slice', objective: 'inspect', baseSnapshotDigest: 'a'.repeat(64) });
  const first = attachOrCreateTask({ taskKey, planId: 'plan', baseSnapshotDigest: 'a'.repeat(64), now: 1_000 });
  const second = attachOrCreateTask({ taskKey, planId: 'plan', baseSnapshotDigest: 'a'.repeat(64), now: 1_500 });
  assert.equal(first.attached, false);
  assert.equal(second.attached, true);
  assert.equal(fenceTaskResult(taskKey, first.identity.fencing_token, first.identity.lease_id, 1_600), true);
  assert.equal(fenceTaskResult(taskKey, first.identity.fencing_token + 1, first.identity.lease_id, 1_600), false);
  clearTaskLease(taskKey);
});
