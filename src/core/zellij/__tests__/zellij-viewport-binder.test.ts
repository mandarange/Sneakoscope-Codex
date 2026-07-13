import assert from 'node:assert/strict'
import { bindViewports, type ViewportPin } from '../zellij-viewport-binder.js'
import type { ZellijSlotTelemetrySnapshot } from '../zellij-slot-telemetry.js'

const now = Date.now()

function ts(ageMs: number): string {
  return new Date(now - ageMs).toISOString()
}

function snapshot(rows: Array<[string, string, number]>): ZellijSlotTelemetrySnapshot {
  const slots: ZellijSlotTelemetrySnapshot['slots'] = {}
  for (const [key, status, ageMs] of rows) {
    const [slotId, gen = '1'] = key.split(':g')
    slots[key] = {
      slot_id: slotId || key,
      generation_index: Number(gen) || 1,
      worker_id: key,
      status,
      role: 'worker',
      backend: 'fixture',
      provider: 'fixture',
      service_tier: 'fast',
      model: 'gpt-fixture',
      reasoning_effort: 'max',
      worktree_id: null,
      worktree_path: null,
      task_title: key,
      current_file: null,
      latest_event_type: 'heartbeat',
      latest_ts: ts(ageMs),
      started_at: ts(ageMs + 1000),
      progress: null,
      artifact_paths: [],
      blockers: [],
      log_tail: '',
      spawned_at: ts(ageMs + 1000)
    }
  }
  return {
    schema: 'sks.zellij-slot-telemetry-snapshot.v1',
    mission_id: 'M-test',
    updated_at: ts(0),
    slots,
    counts: { queued: 0, running: 0, verifying: 0, completed: 0, failed: 0, headless: 0 }
  }
}

const pinned: ViewportPin[] = [{ viewport: 2, slot_key: 'slot-003:g1' }]
assert.deepEqual(bindViewports({
  snapshot: snapshot([['slot-001:g1', 'running', 1000], ['slot-003:g1', 'completed', 60_000]]),
  pins: pinned,
  previous: [],
  viewportCount: 2
})[1], { slotKey: 'slot-003:g1', reason: 'pinned' })

assert.deepEqual(bindViewports({
  snapshot: snapshot([['slot-001:g1', 'running', 50], ['slot-002:g1', 'running', 1000]]),
  pins: [],
  previous: ['slot-002:g1'],
  viewportCount: 1
})[0], { slotKey: 'slot-002:g1', reason: 'kept' })

assert.deepEqual(bindViewports({
  snapshot: snapshot([['slot-001:g1', 'completed', 50], ['slot-002:g1', 'running', 1000]]),
  pins: [],
  previous: ['slot-001:g1'],
  viewportCount: 1
})[0], { slotKey: 'slot-002:g1', reason: 'assigned' })

assert.deepEqual(bindViewports({
  snapshot: snapshot([['slot-001:g1', 'running', 50]]),
  pins: [],
  previous: [],
  viewportCount: 3
}).map((row) => row.reason), ['assigned', 'idle', 'idle'])

assert.deepEqual(bindViewports({
  snapshot: snapshot([['slot-001:g1', 'running', 50], ['slot-002:g1', 'failed', 1000]]),
  pins: [],
  previous: [],
  viewportCount: 1
})[0], { slotKey: 'slot-002:g1', reason: 'assigned' })
