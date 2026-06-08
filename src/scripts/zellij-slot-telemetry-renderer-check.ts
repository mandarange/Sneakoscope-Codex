#!/usr/bin/env node
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'

const pane = readText('src/core/zellij/zellij-slot-pane-renderer.ts')
const anchor = readText('src/core/zellij/zellij-slot-column-anchor.ts')
assertGate(pane.includes('readZellijSlotTelemetrySnapshot') && pane.includes('waiting for telemetry'), 'slot pane must render from telemetry snapshot with waiting fallback')
assertGate(anchor.includes('readZellijSlotTelemetrySnapshot') && anchor.includes('SLOTS telemetry stale'), 'slot anchor must render telemetry snapshot and stale state')
assertGate(anchor.includes('update-notice.json') && anchor.includes('MAD-DB ACTIVE'), 'anchor must surface update notice and Mad-DB state')
emitGate('zellij:slot-telemetry-renderer', { snapshot_first: true })
