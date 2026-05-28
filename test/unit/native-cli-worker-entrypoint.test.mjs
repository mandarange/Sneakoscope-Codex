import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runNativeCliWorker } from '../../dist/core/agents/native-cli-worker.js';

test('native CLI worker entrypoint writes required session artifacts and exits done', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-native-worker-'));
  const oldDisable = process.env.SKS_DISABLE_ROUTE_RECURSION;
  const oldWorker = process.env.SKS_AGENT_WORKER;
  const oldFast = process.env.SKS_FAST_MODE;
  const oldTier = process.env.SKS_SERVICE_TIER;
  process.env.SKS_DISABLE_ROUTE_RECURSION = '1';
  process.env.SKS_AGENT_WORKER = '1';
  process.env.SKS_FAST_MODE = '1';
  process.env.SKS_SERVICE_TIER = 'fast';
  try {
    const result = await runNativeCliWorker({
      intakeJson: {
        mission_id: 'mission-test',
        parent_mission_id: 'mission-test',
        backend: 'fake',
        agent_root: root,
        agent: {
          id: 'agent_1',
          session_id: 'session-1',
          slot_id: 'slot-1',
          generation_index: 1,
          persona_id: 'executor'
        },
        slice: {
          id: 'work-1',
          write_paths: ['README.md'],
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
    const workerDir = path.join(root, 'sessions', 'slot-1', 'gen-1', 'worker');
    for (const file of [
      'worker-intake.json',
      'worker-heartbeat.jsonl',
      'worker-process-report.json',
      'worker-result.json',
      'worker-patch-envelope.json',
      'worker-terminal-close-report.json',
      'worker-fast-mode.json',
      'worker-recursion-guard.json',
      'worker-session-proof.json'
    ]) {
      await fs.access(path.join(workerDir, file));
    }
    const report = JSON.parse(await fs.readFile(path.join(workerDir, 'worker-process-report.json'), 'utf8'));
    assert.equal(report.fast_mode, true);
    assert.equal(report.service_tier, 'fast');
    assert.equal(report.exit_code, 0);
  } finally {
    restoreEnv('SKS_DISABLE_ROUTE_RECURSION', oldDisable);
    restoreEnv('SKS_AGENT_WORKER', oldWorker);
    restoreEnv('SKS_FAST_MODE', oldFast);
    restoreEnv('SKS_SERVICE_TIER', oldTier);
  }
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
