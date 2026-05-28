import test from 'node:test';
import assert from 'node:assert/strict';
import { runNativeCliSwarmCheck } from '../../scripts/lib/native-cli-session-swarm-check-lib.mjs';

test('native CLI session swarm creates at least 20 worker processes', () => {
  const report = runNativeCliSwarmCheck({
    agents: 20,
    workItems: 20,
    reportName: 'test-native-cli-session-swarm-20.json'
  });
  assert.equal(report.ok, true);
  assert.equal(report.native_cli_session_proof.max_observed_worker_process_count >= 20, true);
});
