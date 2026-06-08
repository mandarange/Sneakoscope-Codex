#!/usr/bin/env node
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const batch = await importDist('core/release/release-gate-batch-runner.js')
assertGate(typeof batch.runReleaseGateBatch === 'function', 'release batch runner export missing')
emitGate('release:batch-runner', { export: 'runReleaseGateBatch' })
