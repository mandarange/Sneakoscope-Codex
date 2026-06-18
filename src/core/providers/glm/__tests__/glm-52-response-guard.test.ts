import test from 'node:test';
import assert from 'node:assert/strict';
import { assertGlm52ActualModel } from '../glm-52-response-guard.js';

test('GLM response guard accepts canonical and dated variants', () => {
  assert.equal(assertGlm52ActualModel('z-ai/glm-5.2').ok, true);
  assert.equal(assertGlm52ActualModel('z-ai/glm-5.2-20260616').ok, true);
});

test('GLM response guard rejects GPT, empty, and unknown models', () => {
  assert.equal(assertGlm52ActualModel('openai/gpt-5.2').code, 'glm_model_mismatch');
  assert.equal(assertGlm52ActualModel('other/glm-5.2-proxy').code, 'glm_model_mismatch');
  assert.equal(assertGlm52ActualModel(undefined).code, 'glm_model_missing');
  assert.equal(assertGlm52ActualModel('anthropic/claude-fable-5').code, 'glm_model_mismatch');
});
