import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeNativeCliSessionProof } from '../../dist/core/agents/native-cli-session-proof.js';

test('native CLI session proof accepts 10 native worker process artifacts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-native-proof-'));
  const records = [];
  for (let i = 1; i <= 10; i += 1) {
    const workerDir = path.join(root, 'sessions', `slot-${i}`, 'gen-1', 'worker');
    await fs.mkdir(workerDir, { recursive: true });
    await fs.writeFile(path.join(workerDir, 'worker-process-report.json'), JSON.stringify({ ok: true, pid: 1000 + i, exit_code: 0 }, null, 2));
    await fs.writeFile(path.join(workerDir, 'worker-terminal-close-report.json'), JSON.stringify({ ok: true, exit_code: 0 }, null, 2));
    await fs.writeFile(path.join(workerDir, 'worker-heartbeat.jsonl'), `${JSON.stringify({ event: 'started' })}\n${JSON.stringify({ event: 'finished' })}\n`);
    records.push({
      status: 'closed',
      pid: 1000 + i,
      session_id: `session-${i}`,
      slot_id: `slot-${i}`,
      generation_index: 1,
      command_line: ['node', 'dist/bin/sks.js', '--agent', 'worker'],
      worker_artifact_dir: path.relative(root, workerDir)
    });
  }
  await fs.writeFile(path.join(root, 'agent-native-cli-session-swarm.json'), JSON.stringify({
    scaling_primitive: 'native_cli_process',
    requested_agents: 10,
    target_active_slots: 10,
    spawned_worker_process_count: 10,
    closed_worker_process_count: 10,
    max_observed_worker_process_count: 10,
    unique_worker_session_count: 10,
    unique_slot_count: 10,
    unique_generation_count: 10,
    process_ids: records.map((row) => row.pid),
    worker_command_lines: records.map((row) => row.command_line),
    worker_artifact_dirs: records.map((row) => row.worker_artifact_dir),
    records
  }, null, 2));
  await fs.writeFile(path.join(root, 'agent-scheduler-state.json'), JSON.stringify({ total_work_items: 10 }, null, 2));

  const proof = await writeNativeCliSessionProof(root, { requestedAgents: 10, targetActiveSlots: 10, totalWorkItems: 10 });
  assert.equal(proof.ok, true);
  assert.equal(proof.max_observed_worker_process_count, 10);
  assert.equal(proof.close_report_count, 10);
  assert.equal(Object.keys(proof.heartbeat_count_by_worker).length, 10);
});

test('native CLI session proof blocks 10-agent proof below requested native process count', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-native-proof-block-'));
  await fs.writeFile(path.join(root, 'agent-native-cli-session-swarm.json'), JSON.stringify({
    scaling_primitive: 'native_cli_process',
    requested_agents: 10,
    target_active_slots: 10,
    spawned_worker_process_count: 5,
    closed_worker_process_count: 5,
    max_observed_worker_process_count: 5,
    unique_worker_session_count: 5,
    unique_slot_count: 5,
    unique_generation_count: 5,
    process_ids: [1, 2, 3, 4, 5],
    worker_command_lines: []
  }, null, 2));
  await fs.writeFile(path.join(root, 'agent-scheduler-state.json'), JSON.stringify({ total_work_items: 10 }, null, 2));
  const proof = await writeNativeCliSessionProof(root, { requestedAgents: 10, targetActiveSlots: 10, totalWorkItems: 10 });
  assert.equal(proof.ok, false);
  assert.ok(proof.blockers.includes('native_worker_process_count_below_requested:10'));
});
