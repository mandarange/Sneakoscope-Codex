import test from 'node:test';
import assert from 'node:assert/strict';
import { rustInfo } from '../../dist/core/rust-accelerator.js';

test('doctor-adjacent rust capability reports concrete availability', async () => {
  const info = await rustInfo();
  assert.equal(typeof info.available, 'boolean');
  assert.ok(info.packaging);
  assert.ok(['rust_accelerated', 'js_fallback'].includes(info.mode));
  assert.ok(info.build_hint.includes('cargo build --release'));
});
