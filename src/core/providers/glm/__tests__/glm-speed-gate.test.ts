import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGlmSpeedGate } from '../glm-speed-gate.js';

test('GLM speed deterministic gate blocks malformed and forbidden paths', () => {
  assert.equal(evaluateGlmSpeedGate('<sks_patch>\ndiff --git a/src/a.ts b/src/a.ts\n</sks_patch>').ok, true);
  assert.equal(evaluateGlmSpeedGate('not a patch').ok, false);
  assert.equal(evaluateGlmSpeedGate('<sks_patch>\ndiff --git a/.github/workflows/a.yml b/.github/workflows/a.yml\n</sks_patch>').ok, false);
});
