import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGlmNarutoSessionId } from '../glm-naruto-session-id.js';

test('session id is safe and capped at 256 chars', () => {
  const id = normalizeGlmNarutoSessionId(`sks/${'x'.repeat(400)}`);
  assert.equal(id.length <= 256, true);
  assert.match(id, /^[A-Za-z0-9._:-]+$/);
});
