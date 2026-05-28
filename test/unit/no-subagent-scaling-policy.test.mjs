import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeNoSubagentScalingPolicy } from '../../dist/core/agents/no-subagent-scaling-policy.js';

test('no-subagent scaling policy counts native processes, not subagent events', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-no-subagent-'));
  await fs.writeFile(path.join(root, 'agent-native-cli-session-swarm.json'), JSON.stringify({
    scaling_primitive: 'native_cli_process',
    spawned_worker_process_count: 3
  }, null, 2));
  await fs.writeFile(path.join(root, 'native-cli-session-proof.json'), JSON.stringify({
    spawned_worker_process_count: 3,
    worker_proof_is_only_subagent_events: false
  }, null, 2));
  await fs.writeFile(path.join(root, 'agent-events.jsonl'), '{"event":"SubagentStart"}\n{"event":"SubagentStop"}\n');
  const report = await writeNoSubagentScalingPolicy(root);
  assert.equal(report.ok, true);
  assert.equal(report.native_worker_process_count, 3);
  assert.equal(report.subagent_event_count, 2);
  assert.equal(report.subagent_events_counted_as_worker_sessions, false);
});

test('no-subagent scaling policy blocks when native process proof is missing', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-no-subagent-block-'));
  await fs.writeFile(path.join(root, 'agent-native-cli-session-swarm.json'), JSON.stringify({
    scaling_primitive: 'subagent'
  }, null, 2));
  const report = await writeNoSubagentScalingPolicy(root);
  assert.equal(report.ok, false);
  assert.ok(report.blockers.includes('main_scaling_primitive_not_native_cli_process'));
  assert.ok(report.blockers.includes('native_cli_worker_process_proof_missing'));
});
