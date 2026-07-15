import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runNativeCliWorker } from '../../dist/core/agents/native-cli-worker.js';

test('native CLI worker patch envelope carries process, session, and Fast mode metadata', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-native-worker-envelope-'));
  const oldDisable = process.env.SKS_DISABLE_ROUTE_RECURSION;
  const oldWorker = process.env.SKS_AGENT_WORKER;
  process.env.SKS_DISABLE_ROUTE_RECURSION = '1';
  process.env.SKS_AGENT_WORKER = '1';
  try {
    const result = await runNativeCliWorker({
      intakeJson: {
        mission_id: 'mission-envelope',
        parent_mission_id: 'mission-envelope',
        backend: 'fake',
        agent_root: root,
        agent: {
          id: 'agent_1',
          session_id: 'native-session-1',
          slot_id: 'slot-1',
          generation_index: 1,
          persona_id: 'implementer'
        },
        slice: {
          id: 'write-1',
          write_paths: ['docs/native-worker-session.md'],
          lease_id: 'lease-1'
        },
        worker_artifact_dir: 'sessions/slot-1/gen-1/worker',
        result_path: 'sessions/slot-1/gen-1/worker/worker-result.json',
        heartbeat_path: 'sessions/slot-1/gen-1/worker/worker-heartbeat.jsonl',
        patch_envelope_path: 'sessions/slot-1/gen-1/worker/worker-patch-envelope.json',
        fast_mode: true,
        service_tier: 'fast'
      }
    });
    assert.equal(result.status, 'done');
    assert.equal(result.patch_envelopes?.length, 1);
    const envelope = result.patch_envelopes[0];
    assert.equal(envelope.native_cli_worker_session_id, 'native-session-1');
    assert.equal(Number.isInteger(envelope.native_cli_process_id), true);
    assert.equal(envelope.fast_mode, true);
    assert.equal(envelope.service_tier, 'fast');
    assert.equal(envelope.operations[0].path, 'docs/native-worker-session.md');
  } finally {
    if (oldDisable === undefined) delete process.env.SKS_DISABLE_ROUTE_RECURSION;
    else process.env.SKS_DISABLE_ROUTE_RECURSION = oldDisable;
    if (oldWorker === undefined) delete process.env.SKS_AGENT_WORKER;
    else process.env.SKS_AGENT_WORKER = oldWorker;
  }
});
