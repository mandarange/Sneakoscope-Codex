import test from 'node:test';
import assert from 'node:assert/strict';
import { runNativeCliSwarmCheck } from '../../dist/scripts/lib/native-cli-session-swarm-check-lib.js';

test('native CLI session swarm creates at least 10 worker processes', () => {
  const report = runNativeCliSwarmCheck({
    agents: 10,
    workItems: 10,
    reportName: 'test-native-cli-session-swarm-10.json'
  });
  assert.equal(report.ok, true);
  assert.equal(report.native_cli_session_proof.max_observed_worker_process_count >= 10, true);
});
