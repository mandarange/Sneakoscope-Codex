import test from 'node:test'
import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { withFileLock } from '../../locks/file-lock.js'
import {
  appendZellijSlotTelemetry,
  ZELLIJ_SLOT_TELEMETRY_LOCK_TIMEOUT_MS
} from '../zellij-slot-telemetry.js'

test('Zellij slot telemetry lock budget stays short enough for official-subagent hot path', () => {
  assert.ok(ZELLIJ_SLOT_TELEMETRY_LOCK_TIMEOUT_MS <= 2_500)
  assert.ok(ZELLIJ_SLOT_TELEMETRY_LOCK_TIMEOUT_MS >= 250)
})

test('appendZellijSlotTelemetry fails fast when the append lock is held', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-zellij-telemetry-lock-'))
  const missionId = 'M-telemetry-lock'
  const events = path.join(root, '.sneakoscope', 'missions', missionId, 'zellij', 'slot-telemetry.events.jsonl')
  await fsp.mkdir(path.dirname(events), { recursive: true })

  let releaseHolder: (() => void) | undefined
  const held = new Promise<void>((resolve) => {
    releaseHolder = resolve
  })
  const holder = withFileLock({
    lockPath: `${events}.append.lock`,
    timeoutMs: 5_000,
    staleMs: 60_000
  }, async () => {
    await held
  })

  const started = Date.now()
  await assert.rejects(
    () => appendZellijSlotTelemetry(root, {
      schema: 'sks.zellij-slot-telemetry-event.v1',
      ts: new Date().toISOString(),
      mission_id: missionId,
      slot_id: 'slot-official-thread-a',
      generation_index: 1,
      worker_id: 'thread-a',
      event_type: 'worker_spawned',
      status: 'running',
      backend: 'official-codex-subagent'
    }),
    /file_lock_timeout/
  )
  const elapsed = Date.now() - started
  assert.ok(releaseHolder, 'lock holder release callback missing')
  releaseHolder()
  await holder
  await fsp.rm(root, { recursive: true, force: true })

  assert.ok(
    elapsed < ZELLIJ_SLOT_TELEMETRY_LOCK_TIMEOUT_MS + 1_500,
    `telemetry lock wait too long: ${elapsed}ms`
  )
})
