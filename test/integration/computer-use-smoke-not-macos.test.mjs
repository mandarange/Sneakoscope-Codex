import test from 'node:test';
import assert from 'node:assert/strict';
import { computerUseLiveSmoke } from '../../dist/core/computer-use-status.js';

test('Computer Use smoke returns structured optional status', async () => {
  const result = await computerUseLiveSmoke({});
  assert.equal(result.schema, 'sks.computer-use-live-smoke.v2');
  assert.ok(['available', 'codex_app_missing', 'macos_permission_missing', 'codex_app_capability_missing', 'external_capability_blocked', 'not_macos', 'unknown'].includes(result.status));
});
