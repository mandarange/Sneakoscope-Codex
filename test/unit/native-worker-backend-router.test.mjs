import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runNativeCliWorker } from '../../dist/core/agents/native-cli-worker.js';

test('native worker backend router launches process child and marks generated patch source', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-router-test-'));
  const old = snapshotEnv();
  process.env.SKS_DISABLE_ROUTE_RECURSION = '1';
  process.env.SKS_AGENT_WORKER = '1';
  try {
    const result = await runNativeCliWorker({
      intakeJson: {
        mission_id: 'M-router-test',
        backend: 'process',
        agent_root: root,
        agent: { id: 'agent-router', session_id: 'session-router', slot_id: 'slot-001', generation_index: 1, persona_id: 'executor' },
        slice: { id: 'task-router', write_paths: ['owned.txt'], description: 'process child route' },
        worker_artifact_dir: 'sessions/slot-001/gen-1/worker',
        result_path: 'sessions/slot-001/gen-1/worker/worker-result.json',
        heartbeat_path: 'sessions/slot-001/gen-1/worker/worker-heartbeat.jsonl',
        patch_envelope_path: 'sessions/slot-001/gen-1/worker/worker-patch-envelope.json',
        fast_mode: true,
        service_tier: 'fast'
      }
    });
    assert.equal(result.status, 'done');
    assert.equal(result.backend_router_report.selected_backend, 'process');
    assert.equal(result.patch_envelopes[0].source, 'process_generated');
    assert.equal(typeof result.backend_router_report.child_process_ids[0], 'number');
  } finally {
    restoreEnv(old);
  }
});

function snapshotEnv() {
  return { SKS_DISABLE_ROUTE_RECURSION: process.env.SKS_DISABLE_ROUTE_RECURSION, SKS_AGENT_WORKER: process.env.SKS_AGENT_WORKER };
}

function restoreEnv(old) {
  for (const [key, value] of Object.entries(old)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
