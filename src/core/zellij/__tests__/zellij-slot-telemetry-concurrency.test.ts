import test from 'node:test'
import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  appendZellijSlotTelemetry,
  readZellijSlotTelemetrySnapshot,
  slotTelemetryEventPath
} from '../zellij-slot-telemetry.js'

test('concurrent telemetry writers keep every bounded JSONL event parseable', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-zellij-telemetry-concurrency-'))
  const missionId = 'M-concurrent-telemetry'
  const eventCount = 48
  try {
    await Promise.all(Array.from({ length: eventCount }, async (_, index) => {
      await appendZellijSlotTelemetry(root, {
        schema: 'sks.zellij-slot-telemetry-event.v1',
        ts: new Date(Date.now() + index).toISOString(),
        mission_id: missionId,
        slot_id: `slot-${String(index % 3).padStart(3, '0')}`,
        generation_index: 1,
        worker_id: `thread-${index % 3}`,
        event_type: index === 0 ? 'worker_spawned' : 'task_progress',
        status: 'running',
        task_title: `event ${index}`,
        activity_source: 'fixture',
        activity_hash: `hash-${index}`
      })
    }))
    const text = await fsp.readFile(slotTelemetryEventPath(root, missionId), 'utf8')
    const rows = text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    assert.equal(rows.length, eventCount)
    assert.equal(new Set(rows.map((row) => row.activity_hash)).size, eventCount)
    const snapshot = await readZellijSlotTelemetrySnapshot(root, missionId)
    assert.equal(Object.keys(snapshot.slots).length, 3)
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
})
