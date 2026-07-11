import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectNativeCliSwarmOutput,
  runNativeCliSwarmCheck
} from '../../dist/scripts/lib/native-cli-session-swarm-check-lib.js';

test('native CLI swarm output inspection fails closed for empty and partial JSON', () => {
  assert.deepEqual(inspectNativeCliSwarmOutput(''), {
    ok: false,
    reason: 'empty_stdout',
    output_bytes: 0
  });
  const partial = inspectNativeCliSwarmOutput('{"ok":true');
  assert.equal(partial.ok, false);
  assert.equal(partial.reason, 'invalid_json');
  assert.equal(partial.output_bytes, 10);
  assert.match(partial.parse_error, /JSON|position|end/i);
  assert.match(partial.output_sha256, /^[a-f0-9]{64}$/);
});

test('native CLI swarm output inspection accepts one complete JSON object', () => {
  const inspected = inspectNativeCliSwarmOutput('{"ok":true,"proof":{"status":"pass"}}\n');
  assert.equal(inspected.ok, true);
  assert.deepEqual(inspected.value, { ok: true, proof: { status: 'pass' } });
});

test('native CLI worker processes inherit an explicit Fast mode request', () => {
  const report = runNativeCliSwarmCheck({
    agents: 3,
    workItems: 3,
    reportName: 'test-fast-mode-worker-propagation.json',
    extraArgs: ['--fast'],
    expectedFastMode: true
  });
  assert.equal(report.fast_mode_propagation.ok, true);
  assert.equal(report.fast_mode_propagation.fast_mode, true);
  assert.equal(report.fast_mode_propagation.service_tier, 'fast');
  assert.equal(report.completion_protocol.atomic_output_read, true);
  assert.equal(report.completion_protocol.attempt_count, 1);
});
