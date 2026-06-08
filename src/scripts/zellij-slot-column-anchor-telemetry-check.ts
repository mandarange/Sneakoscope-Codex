#!/usr/bin/env node
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'

const anchor = readText('src/core/zellij/zellij-slot-column-anchor.ts')

assertGate(anchor.includes('readZellijSlotTelemetrySnapshot'), 'slot column anchor must read aggregate telemetry snapshots')
assertGate(anchor.includes('snapshot.counts') && anchor.includes('counts.running'), 'slot column anchor must show aggregate status counts')
assertGate(anchor.includes('SLOTS telemetry stale'), 'slot column anchor must mark stale telemetry')
assertGate(anchor.includes('update-notice.json') && anchor.includes('MAD-DB ACTIVE'), 'slot column anchor must include update notice and Mad-DB state')
emitGate('zellij:slot-column-anchor-telemetry', { aggregate_snapshot: true })
