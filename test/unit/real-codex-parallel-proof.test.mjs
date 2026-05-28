import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeRealCodexParallelProof } from '../../dist/core/agents/real-codex-parallel-proof.js';

test('real Codex parallel proof counts child overlap and model-authored patches', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-real-proof-'));
  const dirs = ['sessions/slot-001/gen-1/worker', 'sessions/slot-002/gen-1/worker'];
  for (const [index, dir] of dirs.entries()) {
    await fs.mkdir(path.join(root, dir), { recursive: true });
    await fs.writeFile(path.join(root, dir, 'worker-backend-router-report.json'), JSON.stringify({ child_process_ids: [8000 + index], worker_process_id: 7000 + index, patch_envelope_count: 1, model_authored_patch_envelopes: true, fixture_patch_envelopes: false }, null, 2));
    await fs.writeFile(path.join(root, dir, 'codex-worker-process-report.json'), JSON.stringify({ codex_child_pid: 8000 + index, codex_child_started_at: '2026-01-01T00:00:00.000Z', codex_child_finished_at: '2026-01-01T00:00:05.000Z', output_last_message_path: `${dir}/codex-output-last-message.json`, fast_mode: true, synthetic_stdout_fallback: false }, null, 2));
  }
  await fs.writeFile(path.join(root, 'agent-native-cli-session-swarm.json'), JSON.stringify({ requested_agents: 2, process_ids: [7000, 7001], worker_artifact_dirs: dirs }, null, 2));
  const proof = await writeRealCodexParallelProof(root, { requestedWorkers: 2, required: true });
  assert.equal(proof.ok, true);
  assert.equal(proof.max_observed_codex_child_process_overlap, 2);
  assert.equal(proof.model_authored_patch_envelope_count, 2);
});
