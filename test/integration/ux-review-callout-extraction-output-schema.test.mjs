import test from 'node:test';
import assert from 'node:assert/strict';
import { outputSchemaExtractionPreference } from '../../dist/core/image-ux-review/callout-extraction.js';

test('UX-Review callout extraction records output-schema preference', async () => {
  const preference = await outputSchemaExtractionPreference();
  assert.ok(['verified', 'verified_partial'].includes(preference.fallback_cap));
  assert.equal(typeof preference.preferred, 'boolean');
});
