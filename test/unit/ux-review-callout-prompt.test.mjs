import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalloutPrompt } from '../../dist/core/image-ux-review/imagegen-adapter.js';

test('UX-Review callout prompt requires visible annotated image evidence', () => {
  const prompt = buildCalloutPrompt('screen-1', { target: 'settings screen' });
  for (const phrase of ['numbered callouts', 'P0/P1/P2/P3', 'eye-flow arrows', 'corrected mini-comp', 'Do not invent product requirements']) {
    assert.match(prompt, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
