#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectMainPushReceipt, type MainPushMethod } from '../core/release/main-push-receipt.js'
import { RELEASE_630_MISSION_ID } from '../core/release/main-push-guard.js'
import { releaseProofDir, writeReleaseJson } from '../core/release/release-pack-receipt.js'
import { RELEASE_ORIGIN_IDENTITY } from '../core/release/release-origin.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const version = required('--version')
const baseline = required('--baseline')
const method = required('--method') as MainPushMethod
const expectedReleaseMissionId = value('--release-mission') || RELEASE_630_MISSION_ID
const expectedWorkOrderSha256 = value('--work-order-sha256')
if (method !== 'fast-forward' && method !== 'protected-pr-merge') {
  console.error('Release main push receipt failed: --method must be fast-forward or protected-pr-merge')
  process.exit(2)
}
const receipt = inspectMainPushReceipt({
  root,
  version,
  baseline,
  method,
  expectedOriginIdentity: RELEASE_ORIGIN_IDENTITY,
  expectedReleaseMissionId,
  ...(expectedWorkOrderSha256 ? { expectedWorkOrderSha256 } : {})
})
const output = path.join(releaseProofDir(root, version), 'main-push-receipt.json')
writeReleaseJson(output, receipt)
console.log(JSON.stringify({ ...receipt, receipt_path: path.relative(root, output).split(path.sep).join('/') }, null, 2))
if (!receipt.ok) process.exitCode = 1

function required(name: string): string {
  const result = value(name)
  if (!result) {
    console.error(`Release main push receipt failed: ${name} is required`)
    process.exit(2)
  }
  return result
}

function value(name: string): string {
  const index = process.argv.indexOf(name)
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : ''
}
