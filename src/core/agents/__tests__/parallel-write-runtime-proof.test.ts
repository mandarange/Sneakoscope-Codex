import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import {
  appendParallelRuntimeEvent,
  buildParallelRuntimeProof,
  parallelRuntimeEventPath,
} from '../parallel-runtime-proof.js';

test('parallel runtime proof v2 requires worker diversity, changed files, and timestamp overlap', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-parallel-proof-'));
  const missionId = 'M-parallel-proof';

  await appendParallelRuntimeEvent(root, missionId, {
    event_type: 'worker_launch_invoked',
    slot_id: 'clone-001',
    generation_index: 1,
    session_id: 'clone-001-gen-1',
    pid: 111,
    backend: 'process',
    placement: 'process',
    meta: { work_item_id: 'NW-000001' },
  });
  await appendParallelRuntimeEvent(root, missionId, {
    event_type: 'worker_launch_invoked',
    slot_id: 'clone-002',
    generation_index: 1,
    session_id: 'clone-002-gen-1',
    pid: 222,
    backend: 'process',
    placement: 'process',
    meta: { work_item_id: 'NW-000002' },
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await appendParallelRuntimeEvent(root, missionId, {
    event_type: 'worker_completed',
    slot_id: 'clone-001',
    generation_index: 1,
    session_id: 'clone-001-gen-1',
    pid: 111,
    backend: 'process',
    placement: 'process',
    meta: { work_item_id: 'NW-000001', changed_files: ['src/a.ts'] },
  });
  await appendParallelRuntimeEvent(root, missionId, {
    event_type: 'worker_completed',
    slot_id: 'clone-002',
    generation_index: 1,
    session_id: 'clone-002-gen-1',
    pid: 222,
    backend: 'process',
    placement: 'process',
    meta: { work_item_id: 'NW-000002', changed_files: ['src/b.ts'] },
  });

  const proof: any = await buildParallelRuntimeProof(root, missionId, {
    requestedWorkers: 3,
    targetActiveSlots: 2,
    proofMode: 'production',
    requireWorkerPids: false,
  });

  assert.equal(proof.schema, 'sks.parallel-runtime-proof.v2');
  assert.equal(proof.production_runtime, true);
  assert.equal(proof.mock_only, false);
  assert.equal(proof.observed_worker_count, 2);
  assert.deepEqual(proof.changed_files_by_worker['clone-001'], ['src/a.ts']);
  assert.deepEqual(proof.changed_files_by_worker['clone-002'], ['src/b.ts']);
  assert.equal(proof.changed_file_count, 2);
  assert.ok(proof.overlap_windows.some((window: any) => window.worker_a === 'clone-001' && window.worker_b === 'clone-002' && window.overlap_ms > 0));
  assert.equal(proof.ok, true);
});

test('parallel runtime proof does not invent overlap at worker handoff boundary', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-parallel-proof-boundary-'));
  const missionId = 'M-parallel-proof-boundary';
  const file = parallelRuntimeEventPath(root, missionId);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const base = Date.UTC(2026, 0, 1);
  const rows = [
    eventRow(missionId, base, 'worker_launch_invoked', 'clone-001', {}),
    eventRow(missionId, base + 100, 'worker_completed', 'clone-001', { changed_files: ['src/a.ts'] }),
    eventRow(missionId, base + 100, 'worker_launch_invoked', 'clone-002', {}),
    eventRow(missionId, base + 200, 'worker_completed', 'clone-002', { changed_files: ['src/b.ts'] }),
  ];
  await fsp.writeFile(file, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);

  const proof: any = await buildParallelRuntimeProof(root, missionId, {
    requestedWorkers: 2,
    targetActiveSlots: 2,
    proofMode: 'production',
    requireWorkerPids: false,
    requireChangedFiles: true,
    minChangedFiles: 2,
  });

  assert.equal(proof.overlap_windows.some((window: any) => window.worker_a === 'clone-001' && window.worker_b === 'clone-002'), false);
  assert.ok(proof.blockers.includes('worker_timestamp_overlap_missing'));
  assert.equal(proof.ok, false);
});

function eventRow(missionId: string, ms: number, eventType: string, workerId: string, meta: Record<string, unknown>) {
  return {
    schema: 'sks.parallel-runtime-event.v1',
    ts: new Date(ms).toISOString(),
    ms,
    mission_id: missionId,
    event_type: eventType,
    slot_id: workerId,
    generation_index: 1,
    session_id: `${workerId}-gen-1`,
    pid: workerId === 'clone-001' ? 111 : 222,
    backend: 'process',
    placement: 'process',
    meta,
  };
}
