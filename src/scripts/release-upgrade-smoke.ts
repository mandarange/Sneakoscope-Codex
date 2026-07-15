#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { releaseProofDir } from '../core/release/release-pack-receipt.js'
import {
  RELEASE_UPGRADE_BASELINE_LABEL,
  type ReleaseUpgradeSmokeOptions
} from './release-upgrade-smoke-contract.js'
import { runReleaseUpgradeSmoke } from './release-upgrade-smoke-runner.js'
import { canonicalSemver, normalizeSha256, unique } from './release-upgrade-smoke-utils.js'

export {
  RELEASE_UPGRADE_BASELINE_LABEL,
  RELEASE_UPGRADE_BASELINE_SHA256,
  RELEASE_UPGRADE_BASELINE_VERSION,
  RELEASE_UPGRADE_SMOKE_SCHEMA
} from './release-upgrade-smoke-contract.js'
export type {
  ReleaseUpgradeCommandReceipt,
  ReleaseUpgradeCommandResult,
  ReleaseUpgradeCommandRunner,
  ReleaseUpgradeCommandSpec,
  ReleaseUpgradeIsolation,
  ReleaseUpgradeLifecycleResult,
  ReleaseUpgradeSmokeOptions,
  ReleaseUpgradeSmokeReport,
  ReleaseUpgradeState,
  ReleaseUpgradeStates
} from './release-upgrade-smoke-contract.js'
export { runReleaseUpgradeCommand } from './release-upgrade-smoke-command.js'
export {
  createReleaseUpgradeIsolation,
  inspectReleaseSourceCleanliness,
  inspectReleaseUpgradeLaunchctlLog,
  removeReleaseUpgradeSandbox,
  sealReleaseUpgradeTarball
} from './release-upgrade-smoke-isolation.js'
export {
  runValidatedReleaseUpgradeLifecycle,
  validateReleaseUpgradeMenuBarRollbackReceipt
} from './release-upgrade-smoke-lifecycle.js'
export { classifyPinnedReleaseUpgradeBaselineInspection } from './release-upgrade-smoke-inputs.js'
export { runReleaseUpgradeSmoke } from './release-upgrade-smoke-runner.js'

export function parseReleaseUpgradeSmokeArgs(argv: string[]): {
  options: ReleaseUpgradeSmokeOptions
  blockers: string[]
} {
  const blockers: string[] = []
  const values = new Map<string, string>()
  const valueOptions = new Set(['--target-tarball', '--target-receipt', '--baseline-tarball', '--baseline-sha256'])
  let keepSandbox = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || '')
    if (arg === '--keep-sandbox') {
      keepSandbox = true
      continue
    }
    if (!valueOptions.has(arg)) {
      blockers.push(`unknown_argument:${arg || '<empty>'}`)
      continue
    }
    const value = String(argv[index + 1] || '').trim()
    if (!value || value.startsWith('--')) blockers.push(`argument_value_missing:${arg}`)
    else {
      values.set(arg, value)
      index += 1
    }
  }
  if (!values.get('--target-tarball')) blockers.push('target_tarball_required')
  if (!values.get('--target-receipt')) blockers.push('target_receipt_required')
  if (values.get('--baseline-tarball') && !values.get('--baseline-sha256')) blockers.push('provided_baseline_sha256_required')
  if (!values.get('--baseline-tarball') && values.get('--baseline-sha256')) blockers.push('baseline_sha256_requires_tarball')
  const baselineSha256 = normalizeSha256(values.get('--baseline-sha256'))
  if (values.get('--baseline-sha256') && !baselineSha256) blockers.push('baseline_sha256_invalid')
  const options: ReleaseUpgradeSmokeOptions = {
    keepSandbox,
    argumentBlockers: unique(blockers)
  }
  const targetTarball = values.get('--target-tarball')
  const targetReceipt = values.get('--target-receipt')
  const baselineTarball = values.get('--baseline-tarball')
  if (targetTarball) options.targetTarball = targetTarball
  if (targetReceipt) options.targetReceipt = targetReceipt
  if (baselineTarball) options.baselineTarball = baselineTarball
  if (baselineSha256) options.baselineSha256 = baselineSha256
  return { options, blockers: unique(blockers) }
}

async function main(): Promise<void> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  const parsed = parseReleaseUpgradeSmokeArgs(process.argv.slice(2))
  const report = await runReleaseUpgradeSmoke(root, parsed.options)
  const targetVersion = canonicalSemver(report.target_version)
  const receipt = targetVersion
    ? path.join(
      releaseProofDir(root, targetVersion),
      `upgrade-${RELEASE_UPGRADE_BASELINE_LABEL}-to-${targetVersion}.json`
    )
    : null
  console.log(JSON.stringify({
    ...report,
    receipt_path: receipt ? path.relative(root, receipt).split(path.sep).join('/') : null
  }, null, 2))
  process.exitCode = report.ok ? 0 : 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main()
}
