import test from 'node:test';
import assert from 'node:assert/strict';
import { runNativeCliSwarmCheck } from '../../scripts/lib/native-cli-session-swarm-check-lib.mjs';

test('native CLI worker processes inherit Fast mode by default', () => {
  const report = runNativeCliSwarmCheck({
    agents: 3,
    workItems: 3,
    reportName: 'test-fast-mode-worker-propagation.json'
  });
  assert.equal(report.fast_mode_propagation.ok, true);
  assert.equal(report.fast_mode_propagation.fast_mode, true);
  assert.equal(report.fast_mode_propagation.service_tier, 'fast');
});
