import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGateProcessOutput, parseGateResultFromStdout } from '../gate-result-contract.js';

test('gate result contract fails exit 0 with ok false', () => {
  const evaluation = evaluateGateProcessOutput({
    status: 0,
    stdout: [
      'human readable gate output',
      JSON.stringify({ schema: 'sks.gate-result.v1', ok: false, blockers: ['fixture_blocker'] })
    ].join('\n')
  });

  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.contract, 'sks.gate-result.v1');
  assert.equal(evaluation.reason, 'gate_result_not_ok');
  assert.deepEqual(evaluation.gate_result?.blockers, ['fixture_blocker']);
});

test('required gate result contract rejects invalid final JSON', () => {
  const evaluation = evaluateGateProcessOutput({
    status: 0,
    stdout: 'not json',
    requiresContract: true
  });

  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.contract, 'sks.gate-result.v1');
  assert.equal(evaluation.reason, 'gate_output_contract_violation');
  assert.equal(evaluation.gate_result, null);
});

test('legacy output is explicit when no gate contract is required', () => {
  const evaluation = evaluateGateProcessOutput({
    status: 0,
    stdout: 'legacy success'
  });

  assert.equal(evaluation.ok, true);
  assert.equal(evaluation.contract, 'legacy_exit_code_only');
  assert.equal(evaluation.reason, 'legacy_exit_code_only');
});

test('gate result parser reads the last stdout line only', () => {
  const parsed = parseGateResultFromStdout([
    JSON.stringify({ schema: 'sks.gate-result.v1', ok: true, blockers: [] }),
    JSON.stringify({ schema: 'sks.gate-result.v1', ok: false, blockers: ['last_line_wins'] })
  ].join('\n'));

  assert.equal(parsed?.ok, false);
  assert.deepEqual(parsed?.blockers, ['last_line_wins']);
});
