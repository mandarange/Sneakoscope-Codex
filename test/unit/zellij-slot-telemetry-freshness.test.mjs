import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  appendZellijSlotTelemetry,
  mergeTelemetrySnapshots,
  readZellijSlotTelemetrySnapshot,
  slotTelemetrySnapshotPath
} from '../../dist/core/zellij/zellij-slot-telemetry.js'

function event(missionId, slotId, eventType, status, overrides = {}) {
  return {
    schema: 'sks.zellij-slot-telemetry-event.v1',
    ts: new Date().toISOString(),
    mission_id: missionId,
    slot_id: slotId,
    generation_index: 1,
    worker_id: slotId,
    event_type: eventType,
    status,
    task_title: 'freshness fixture',
    current_file: null,
    worktree_id: null,
    worktree_path: null,
    ...overrides
  }
}

test('reader observes snapshot flushes written by other processes (no frozen cache)', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-telemetry-freshness-'))
  const missionId = 'M-freshness'
  await appendZellijSlotTelemetry(root, event(missionId, 'slot-001', 'task_started', 'running'))
  const first = await readZellijSlotTelemetrySnapshot(root, missionId)
  assert.equal(first.slots['slot-001:g1'].status, 'running')

  // Simulate ANOTHER process flushing the snapshot file directly: the watch
  // renderer process must pick this up instead of serving its in-memory cache.
  const snapshotPath = slotTelemetrySnapshotPath(root, missionId)
  const disk = JSON.parse(await fs.readFile(snapshotPath, 'utf8'))
  disk.slots['slot-001:g1'].status = 'completed'
  disk.slots['slot-001:g1'].latest_event_type = 'worker_completed'
  disk.slots['slot-001:g1'].latest_ts = new Date(Date.now() + 5000).toISOString()
  disk.updated_at = new Date(Date.now() + 5000).toISOString()
  await new Promise((resolve) => setTimeout(resolve, 20))
  await fs.writeFile(snapshotPath, `${JSON.stringify(disk)}\n`, 'utf8')

  const second = await readZellijSlotTelemetrySnapshot(root, missionId)
  assert.equal(second.slots['slot-001:g1'].status, 'completed', 'reader must observe external snapshot writes')
})

test('flush merges with on-disk snapshot instead of clobbering other slots', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-telemetry-merge-'))
  const missionId = 'M-merge'
  await appendZellijSlotTelemetry(root, event(missionId, 'slot-001', 'task_started', 'running'))

  // Another process adds slot-002 directly on disk.
  const snapshotPath = slotTelemetrySnapshotPath(root, missionId)
  const disk = JSON.parse(await fs.readFile(snapshotPath, 'utf8'))
  disk.slots['slot-002:g1'] = {
    ...disk.slots['slot-001:g1'],
    slot_id: 'slot-002',
    worker_id: 'slot-002',
    latest_ts: new Date(Date.now() + 1000).toISOString()
  }
  await new Promise((resolve) => setTimeout(resolve, 20))
  await fs.writeFile(snapshotPath, `${JSON.stringify(disk)}\n`, 'utf8')

  // This process appends an important event (forces flush). slot-002 must survive.
  await appendZellijSlotTelemetry(root, event(missionId, 'slot-001', 'worker_completed', 'completed'))
  const merged = JSON.parse(await fs.readFile(snapshotPath, 'utf8'))
  assert.ok(merged.slots['slot-002:g1'], 'flush must not drop slots observed only by other processes')
  assert.equal(merged.slots['slot-001:g1'].status, 'completed')
})

test('mergeTelemetrySnapshots keeps the newer slot row per latest_ts', () => {
  const older = { schema: 'sks.zellij-slot-telemetry-snapshot.v1', mission_id: 'M', updated_at: '2026-01-01T00:00:00.000Z', flush_count: 1, slots: { 'a:g1': { slot_id: 'a', generation_index: 1, worker_id: 'a', status: 'running', role: 'w', backend: 'b', provider: 'p', service_tier: 's', worktree_id: null, worktree_path: null, task_title: 't', current_file: null, latest_event_type: 'task_started', latest_ts: '2026-01-01T00:00:00.000Z', progress: null, artifact_paths: [], blockers: [], log_tail: '' } }, counts: { queued: 0, running: 1, verifying: 0, completed: 0, failed: 0, headless: 0 } }
  const newer = JSON.parse(JSON.stringify(older))
  newer.slots['a:g1'].status = 'completed'
  newer.slots['a:g1'].latest_ts = '2026-01-01T00:01:00.000Z'
  const merged = mergeTelemetrySnapshots(older, newer)
  assert.equal(merged.slots['a:g1'].status, 'completed')
  const mergedReverse = mergeTelemetrySnapshots(newer, older)
  assert.equal(mergedReverse.slots['a:g1'].status, 'completed')
})
