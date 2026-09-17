#!/usr/bin/env node
/**
 * Detached broker entrypoint spawned by `sks decision start`.
 * Usage: node service-entrypoint.js --runtime-root <dir>
 *
 * Only an install receipt inside the runtime root can select the worker
 * interpreter and snapshot; there is no fixture, fallback, or environment
 * override on this path.
 */
import fsp from 'node:fs/promises'
import { localDecisionPaths } from './paths.js'
import { modelEvidenceFromReceipt, readInstallReceipt, verifyReceiptForStart, workerCommandFromReceipt } from './receipt.js'
import { startLocalDecisionService } from './service.js'

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const index = argv.indexOf('--runtime-root')
  const runtimeRoot = index >= 0 ? String(argv[index + 1] || '').trim() : ''
  if (!runtimeRoot || argv.length !== 2) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: 'usage: --runtime-root <dir>' })}\n`)
    process.exit(2)
  }
  const paths = localDecisionPaths({ SKS_LOCAL_DECISION_ROOT: runtimeRoot } as NodeJS.ProcessEnv)
  const found = await readInstallReceipt(paths)
  if (!found) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: 'model_missing' })}\n`)
    process.exit(1)
  }
  await verifyReceiptForStart(found.receipt, paths)
  await fsp.mkdir(paths.workerHomeDir, { recursive: true, mode: 0o700 })
  await fsp.mkdir(`${paths.workerHomeDir}/tmp`, { recursive: true, mode: 0o700 })
  const handle = await startLocalDecisionService({
    runtimeRoot,
    worker: workerCommandFromReceipt(found.receipt, paths),
    expectedModel: modelEvidenceFromReceipt(found.receipt),
    receiptDigest: found.digest,
    exitOnShutdown: true
  })
  const stop = () => { void handle.close().then(() => process.exit(0)) }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
  process.on('SIGHUP', stop)
  process.stdout.write(`${JSON.stringify({ ok: true, socket_path: handle.socketPath, pid: process.pid })}\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`)
  process.exit(1)
})
