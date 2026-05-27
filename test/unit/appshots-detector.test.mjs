import test from 'node:test';
import assert from 'node:assert/strict';
import { detectAppshotsCapability } from '../../dist/core/codex/appshots-detector.js';

test('Appshots detector blocks visual proof without operator action', () => {
  assert.equal(detectAppshotsCapability({ prompt: 'release metadata' }).status, 'not_required');
  assert.equal(detectAppshotsCapability({ prompt: 'visual Appshots proof' }).ok, false);
  assert.equal(detectAppshotsCapability({ prompt: 'visual Appshots proof', operatorActionRecorded: true }).ok, true);
});
