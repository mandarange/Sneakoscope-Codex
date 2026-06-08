#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { appendZellijSlotTelemetry, readZellijSlotTelemetrySnapshot } from '../core/zellij/zellij-slot-telemetry.js'
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'
const src = readText('src/core/zellij/zellij-slot-telemetry.ts')
assertGate(src.includes('applyTelemetryEventToSnapshot') && src.includes('readZellijSlotTelemetrySnapshotNoRebuild'), 'incremental telemetry helpers missing')
const missionId = 'M-zellij-incremental'
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-zellij-incremental-'))
await appendZellijSlotTelemetry(root, { schema: 'sks.zellij-slot-telemetry-event.v1', ts: new Date().toISOString(), mission_id: missionId, slot_id: 'slot-001', generation_index: 1, worker_id: 'w1', event_type: 'slot_reserved', status: 'queued' })
await appendZellijSlotTelemetry(root, { schema: 'sks.zellij-slot-telemetry-event.v1', ts: new Date().toISOString(), mission_id: missionId, slot_id: 'slot-001', generation_index: 1, worker_id: 'w1', event_type: 'worker_completed', status: 'completed' })
const snapshot = await readZellijSlotTelemetrySnapshot(root, missionId)
assertGate(snapshot.counts.completed === 1 && Object.keys(snapshot.slots).length === 1, 'incremental snapshot merge failed', snapshot)
emitGate('zellij:slot-telemetry-incremental', snapshot.counts)
