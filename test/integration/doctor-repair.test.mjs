import test from 'node:test';
import assert from 'node:assert/strict';
import { rustInfo } from '../../src/core/rust-accelerator.mjs';

test('doctor-adjacent rust capability reports concrete availability', async () => {
  const info = await rustInfo();
  assert.equal(typeof info.available, 'boolean');
  assert.ok(info.packaging);
});
