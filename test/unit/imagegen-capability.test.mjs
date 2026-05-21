import test from 'node:test';
import assert from 'node:assert/strict';
import { detectImagegenCapability } from '../../dist/core/imagegen/imagegen-capability.js';

test('imagegen capability records gpt-image-2 fidelity policy', async () => {
  const capability = await detectImagegenCapability({ fake: true });
  assert.equal(capability.ok, true);
  assert.equal(capability.model, 'gpt-image-2');
  assert.equal(capability.input_fidelity_must_be_omitted, true);
  assert.equal(capability.gpt_image_2_input_fidelity_automatic, true);
  assert.equal(capability.fake_adapter.available, true);
});
