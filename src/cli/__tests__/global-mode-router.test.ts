import test from 'node:test';
import assert from 'node:assert/strict';
import { detectGlobalMode, glmWithoutMadResult, stripGlobalModeFlags } from '../global-mode-router.js';

test('detectGlobalMode routes top-level --mad --glm before command dispatch', () => {
  assert.deepEqual(detectGlobalMode(['--mad', '--glm', '--json']), {
    kind: 'mad-glm',
    args: ['--json']
  });
  assert.deepEqual(stripGlobalModeFlags(['--mad', '--glm', '--repair']), ['--repair']);
});

test('detectGlobalMode blocks bare --glm and leaves help/version alone', () => {
  assert.deepEqual(detectGlobalMode(['--glm']), { kind: 'glm-without-mad', args: [] });
  assert.equal(detectGlobalMode(['help']), null);
  assert.equal(detectGlobalMode(['version']), null);
  assert.equal(glmWithoutMadResult().hint, 'use sks --mad --glm');
});
