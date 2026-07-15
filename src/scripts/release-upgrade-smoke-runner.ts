import fs from 'node:fs'
import path from 'node:path'
import { releaseProofDir, writeReleaseJson } from '../core/release/release-pack-receipt.js'
import { runReleaseUpgradeCommand } from './release-upgrade-smoke-command.js'
import {
  RELEASE_UPGRADE_BASELINE_LABEL,
  RELEASE_UPGRADE_BASELINE_VERSION,
  type PreparedBaseline,
  type ReleaseUpgradeIsolation,
  type ReleaseUpgradeSmokeDependencies,
  type ReleaseUpgradeSmokeOptions,
  type ReleaseUpgradeSmokeReport
} from './release-upgrade-smoke-contract.js'
import {
  fetchReleaseUpgradeBaseline,
  prepareProvidedReleaseUpgradeBaseline,
  prepareReleaseUpgradeTarget
} from './release-upgrade-smoke-inputs.js'
import {
  createReleaseUpgradeIsolation,
  defaultRemoveReleaseUpgradeSandbox,
  inspectReleaseSourceCleanliness,
  inspectReleaseUpgradeLaunchctlLog,
  ReleaseUpgradeIsolationCreationError,
  removeReleaseUpgradeSandbox,
  sealReleaseUpgradeTarball,
  validateReleaseUpgradeIsolation
} from './release-upgrade-smoke-isolation.js'
import { runValidatedReleaseUpgradeLifecycle } from './release-upgrade-smoke-lifecycle.js'
import {
  emptyReleaseUpgradeSmokeReport,
  setReleaseUpgradeBaselineReport,
  setReleaseUpgradeIsolationReport
} from './release-upgrade-smoke-report.js'
import { canonicalSemver, npmExecutable, readJsonObject, unique } from './release-upgrade-smoke-utils.js'

export async function runReleaseUpgradeSmoke(
  rootInput: string,
  options: ReleaseUpgradeSmokeOptions,
  deps: ReleaseUpgradeSmokeDependencies = {}
): Promise<ReleaseUpgradeSmokeReport> {
  const root = path.resolve(rootInput)
  const now = deps.now || (() => new Date())
  const startedAt = now().toISOString()
  const platform = deps.platform || process.platform
  const pkg = readJsonObject(path.join(root, 'package.json'))
  const rawTargetVersion = String(pkg?.version || 'unknown')
  const targetVersion = canonicalSemver(rawTargetVersion)
  const report = emptyReleaseUpgradeSmokeReport(root, rawTargetVersion, platform, startedAt, options)

  if (pkg?.name !== 'sneakoscope') report.blockers.push('root_package_name_not_sneakoscope')
  if (!targetVersion) {
    report.blockers.push('target_version_invalid')
    report.blockers = unique(report.blockers)
    report.generated_at = now().toISOString()
    return report
  }
  report.target_version = targetVersion
  const reportFile = path.join(
    releaseProofDir(root, targetVersion),
    `upgrade-${RELEASE_UPGRADE_BASELINE_LABEL}-to-${targetVersion}.json`
  )
  if (targetVersion === RELEASE_UPGRADE_BASELINE_VERSION) report.blockers.push('target_version_not_cut_from_baseline')
  const sourceTree = inspectReleaseSourceCleanliness(root)
  report.source_tree = sourceTree
  report.blockers.push(...sourceTree.blockers)

  if (!sourceTree.ok) {
    report.blockers = unique(report.blockers)
    report.generated_at = now().toISOString()
    writeReleaseJson(reportFile, report)
    return report
  }

  const target = prepareReleaseUpgradeTarget(root, targetVersion, options)
  report.blockers.push(...target.blockers)
  if (target.value) {
    report.target = {
      receipt_path: target.value.receiptPath,
      tarball_path: target.value.tarball,
      tarball_sha256: target.value.sha256,
      sealed_tarball_path: null,
      receipt_source_commit: target.value.receipt.source_commit,
      binding_ok: true
    }
  }

  let baseline: PreparedBaseline | null = null
  if (options.baselineTarball) {
    const prepared = prepareProvidedReleaseUpgradeBaseline(root, options.baselineTarball, options.baselineSha256)
    report.blockers.push(...prepared.blockers)
    baseline = prepared.value
    if (baseline) setReleaseUpgradeBaselineReport(report, baseline)
  }
  report.blockers = unique(report.blockers)
  if (report.blockers.length || !target.value) {
    report.generated_at = now().toISOString()
    writeReleaseJson(reportFile, report)
    return report
  }

  let isolation: ReleaseUpgradeIsolation | null = null
  try {
    isolation = await createReleaseUpgradeIsolation(deps.tmpRoot, process.env)
    setReleaseUpgradeIsolationReport(report, isolation)
    report.blockers.push(...validateReleaseUpgradeIsolation(isolation))
    const runner = deps.runner || runReleaseUpgradeCommand
    const npmCommand = deps.npmCommand || npmExecutable()
    if (!report.blockers.length && !baseline) {
      const fetched = await fetchReleaseUpgradeBaseline(isolation, npmCommand, runner, report.commands)
      report.blockers.push(...fetched.blockers)
      baseline = fetched.value
      if (baseline) setReleaseUpgradeBaselineReport(report, baseline)
    }
    if (!report.blockers.length && baseline) {
      const sealedTarget = sealReleaseUpgradeTarball(
        target.value.tarball, target.value.sha256, isolation,
        `target-${targetVersion}-${target.value.sha256.slice(0, 16)}.tgz`
      )
      const sealedBaseline = sealReleaseUpgradeTarball(
        baseline.tarball, baseline.sha256, isolation,
        `baseline-${RELEASE_UPGRADE_BASELINE_VERSION}-${baseline.sha256.slice(0, 16)}.tgz`
      )
      report.blockers.push(...sealedTarget.blockers, ...sealedBaseline.blockers)
      report.target.sealed_tarball_path = sealedTarget.path
      report.baseline.sealed_tarball_path = sealedBaseline.path
      if (report.blockers.length || !sealedTarget.path || !sealedBaseline.path) return report
      const lifecycle = await runValidatedReleaseUpgradeLifecycle({
        targetVersion,
        targetTarball: sealedTarget.path,
        targetSha256: target.value.sha256,
        baselineTarball: sealedBaseline.path,
        baselineSha256: baseline.sha256,
        isolation,
        platform,
        npmCommand
      }, runner)
      report.commands.push(...lifecycle.commands)
      report.states = lifecycle.states
      report.blockers.push(...lifecycle.blockers)
    }
  } catch (error) {
    if (error instanceof ReleaseUpgradeIsolationCreationError) {
      report.isolation.sandbox = error.sandbox
      report.isolation.cleanup_status = error.cleanupStatus
      report.isolation.cleanup_error = error.cleanupError
      report.isolation.retained = error.cleanupStatus === 'partial_creation_remove_failed' && fs.existsSync(error.sandbox)
      report.isolation.removed_after_success = false
      if (error.cleanupError) report.blockers.push(`partial_isolation_cleanup_failed:${error.cleanupError}`)
    }
    report.blockers.push(`upgrade_smoke_exception:${error instanceof Error ? error.message : String(error)}`)
  } finally {
    if (isolation) {
      const launchctl = inspectReleaseUpgradeLaunchctlLog(isolation)
      report.install_safety_policy.launchctl_calls = launchctl.calls
      report.install_safety_policy.launchctl_unexpected_calls = launchctl.unexpected
      report.blockers.push(...launchctl.blockers)
    }
    report.blockers = unique(report.blockers)
    report.ok = report.blockers.length === 0
    report.generated_at = now().toISOString()
    if (isolation) {
      if (report.ok && options.keepSandbox !== true) {
        const cleanup = await removeReleaseUpgradeSandbox(
          isolation.sandbox,
          deps.removeSandbox || defaultRemoveReleaseUpgradeSandbox
        )
        report.isolation.cleanup_status = cleanup.status
        report.isolation.cleanup_error = cleanup.error
        report.isolation.retained = cleanup.retained
        report.isolation.removed_after_success = cleanup.status === 'removed' && cleanup.removed
        report.blockers.push(...cleanup.blockers)
      } else {
        report.isolation.retained = fs.existsSync(isolation.sandbox)
        report.isolation.cleanup_status = report.isolation.retained
          ? (options.keepSandbox === true ? 'retained_by_request' : 'retained_on_failure')
          : 'removed'
      }
    }
    report.blockers = unique(report.blockers)
    report.ok = report.blockers.length === 0
    writeReleaseJson(reportFile, report)
  }
  return report
}
