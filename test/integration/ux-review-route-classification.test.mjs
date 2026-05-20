import test from 'node:test';
import assert from 'node:assert/strict';
import { routePrompt } from '../../dist/core/routes.js';

test('UX-Review prompt with gpt-image-2 callouts routes to Image UX Review', () => {
  const route = routePrompt('$UX-Review this screenshot with gpt-image-2 callouts, then fix the issues');
  assert.equal(route.id, 'ImageUXReview');
  assert.equal(route.command, '$Image-UX-Review');
});
