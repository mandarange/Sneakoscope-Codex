import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeRealCodexParallelProof } from '../../dist/core/agents/real-codex-parallel-proof.js';

test('real Codex parallel proof counts SDK threads and model-authored patches', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-real-proof-'));
  const dirs = ['sessions/slot-001/gen-1/worker', 'sessions/slot-002/gen-1/worker'];
  for (const [index, dir] of dirs.entries()) {
    await fs.mkdir(path.join(root, dir), { recursive: true });
    await fs.writeFile(path.join(root, dir, 'worker-backend-router-report.json'), JSON.stringify({ selected_backend: 'codex-sdk', sdk_thread_id: `sdk-thread-${index}`, stream_event_count: 4, structured_output_valid: true, worker_process_id: 7000 + index, patch_envelope_count: 1, model_authored_patch_envelopes: true, fixture_patch_envelopes: false }, null, 2));
    await fs.writeFile(path.join(root, dir, 'codex-control-proof.json'), JSON.stringify({ backend: 'codex-sdk', sdk_thread_id: `sdk-thread-${index}`, stream_event_count: 4, structured_output_valid: true, output_schema_id: 'sks.agent-worker-result.v1' }, null, 2));
  }
  await fs.writeFile(path.join(root, 'agent-native-cli-session-swarm.json'), JSON.stringify({ requested_agents: 2, process_ids: [7000, 7001], worker_artifact_dirs: dirs }, null, 2));
  const proof = await writeRealCodexParallelProof(root, { requestedWorkers: 2, required: true });
  assert.equal(proof.ok, true);
  assert.equal(proof.sdk_thread_count, 2);
  assert.equal(proof.max_observed_codex_sdk_parallelism, 2);
  assert.equal(proof.model_authored_patch_envelope_count, 2);
});
