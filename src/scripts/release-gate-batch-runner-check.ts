#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const batch = await importDist('core/release/release-gate-batch-runner.js')
assertGate(typeof batch.runReleaseGateBatch === 'function', 'release batch runner export missing')
assertGate(typeof batch.isReleaseGateBatchable === 'function', 'release batchable predicate export missing')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-release-batch-'))
const reportRoot = path.join(root, 'reports')
const base = {
  deps: [],
  resource: ['cpu-light', 'fs-read'],
  side_effect: 'hermetic',
  timeout_ms: 30000,
  cache: { enabled: false, inputs: [] },
  isolation: { home: 'temp', codex_home: 'temp', report_dir: 'per-gate' },
  preset: ['release']
}
const passGate = { ...base, id: 'batch:pass', command: `${process.execPath} -e "process.exit(0)"` }
const failGate = { ...base, id: 'batch:fail', command: `${process.execPath} -e "process.exit(7)"` }
const zellijGate = { ...base, id: 'batch:zellij-real', resource: ['zellij-real'], side_effect: 'real-env', command: `${process.execPath} -e "process.exit(0)"` }

assertGate(batch.isReleaseGateBatchable(passGate) === true, 'hermetic cpu-light fs-read gate must be batchable')
assertGate(batch.isReleaseGateBatchable(zellijGate) === false, 'zellij-real gate must not be batchable')

const result = await batch.runReleaseGateBatch(root, [passGate, failGate], { concurrency: 2, reportRoot })
assertGate(result.ok === false && result.failed === 1, 'one failed child gate must fail the batch', result)
assertGate(result.results.some((row: any) => row.id === 'batch:fail' && row.ok === false && row.exit_code === 7), 'batch result must report exact failed child id', result)
assertGate(fs.existsSync(path.join(reportRoot, 'batch:pass', 'result.json')) && fs.existsSync(path.join(reportRoot, 'batch:fail', 'result.json')), 'batch runner must preserve individual result JSON files')
emitGate('release:gate-batch-runner', { batch_size: result.batch_size, failed_child: 'batch:fail' })
