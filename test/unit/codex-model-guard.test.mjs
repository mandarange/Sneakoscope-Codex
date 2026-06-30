import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUIRED_CODEX_MODEL,
  SUPPORTED_CODEX_MODELS,
  forceGpt55CodexArgs,
  forceGpt55CodexConfigArgs,
  isForbiddenCodexModel
} from '../../dist/core/codex-model-guard.js';

test('codex model guard supports gpt-5.4-mini while keeping gpt-5.5 as the forced default', () => {
  assert.equal(REQUIRED_CODEX_MODEL, 'gpt-5.5');
  assert.deepEqual(SUPPORTED_CODEX_MODELS, ['gpt-5.5', 'gpt-5.4-mini']);
  assert.equal(isForbiddenCodexModel('gpt-5.5'), false);
  assert.equal(isForbiddenCodexModel('gpt-5.4-mini'), false);
  assert.equal(isForbiddenCodexModel('gpt-5.4'), true);
  assert.equal(isForbiddenCodexModel('gpt-5.4 mini'), true);
});

test('codex model guard strips caller model overrides before applying gpt-5.5 defaults', () => {
  assert.deepEqual(forceGpt55CodexArgs(['--model', 'gpt-5.4-mini', 'exec']), ['--model', 'gpt-5.5', 'exec']);
  assert.deepEqual(forceGpt55CodexConfigArgs(['-c', 'model="gpt-5.4-mini"', 'exec']), ['-c', 'model="gpt-5.5"', 'exec']);
});
