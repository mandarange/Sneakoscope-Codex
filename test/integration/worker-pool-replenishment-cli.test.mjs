import test from 'node:test';
import assert from 'node:assert/strict';
import { runNativeCliSwarmCheck } from '../../dist/scripts/lib/native-cli-session-swarm-check-lib.js';

test('native CLI worker pool backfills work items beyond active slots', () => {
  const report = runNativeCliSwarmCheck({
    agents: 4,
    workItems: 8,
    reportName: 'test-native-cli-worker-replenishment.json',
    extraArgs: ['--target-active-slots', '4']
  });
  assert.equal(report.ok, true);
  assert.equal(report.native_cli_session_proof.spawned_worker_process_count >= 8, true);
  assert.equal(report.native_cli_session_proof.max_observed_worker_process_count >= 4, true);
});
