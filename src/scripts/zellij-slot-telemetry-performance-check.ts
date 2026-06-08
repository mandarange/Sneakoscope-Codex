#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { appendZellijSlotTelemetry, readZellijSlotTelemetrySnapshot } from '../core/zellij/zellij-slot-telemetry.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'
const missionId = 'M-zellij-performance'
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-zellij-perf-'))
const started = Date.now()
for (let i = 0; i < 5000; i++) await appendZellijSlotTelemetry(root, { schema: 'sks.zellij-slot-telemetry-event.v1', ts: new Date().toISOString(), mission_id: missionId, slot_id: `slot-${String(i % 100).padStart(3, '0')}`, generation_index: Math.floor(i / 100) + 1, worker_id: `w${i}`, event_type: 'heartbeat', status: 'running' })
const wallMs = Date.now() - started
const snapshot = await readZellijSlotTelemetrySnapshot(root, missionId)
assertGate(wallMs < 15000, '5000 telemetry appends exceeded performance threshold', { wallMs, counts: snapshot.counts })
assertGate(Object.keys(snapshot.slots).length === 5000, 'snapshot slot count mismatch', { wallMs, slot_count: Object.keys(snapshot.slots).length })
emitGate('zellij:slot-telemetry-performance', { wall_ms: wallMs, slot_count: Object.keys(snapshot.slots).length })
