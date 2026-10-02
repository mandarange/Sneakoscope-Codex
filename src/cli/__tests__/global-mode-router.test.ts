import test from 'node:test';
import assert from 'node:assert/strict';
import { findRetiredGlobalExecutionArgumentErrors } from '../global-mode-router.js';

test('--glm is a retired global execution option', () => {
  assert.ok(findRetiredGlobalExecutionArgumentErrors(['--glm']).includes('unsupported_argument:--glm'));
  assert.ok(findRetiredGlobalExecutionArgumentErrors(['--mad', '--glm=on', '--json']).includes('unsupported_argument:--glm'));
  assert.deepEqual(findRetiredGlobalExecutionArgumentErrors(['--mad', '--json']), []);
});
