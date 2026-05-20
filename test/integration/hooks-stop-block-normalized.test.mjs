import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStopBlock } from '../../dist/core/codex-compat/codex-hook-output-builders.js';
import { validateCodexHookSemanticOutput } from '../../dist/core/codex-compat/codex-hook-semantic-validator.js';

test('Stop block builder uses canonical continue true shape', () => {
  const output = buildStopBlock('completion proof missing');
  assert.deepEqual(output, {
    continue: true,
    decision: 'block',
    reason: 'completion proof missing'
  });
  assert.equal(validateCodexHookSemanticOutput('Stop', output).ok, true);
});
