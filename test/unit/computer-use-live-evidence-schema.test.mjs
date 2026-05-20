import test from 'node:test';
import assert from 'node:assert/strict';
import { computerUseLiveSmoke } from '../../dist/core/computer-use-status.js';

test('Computer Use live smoke evidence schema never fabricates screenshots', async () => {
  const result = await computerUseLiveSmoke({});
  assert.equal(result.evidence.screenshot_captured, false);
  assert.equal(result.evidence.action_captured, false);
  assert.equal(result.evidence.image_voxel_linked, false);
});
