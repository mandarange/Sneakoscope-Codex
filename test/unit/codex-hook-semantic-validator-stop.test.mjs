import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCodexHookSemanticOutput } from '../../dist/core/codex-compat/codex-hook-semantic-validator.js';

test('Stop semantic validator accepts canonical continue and block outputs', () => {
  assert.equal(validateCodexHookSemanticOutput('Stop', { continue: true }).ok, true);
  assert.equal(validateCodexHookSemanticOutput('Stop', {
    continue: true,
    decision: 'block',
    reason: 'completion proof missing'
  }).ok, true);
});

test('Stop semantic validator rejects continue false, stopReason, and missing block reason', () => {
  for (const output of [
    { continue: false, decision: 'block', reason: 'blocked' },
    { continue: true, stopReason: 'stop' },
    { continue: true, decision: 'block' }
  ]) {
    const result = validateCodexHookSemanticOutput('Stop', output);
    assert.equal(result.ok, false);
    assert.ok(result.fatal.length > 0);
  }
});
