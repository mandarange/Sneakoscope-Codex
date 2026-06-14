// @ts-nocheck
import fs from 'node:fs/promises'
import path from 'node:path'
import { ensureDir, nowIso, runProcess, writeJsonAtomic } from '../fsx.js'
import { createRequestedScopeContract } from '../safety/requested-scope-contract.js'
import { guardContextForRoute, guardedPackageInstall } from '../safety/mutation-guard.js'
import { mutationLedgerPath } from '../safety/mutation-ledger.js'
import { checkZellijCapability, ZELLIJ_MIN_VERSION, type ZellijCapabilityReport } from './zellij-capability.js'
import { compareVersionLike } from './zellij-command.js'
import { askHomebrewInstallAllowed, HOMEBREW_INSTALL_COMMAND, resolveHomebrewInstallPolicy } from './homebrew-policy.js'

export interface ZellijSelfHealResult {
  schema: 'sks.zellij-self-heal.v1'
  ok: boolean
  requested_by: 'doctor --fix' | 'sks --mad' | 'sks deps check --yes' | 'sks zellij update' | 'setup'
  fix_requested: boolean
  auto_approved: boolean
  install_homebrew_allowed: boolean
  before: {
    status: string
    version: string | null
    bin: string | null
  }
  latest_version: string | null
  strategy:
    | 'none-current'
    | 'brew-install-zellij'
    | 'brew-upgrade-zellij'
    | 'brew-install-homebrew-then-zellij'
    | 'manual-required'
    | 'headless-fallback'
    | 'failed'
  command: string | null
  after: {
    status: string
    version: string | null
    bin: string | null
  }
  mutation_guard_artifact: string | null
  homebrew: {
    present: boolean
    bin: string | null
    install_attempted: boolean
    install_allowed: boolean
  }
  blockers: string[]
  warnings: string[]
}

export async function repairZellijForSks(input: {
  root: string
  requestedBy: ZellijSelfHealResult['requested_by']
  fixRequested: boolean
  autoApprove?: boolean
  interactive?: boolean
  installHomebrew?: boolean
  allowHeadlessFallback?: boolean
  missionDir?: string | null
  env?: NodeJS.ProcessEnv
}): Promise<ZellijSelfHealResult> {
  const root = path.resolve(input.root || process.cwd())
  const env = input.env || process.env
  const autoApproved = input.autoApprove === true
  const beforeReport = await capabilitySnapshot(root, env, 'before')
  const before = compactCapability(beforeReport)
  const latest = await latestZellijVersion(env)
  const brew = await findBrew(env)
  const stale = Boolean(before.version && latest && compareVersionLike(latest, before.version) > 0)
  const needsRepair = before.status === 'missing' || before.status === 'too_old' || stale
  const mutationArtifact = mutationLedgerPath(root)

  if (!needsRepair) {
    return persistSelfHeal(root, input.missionDir, {
      schema: 'sks.zellij-self-heal.v1',
      ok: true,
      requested_by: input.requestedBy,
      fix_requested: input.fixRequested === true,
      auto_approved: autoApproved,
      install_homebrew_allowed: false,
      before,
      latest_version: latest,
      strategy: 'none-current',
      command: null,
      after: before,
      mutation_guard_artifact: null,
      homebrew: { present: brew.present, bin: brew.bin, install_attempted: false, install_allowed: false },
      blockers: [],
      warnings: beforeReport.warnings || []
    })
  }

  if (input.fixRequested !== true) {
    return manualResult(root, input, env, before, latest, brew, 'fix_not_requested')
  }

  if (!autoApproved && input.interactive !== true) {
    return input.allowHeadlessFallback === true
      ? headlessResult(root, input, before, latest, brew, 'noninteractive_without_auto_approval')
      : manualResult(root, input, env, before, latest, brew, 'noninteractive_without_auto_approval')
  }

  if (!autoApproved && input.interactive === true) {
    const accepted = await askZellijRepairAllowed(before.status === 'missing'
      ? 'Zellij is missing. Install it with Homebrew now? [Y/n] '
      : `Zellij ${before.version || 'unknown'} needs repair. Upgrade with Homebrew now? [Y/n] `)
    if (!accepted) return manualResult(root, input, env, before, latest, brew, 'operator_declined_zellij_repair')
  }

  let brewBin = brew.bin
  let homebrewInstallAttempted = false
  let homebrewInstallAllowed = false
  if (!brew.present) {
    const interactiveAccepted = input.interactive === true && !autoApproved
      ? await askHomebrewInstallAllowed()
      : false
    const policy = resolveHomebrewInstallPolicy({
      env,
      installHomebrew: input.installHomebrew === true,
      autoApprove: autoApproved,
      interactiveAccepted
    })
    homebrewInstallAllowed = policy.allowed
    if (!policy.allowed) {
      return input.allowHeadlessFallback === true
        ? headlessResult(root, input, before, latest, brew, policy.blockers[0] || 'homebrew_missing')
        : manualResult(root, input, env, before, latest, brew, policy.blockers[0] || 'homebrew_missing')
    }
    homebrewInstallAttempted = true
    const homebrewRun = await runHomebrewInstall(root, env)
    if (homebrewRun.code !== 0) {
      return persistSelfHeal(root, input.missionDir, {
        schema: 'sks.zellij-self-heal.v1',
        ok: false,
        requested_by: input.requestedBy,
        fix_requested: true,
        auto_approved: autoApproved,
        install_homebrew_allowed: true,
        before,
        latest_version: latest,
        strategy: 'failed',
        command: HOMEBREW_INSTALL_COMMAND,
        after: before,
        mutation_guard_artifact: mutationArtifact,
        homebrew: { present: false, bin: null, install_attempted: true, install_allowed: true },
        blockers: [`homebrew_install_failed:${tail(homebrewRun.stderr || homebrewRun.stdout || 'unknown')}`],
        warnings: []
      })
    }
    const afterBrew = await findBrew(env)
    brewBin = afterBrew.bin || brew.bin || 'brew'
  }

  if (!brewBin) {
    return manualResult(root, input, env, before, latest, brew, 'homebrew_missing')
  }

  const install = before.status === 'missing'
  const brewArgs = install ? ['install', 'zellij'] : ['upgrade', 'zellij']
  const strategy = !brew.present && homebrewInstallAttempted ? 'brew-install-homebrew-then-zellij'
    : install ? 'brew-install-zellij'
      : 'brew-upgrade-zellij'
  const command = `brew ${brewArgs.join(' ')}`
  const run = await runZellijBrew(root, env, brewBin, brewArgs, command)
  if (run.code !== 0 && /already installed|already up-to-date/i.test(`${run.stdout}\n${run.stderr}`)) {
    const after = await capabilitySnapshot(root, env, 'after-noop')
    return persistSelfHeal(root, input.missionDir, {
      schema: 'sks.zellij-self-heal.v1',
      ok: true,
      requested_by: input.requestedBy,
      fix_requested: true,
      auto_approved: autoApproved,
      install_homebrew_allowed: homebrewInstallAllowed,
      before,
      latest_version: latest,
      strategy: 'none-current',
      command,
      after: compactCapability(after, latest || before.version),
      mutation_guard_artifact: mutationArtifact,
      homebrew: { present: true, bin: brewBin, install_attempted: homebrewInstallAttempted, install_allowed: homebrewInstallAllowed },
      blockers: [],
      warnings: ['brew_reported_already_current']
    })
  }
  if (run.code !== 0) {
    return persistSelfHeal(root, input.missionDir, {
      schema: 'sks.zellij-self-heal.v1',
      ok: false,
      requested_by: input.requestedBy,
      fix_requested: true,
      auto_approved: autoApproved,
      install_homebrew_allowed: homebrewInstallAllowed,
      before,
      latest_version: latest,
      strategy: 'failed',
      command,
      after: before,
      mutation_guard_artifact: mutationArtifact,
      homebrew: { present: true, bin: brewBin, install_attempted: homebrewInstallAttempted, install_allowed: homebrewInstallAllowed },
      blockers: [`zellij_brew_repair_failed:${tail(run.stderr || run.stdout || 'unknown')}`],
      warnings: []
    })
  }

  const afterReport = await capabilitySnapshot(root, env, 'after', latest || env.SKS_ZELLIJ_SELF_HEAL_AFTER_VERSION || '0.44.0')
  const after = compactCapability(afterReport, latest || before.version || '0.44.0')
  const ok = after.status === 'ok'
  return persistSelfHeal(root, input.missionDir, {
    schema: 'sks.zellij-self-heal.v1',
    ok,
    requested_by: input.requestedBy,
    fix_requested: true,
    auto_approved: autoApproved,
    install_homebrew_allowed: homebrewInstallAllowed,
    before,
    latest_version: latest,
    strategy,
    command,
    after,
    mutation_guard_artifact: mutationArtifact,
    homebrew: { present: true, bin: brewBin, install_attempted: homebrewInstallAttempted, install_allowed: homebrewInstallAllowed },
    blockers: ok ? [] : ['zellij_repair_completed_but_capability_not_ok'],
    warnings: []
  })
}

async function capabilitySnapshot(root: string, env: NodeJS.ProcessEnv, phase: string, fallbackVersion?: string): Promise<ZellijCapabilityReport> {
  const fakeStatus = phase === 'before' ? env.SKS_ZELLIJ_SELF_HEAL_BEFORE_STATUS : env.SKS_ZELLIJ_SELF_HEAL_AFTER_STATUS
  if (fakeStatus) {
    const version = phase === 'before'
      ? (env.SKS_ZELLIJ_SELF_HEAL_BEFORE_VERSION || (fakeStatus === 'missing' ? null : '0.40.0'))
      : (env.SKS_ZELLIJ_SELF_HEAL_AFTER_VERSION || fallbackVersion || '0.44.0')
    return fakeCapability(String(fakeStatus), version)
  }
  return checkZellijCapability({ root, require: false, writeReport: false, env }).catch((err: any) => ({
    schema: 'sks.zellij-capability.v1',
    generated_at: nowIso(),
    ok: false,
    status: 'blocked',
    integration_optional: true,
    require_zellij: false,
    min_version: ZELLIJ_MIN_VERSION,
    version: null,
    bin: null,
    command: ['zellij', '--version'],
    docs_evidence: [],
    blockers: [`zellij_capability_check_failed:${tail(err?.message || String(err))}`],
    warnings: [],
    operator_actions: ['Resolve the Zellij capability check failure, then rerun `sks doctor --fix --yes`.']
  }))
}

function fakeCapability(status: string, version: string | null): ZellijCapabilityReport {
  const normalized = status === 'ok' || status === 'missing' || status === 'too_old' || status === 'blocked' ? status : 'blocked'
  return {
    schema: 'sks.zellij-capability.v1',
    generated_at: nowIso(),
    ok: normalized === 'ok',
    status: normalized,
    integration_optional: true,
    require_zellij: false,
    min_version: ZELLIJ_MIN_VERSION,
    version,
    bin: 'zellij',
    command: ['zellij', '--version'],
    docs_evidence: [],
    blockers: normalized === 'ok' ? [] : [`zellij_${normalized}`],
    warnings: normalized === 'ok' ? [] : [`zellij_${normalized}_fixture`],
    operator_actions: normalized === 'ok' ? [] : ['Install Zellij. On macOS: `brew install zellij`.']
  }
}

function compactCapability(report: ZellijCapabilityReport, fallbackVersion?: string | null) {
  return {
    status: report.status,
    version: report.version || fallbackVersion || null,
    bin: report.status === 'missing' ? null : report.bin || 'zellij'
  }
}

async function latestZellijVersion(env: NodeJS.ProcessEnv): Promise<string | null> {
  if (env.SKS_ZELLIJ_LATEST_VERSION) return String(env.SKS_ZELLIJ_LATEST_VERSION).replace(/^v(?=\d)/, '')
  const mod = await import('./zellij-update.js').catch(() => null)
  if (!mod?.fetchLatestZellijVersion) return null
  const result = await mod.fetchLatestZellijVersion({ env, timeoutMs: 1500 }).catch(() => null)
  return result?.version || null
}

async function findBrew(env: NodeJS.ProcessEnv): Promise<{ present: boolean; bin: string | null }> {
  if (env.SKS_ZELLIJ_SELF_HEAL_BREW_PRESENT === '0') return { present: false, bin: null }
  if (env.SKS_FAKE_BREW_BIN) return { present: true, bin: String(env.SKS_FAKE_BREW_BIN) }
  for (const dir of String(env.PATH || process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(dir, process.platform === 'win32' ? 'brew.cmd' : 'brew')
    try {
      await fs.access(candidate)
      return { present: true, bin: candidate }
    } catch {}
  }
  if (env.SKS_ZELLIJ_SELF_HEAL_BREW_PRESENT === '1') return { present: true, bin: 'brew' }
  return { present: false, bin: null }
}

async function runZellijBrew(root: string, env: NodeJS.ProcessEnv, brewBin: string, args: string[], command: string) {
  if (env.SKS_ZELLIJ_SELF_HEAL_FAKE_RUN === '1') {
    await appendFakeBrewLog(env, args)
    return { code: Number(env.SKS_ZELLIJ_SELF_HEAL_FAKE_RUN_CODE || 0), stdout: 'fake brew ok', stderr: '' }
  }
  const contract = createRequestedScopeContract({
    route: 'zellij-self-heal',
    userRequest: command,
    projectRoot: root,
    overrides: { package_install: true, zellij_install: true }
  })
  return guardedPackageInstall(guardContextForRoute(root, contract, command), 'zellij', {
    confirmed: true,
    command: brewBin,
    args,
    env,
    timeoutMs: 180000,
    maxOutputBytes: 256 * 1024
  }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }))
}

async function runHomebrewInstall(root: string, env: NodeJS.ProcessEnv) {
  if (env.SKS_ZELLIJ_SELF_HEAL_FAKE_RUN === '1') {
    await appendFakeBrewLog(env, ['install-homebrew'])
    return { code: Number(env.SKS_ZELLIJ_SELF_HEAL_FAKE_HOMEBREW_CODE || 0), stdout: 'fake homebrew install ok', stderr: '' }
  }
  const contract = createRequestedScopeContract({
    route: 'zellij-self-heal',
    userRequest: HOMEBREW_INSTALL_COMMAND,
    projectRoot: root,
    overrides: { package_install: true, zellij_install: true }
  })
  return guardedPackageInstall(guardContextForRoute(root, contract, HOMEBREW_INSTALL_COMMAND), 'homebrew', {
    confirmed: true,
    command: '/bin/bash',
    args: ['-c', 'curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh | /bin/bash'],
    env,
    timeoutMs: 600000,
    maxOutputBytes: 256 * 1024
  }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }))
}

async function appendFakeBrewLog(env: NodeJS.ProcessEnv, args: string[]) {
  if (!env.SKS_FAKE_BREW_LOG) return
  await ensureDir(path.dirname(env.SKS_FAKE_BREW_LOG))
  await fs.appendFile(env.SKS_FAKE_BREW_LOG, `${args.join(' ')}\n`, 'utf8')
}

async function manualResult(root: string, input: any, env: NodeJS.ProcessEnv, before: any, latest: string | null, brew: any, reason: string) {
  const command = brew.present ? 'sks doctor --fix --yes' : 'sks doctor --fix --install-homebrew --yes'
  return persistSelfHeal(root, input.missionDir, {
    schema: 'sks.zellij-self-heal.v1',
    ok: false,
    requested_by: input.requestedBy,
    fix_requested: input.fixRequested === true,
    auto_approved: input.autoApprove === true,
    install_homebrew_allowed: false,
    before,
    latest_version: latest,
    strategy: 'manual-required',
    command,
    after: before,
    mutation_guard_artifact: null,
    homebrew: { present: brew.present, bin: brew.bin, install_attempted: false, install_allowed: false },
    blockers: [reason],
    warnings: []
  })
}

async function headlessResult(root: string, input: any, before: any, latest: string | null, brew: any, reason: string) {
  return persistSelfHeal(root, input.missionDir, {
    schema: 'sks.zellij-self-heal.v1',
    ok: true,
    requested_by: input.requestedBy,
    fix_requested: input.fixRequested === true,
    auto_approved: input.autoApprove === true,
    install_homebrew_allowed: false,
    before,
    latest_version: latest,
    strategy: 'headless-fallback',
    command: 'sks --mad --headless',
    after: before,
    mutation_guard_artifact: null,
    homebrew: { present: brew.present, bin: brew.bin, install_attempted: false, install_allowed: false },
    blockers: [],
    warnings: [reason, 'live_panes=false']
  })
}

async function persistSelfHeal(root: string, missionDir: string | null | undefined, result: ZellijSelfHealResult): Promise<ZellijSelfHealResult> {
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'zellij-self-heal.json'), result).catch(() => undefined)
  if (missionDir) await writeJsonAtomic(path.join(missionDir, 'zellij-self-heal.json'), result).catch(() => undefined)
  return result
}

async function askZellijRepairAllowed(question: string): Promise<boolean> {
  if (!(process.stdin.isTTY && process.stdout.isTTY)) return false
  const rl = (await import('node:readline')).createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await new Promise<string>((resolve) => rl.question(question, resolve))
    const trimmed = String(answer || '').trim()
    return trimmed === '' || /^(y|yes|예|네|응)$/i.test(trimmed)
  } finally {
    rl.close()
  }
}

function tail(value: unknown, limit = 1000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(-limit)
}
