import test from 'node:test';
import assert from 'node:assert/strict';
import { runNativeCliSwarmCheck } from '../../dist/scripts/lib/native-cli-session-swarm-check-lib.js';

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
});
