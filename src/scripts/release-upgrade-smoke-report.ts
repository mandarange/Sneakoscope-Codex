import path from 'node:path'
import {
  POSTINSTALL_SAFETY_ENV,
  RELEASE_UPGRADE_BASELINE_SHA256,
  RELEASE_UPGRADE_BASELINE_VERSION,
  RELEASE_UPGRADE_SMOKE_SCHEMA,
  type PreparedBaseline,
  type ReleaseUpgradeIsolation,
  type ReleaseUpgradeSmokeOptions,
  type ReleaseUpgradeSmokeReport,
  type ReleaseUpgradeState,
  type ReleaseUpgradeStates
} from './release-upgrade-smoke-contract.js'
import { samePath, unique } from './release-upgrade-smoke-utils.js'

export function emptyReleaseUpgradeSmokeReport(
  root: string,
  targetVersion: string,
  platform: NodeJS.Platform,
  startedAt: string,
  options: ReleaseUpgradeSmokeOptions
): ReleaseUpgradeSmokeReport {
  return {
    schema: RELEASE_UPGRADE_SMOKE_SCHEMA,
    ok: false,
    started_at: startedAt,
    generated_at: startedAt,
    platform,
    baseline_version: RELEASE_UPGRADE_BASELINE_VERSION,
    target_version: targetVersion,
    root,
    source_tree: {
      ok: false, git_root: null, head: null, status_sha256: null,
      dirty_entries: [], blockers: ['source_tree_not_inspected']
    },
    target: {
      receipt_path: options.targetReceipt ? path.resolve(root, options.targetReceipt) : null,
      tarball_path: options.targetTarball ? path.resolve(root, options.targetTarball) : null,
      tarball_sha256: null,
      sealed_tarball_path: null,
      receipt_source_commit: null,
      binding_ok: false
    },
    baseline: {
      source: options.baselineTarball ? 'provided' : 'registry',
      spec: `sneakoscope@${RELEASE_UPGRADE_BASELINE_VERSION}`,
      pinned_sha256: RELEASE_UPGRADE_BASELINE_SHA256,
      tarball_path: options.baselineTarball ? path.resolve(root, options.baselineTarball) : null,
      tarball_sha256: null,
      sealed_tarball_path: null,
      sha512_integrity: null,
      registry_shasum: null,
      inspection_warnings: []
    },
    isolation: {
      sandbox: null, home: null, codex_home: null, npm_cache: null, npm_prefix: null,
      npm_userconfig: null, host_home_reused: false, host_codex_home_reused: false,
      host_npm_prefix_reused: false, retained: false, removed_after_success: false,
      cleanup_status: 'not_created', cleanup_error: null
    },
    menubar_launch_policy: {
      applicable: platform === 'darwin',
      launch_skipped: true,
      proof_scope: 'bundle_install_status_rollback_only',
      separate_real_launch_proof_required: true
    },
    install_safety_policy: {
      host_process_mutation_allowed: false,
      host_session_mutation_allowed: false,
      postinstall_network_allowed: false,
      postinstall_skip_env: Object.keys(POSTINSTALL_SAFETY_ENV).sort(),
      launchctl_stub_path: null,
      launchctl_stub_sha256: null,
      launchctl_log_path: null,
      launchctl_calls: [],
      launchctl_unexpected_calls: [],
      real_launchctl_allowed: false
    },
    commands: [],
    states: newReleaseUpgradeStates(),
    blockers: unique(options.argumentBlockers || [])
  }
}

export function newReleaseUpgradeStates(): ReleaseUpgradeStates {
  const state = (): ReleaseUpgradeState => ({
    status: 'pending', expected_version: null, observed_version: null, command_stages: [], blockers: []
  })
  return {
    baseline_package: state(), baseline_menubar: state(), target_package: state(),
    target_menubar: state(), menubar_rollback: state(), target_menubar_reinstall: state(),
    package_rollback: state()
  }
}

export function completeReleaseUpgradeState(
  state: ReleaseUpgradeState,
  expected: string,
  observed: string | null,
  stages: string[],
  blockers: string[]
): void {
  state.status = blockers.length ? 'failed' : 'passed'
  state.expected_version = expected
  state.observed_version = observed
  state.command_stages = stages
  state.blockers = unique(blockers)
}

export function skipReleaseUpgradeState(state: ReleaseUpgradeState, reason: string): void {
  state.status = 'skipped'
  state.blockers = [reason]
}

export function failedReleaseUpgradeProbe(blocker: string): { ok: false; version: null; blockers: string[] } {
  return { ok: false, version: null, blockers: [blocker] }
}

export function setReleaseUpgradeIsolationReport(
  report: ReleaseUpgradeSmokeReport,
  isolation: ReleaseUpgradeIsolation
): void {
  report.isolation.sandbox = isolation.sandbox
  report.isolation.home = isolation.home
  report.isolation.codex_home = isolation.codexHome
  report.isolation.npm_cache = isolation.npmCache
  report.isolation.npm_prefix = isolation.npmPrefix
  report.isolation.npm_userconfig = isolation.npmUserConfig
  report.isolation.host_home_reused = samePath(isolation.home, process.env.HOME)
  report.isolation.host_codex_home_reused = samePath(isolation.codexHome, process.env.CODEX_HOME)
  report.isolation.host_npm_prefix_reused = samePath(
    isolation.npmPrefix,
    process.env.npm_config_prefix || process.env.NPM_CONFIG_PREFIX
  )
  report.install_safety_policy.launchctl_stub_path = isolation.launchctlStub
  report.install_safety_policy.launchctl_stub_sha256 = isolation.launchctlStubSha256
  report.install_safety_policy.launchctl_log_path = isolation.launchctlLog
}

export function setReleaseUpgradeBaselineReport(
  report: ReleaseUpgradeSmokeReport,
  baseline: PreparedBaseline
): void {
  report.baseline.source = baseline.source
  report.baseline.tarball_path = baseline.tarball
  report.baseline.tarball_sha256 = baseline.sha256
  report.baseline.sha512_integrity = baseline.sha512Integrity
  report.baseline.registry_shasum = baseline.registryShasum
  report.baseline.inspection_warnings = baseline.inspectionWarnings
}
