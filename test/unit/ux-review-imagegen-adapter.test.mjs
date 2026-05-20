import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalloutPrompt, createCodexAppImagegenAdapter, imagegenCapabilityBlocker } from '../../dist/core/image-ux-review/imagegen-adapter.js';

test('Codex App imagegen adapter blocks honestly when host capability is unavailable', async () => {
  const adapter = createCodexAppImagegenAdapter();
  assert.equal(adapter.model, 'gpt-image-2');
  assert.equal(adapter.available, false);
  const result = await adapter.generateCalloutReview({});
  assert.equal(result.blocker, 'imagegen_capability_missing');
  assert.equal(imagegenCapabilityBlocker().model, 'gpt-image-2');
  assert.match(buildCalloutPrompt('screen-1'), /Text-only response is invalid/);
});
