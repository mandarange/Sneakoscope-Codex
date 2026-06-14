import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { ensureDir, globalSksRoot, nowIso, readJson, runProcess, writeJsonAtomic } from '../fsx.js'
import { guardContextForRoute, guardedPackageInstall } from '../safety/mutation-guard.js'
import { createRequestedScopeContract } from '../safety/requested-scope-contract.js'
import { checkZellijCapability } from './zellij-capability.js'
import { compareVersionLike, parseZellijVersionText } from './zellij-command.js'

export const ZELLIJ_UPDATE_NOTICE_SCHEMA = 'sks.zellij-update-notice.v1'

export interface ZellijUpdateNotice {
  schema: typeof ZELLIJ_UPDATE_NOTICE_SCHEMA
  checked_at: string
  current_version: string | null
  latest_version: string | null
  update_available: boolean
  zellij_missing: boolean
  source: 'github-releases' | 'cache' | 'env' | 'disabled' | 'error'
  cache_ttl_ms: number
  upgrade_command: string
  message: string
  error?: string
}

export interface ZellijUpgradeResult {
  status: 'upgraded' | 'installed' | 'failed' | 'manual_required' | 'noop' | 'headless_fallback' | 'repair_required'
  before_version: string | null
  after_version: string | null
  latest_version: string | null
  command: string
  error?: string | null
}

export type ZellijUpdatePromptMode = 'interactive-prompt' | 'nonblocking-notice' | 'skip'

export function resolveZellijUpdatePromptMode(input: {
  ci?: boolean
  noQuestion?: boolean
  headless?: boolean
  skipFlag?: boolean
  env?: NodeJS.ProcessEnv
}): ZellijUpdatePromptMode {
  const env = input.env || process.env
  if (input.skipFlag === true || env.SKS_SKIP_ZELLIJ_UPDATE === '1') return 'skip'
  if (input.ci === true || env.CI === '1' || /^true$/i.test(String(env.CI || ''))) return 'nonblocking-notice'
  if (input.noQuestion === true || env.SKS_NO_QUESTION === '1' || /^true$/i.test(String(env.SKS_NO_QUESTION || ''))) return 'nonblocking-notice'
  if (input.headless === true) return 'nonblocking-notice'
  return 'interactive-prompt'
}

const ZELLIJ_RELEASES_API_PATH = '/repos/zellij-org/zellij/releases/latest'

export function zellijUpgradeCommandHint(missing = false): string {
  if (process.platform === 'darwin') return missing ? 'brew install zellij' : 'brew upgrade zellij'
  if (process.platform === 'linux') return 'cargo install --locked zellij   # or your distro package manager'
  return 'See https://zellij.dev/documentation/installation'
}

/**
 * Resolve the latest STABLE zellij version. GitHub's /releases/latest endpoint
 * already excludes prereleases and drafts. Results are cached on disk
 * (default TTL 6h, override with SKS_ZELLIJ_UPDATE_TTL_MS) so command launches
 * stay fast and offline-safe. SKS_ZELLIJ_LATEST_VERSION pins the value for
 * tests and air-gapped environments.
 */
export async function fetchLatestZellijVersion(input: {
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
} = {}): Promise<{ version: string | null; source: ZellijUpdateNotice['source']; error?: string }> {
  const env = input.env || process.env
  const pinned = stripVersionPrefix(String(env.SKS_ZELLIJ_LATEST_VERSION || '').trim())
  if (pinned) return { version: parseZellijVersionText(pinned) || pinned, source: 'env' }
  const ttlMs = normalizePositiveInt(env.SKS_ZELLIJ_UPDATE_TTL_MS, 6 * 60 * 60 * 1000)
  const cachePath = zellijUpdateCachePath()
  const cached = await readJson<ZellijUpdateNotice | null>(cachePath, null)
  if (cached?.schema === ZELLIJ_UPDATE_NOTICE_SCHEMA && cached.latest_version && Date.now() - Date.parse(cached.checked_at || '') < ttlMs) {
    return { version: cached.latest_version, source: 'cache' }
  }
  try {
    const tag = await githubLatestTag(input.timeoutMs || normalizePositiveInt(env.SKS_ZELLIJ_UPDATE_TIMEOUT_MS, 2500))
    // GitHub release tags carry a leading "v" (v0.44.3); \b-based version
    // parsing cannot start inside "v0", so strip the prefix first.
    const version = parseZellijVersionText(stripVersionPrefix(tag))
    if (!version) throw new Error(`zellij_latest_tag_unparsed:${tag}`)
    return { version, source: 'github-releases' }
  } catch (err: any) {
    return {
      version: cached?.latest_version || null,
      source: 'error',
      error: err?.message || String(err)
    }
  }
}

export async function checkZellijUpdateNotice(input: {
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  missionDir?: string | null
} = {}): Promise<ZellijUpdateNotice> {
  const env = input.env || process.env
  const ttlMs = normalizePositiveInt(env.SKS_ZELLIJ_UPDATE_TTL_MS, 6 * 60 * 60 * 1000)
  if (env.SKS_SKIP_ZELLIJ_UPDATE === '1' || env.SKS_DISABLE_UPDATE_NOTICE === '1') {
    return persistNotice(input.missionDir, {
      schema: ZELLIJ_UPDATE_NOTICE_SCHEMA,
      checked_at: nowIso(),
      current_version: null,
      latest_version: null,
      update_available: false,
      zellij_missing: false,
      source: 'disabled',
      cache_ttl_ms: ttlMs,
      upgrade_command: zellijUpgradeCommandHint(),
      message: 'Zellij update notice disabled by environment.'
    })
  }
  const capability = await checkZellijCapability({ require: false, writeReport: false, env }).catch(() => null)
  const current = capability?.version || null
  const missing = capability?.status === 'missing' || !capability
  const fetchInput: Parameters<typeof fetchLatestZellijVersion>[0] = { env }
  if (input.timeoutMs !== undefined) fetchInput.timeoutMs = input.timeoutMs
  const latest = await fetchLatestZellijVersion(fetchInput)
  const updateAvailable = Boolean(!missing && current && latest.version && compareVersionLike(latest.version, current) > 0)
  const notice: ZellijUpdateNotice = {
    schema: ZELLIJ_UPDATE_NOTICE_SCHEMA,
    checked_at: nowIso(),
    current_version: current,
    latest_version: latest.version,
    update_available: updateAvailable,
    zellij_missing: missing,
    source: latest.source,
    cache_ttl_ms: ttlMs,
    upgrade_command: zellijUpgradeCommandHint(missing),
    message: missing
      ? `Zellij is not installed. Install with: ${zellijUpgradeCommandHint(true)}`
      : updateAvailable
        ? `Zellij ${latest.version} is available; current ${current}. Upgrade with: ${zellijUpgradeCommandHint()}`
        : `Zellij ${current || 'unknown'} is current enough.`,
    ...(latest.error ? { error: latest.error } : {})
  }
  if (latest.source === 'github-releases') {
    await ensureDir(path.dirname(zellijUpdateCachePath())).catch(() => undefined)
    await writeJsonAtomic(zellijUpdateCachePath(), notice).catch(() => undefined)
  }
  return persistNotice(input.missionDir, notice)
}

/**
 * Upgrade zellij to the latest stable release. Only Homebrew automation is
 * attempted (macOS / Linuxbrew); everything else returns manual_required with
 * the exact operator command, mirroring how the Codex CLI update flow behaves.
 */
export async function upgradeZellijToLatest(input: {
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
} = {}): Promise<ZellijUpgradeResult> {
  const before = await checkZellijCapability({ require: false, writeReport: false, env: input.env || process.env }).catch(() => null)
  const beforeVersion = before?.version || null
  const missing = before?.status === 'missing' || !before
  const latest = await fetchLatestZellijVersion({ env: input.env || process.env })
  const brew = await runProcess('brew', ['--version'], { timeoutMs: 8000, maxOutputBytes: 4096 })
  if (brew.code !== 0) {
    return {
      status: 'manual_required',
      before_version: beforeVersion,
      after_version: beforeVersion,
      latest_version: latest.version,
      command: zellijUpgradeCommandHint(missing),
      error: 'homebrew_not_available'
    }
  }
  const upgradeArgs = missing ? ['install', 'zellij'] : ['upgrade', 'zellij']
  // Package installs go through the mutation guard with an explicit
  // zellij_install scope contract (same path ensureZellijCliTool uses), so the
  // mutation ledger records the install and safety gates can audit it. The
  // upgrade only runs after the operator confirmed the [Y/n] prompt or passed
  // --yes / `sks zellij update --yes`.
  const guardRoot = globalSksRoot()
  const guardCommand = `brew ${upgradeArgs.join(' ')}`
  const contract = createRequestedScopeContract({
    route: 'zellij-update',
    userRequest: guardCommand,
    projectRoot: guardRoot,
    overrides: { package_install: true, zellij_install: true }
  })
  const guardCtx = guardContextForRoute(guardRoot, contract, guardCommand)
  let run = await guardedPackageInstall(guardCtx, 'zellij', {
    confirmed: true,
    command: 'brew',
    args: upgradeArgs,
    timeoutMs: input.timeoutMs || 180000,
    maxOutputBytes: 256 * 1024
  }).catch((err: any) => ({ code: 1, stdout: '', stderr: String(err?.message || err) }))
  if (run.code !== 0 && !missing && /No such keg|No available formula|not installed/i.test(`${run.stderr}\n${run.stdout}`)) {
    // zellij exists on PATH but was not installed through Homebrew (e.g. cargo
    // or a manual binary). Installing the brew formula gives a managed copy.
    run = await guardedPackageInstall(guardCtx, 'zellij', {
      confirmed: true,
      command: 'brew',
      args: ['install', 'zellij'],
      timeoutMs: input.timeoutMs || 180000,
      maxOutputBytes: 256 * 1024
    }).catch((err: any) => ({ code: 1, stdout: '', stderr: String(err?.message || err) }))
  }
  if (run.code !== 0 && /already installed|already up-to-date/i.test(`${run.stderr}\n${run.stdout}`)) {
    return {
      status: 'noop',
      before_version: beforeVersion,
      after_version: beforeVersion,
      latest_version: latest.version,
      command: `brew ${upgradeArgs.join(' ')}`,
      error: null
    }
  }
  if (run.code !== 0) {
    return {
      status: 'failed',
      before_version: beforeVersion,
      after_version: beforeVersion,
      latest_version: latest.version,
      command: `brew ${upgradeArgs.join(' ')}`,
      error: `${run.stderr || run.stdout || 'brew upgrade failed'}`.trim().slice(-1000)
    }
  }
  const after = await checkZellijCapability({ require: false, writeReport: false, env: input.env || process.env }).catch(() => null)
  return {
    status: missing ? 'installed' : 'upgraded',
    before_version: beforeVersion,
    after_version: after?.version || null,
    latest_version: latest.version,
    command: `brew ${upgradeArgs.join(' ')}`,
    error: null
  }
}

/**
 * Launch-time prompt, mirroring maybePromptCodexUpdateForLaunch: check the
 * installed zellij version against the latest stable release and offer an
 * upgrade before opening the live session. Never blocks the launch.
 *
 * Skips: --json, --skip-cli-tools, --skip-zellij-update, SKS_SKIP_ZELLIJ_UPDATE=1.
 * Auto-approves: --yes / -y.
 */
export async function maybePromptZellijUpdateForLaunch(args: string[] = [], opts: {
  label?: string
  env?: NodeJS.ProcessEnv
  missionDir?: string | null
  root?: string
  selfHealOnMissing?: boolean
  autoApprove?: boolean
  installHomebrew?: boolean
  allowHeadlessFallback?: boolean
  dryRun?: boolean
} = {}): Promise<{
  status: 'skipped' | 'current' | 'missing' | 'available' | 'skipped_by_user' | 'upgraded' | 'installed' | 'manual_required' | 'failed' | 'noop' | 'headless_fallback' | 'repair_required'
  current: string | null
  latest: string | null
  command: string | null
  error?: string | null
}> {
  const env = opts.env || process.env
  const list = (args || []).map((arg) => String(arg))
  const mode = resolveZellijUpdatePromptMode({
    env,
    skipFlag: list.includes('--json') || list.includes('--skip-cli-tools') || list.includes('--skip-zellij-update'),
    noQuestion: list.includes('--no-question') || list.includes('--no-questions'),
    headless: !(process.stdin.isTTY && process.stdout.isTTY)
  })
  if (mode === 'skip') {
    return { status: 'skipped', current: null, latest: null, command: null }
  }
  const noticeInput: Parameters<typeof checkZellijUpdateNotice>[0] = { env }
  if (opts.missionDir !== undefined) noticeInput.missionDir = opts.missionDir
  const notice = await checkZellijUpdateNotice(noticeInput).catch(() => null)
  if (!notice) return { status: 'skipped', current: null, latest: null, command: null }
  if (notice.zellij_missing) {
    if (opts.selfHealOnMissing === true) {
      const { repairZellijForSks } = await import('./zellij-self-heal.js')
      const repaired = await repairZellijForSks({
        root: opts.root || process.cwd(),
        requestedBy: opts.label === 'MAD launch' ? 'sks --mad' : 'sks zellij update',
        fixRequested: true,
        autoApprove: opts.autoApprove === true || list.includes('--yes') || list.includes('-y'),
        interactive: mode === 'interactive-prompt',
        installHomebrew: opts.installHomebrew === true || list.includes('--install-homebrew'),
        allowHeadlessFallback: opts.allowHeadlessFallback === true,
        dryRun: opts.dryRun === true || list.includes('--dry-run'),
        missionDir: opts.missionDir || null,
        env
      })
      if (repaired.strategy === 'headless-fallback') console.log('Zellij repair: headless fallback selected (live_panes=false).')
      else if (repaired.dry_run) console.log(`Zellij repair: dry_run planned ${repaired.command || 'none'}`)
      else if (repaired.ok && repaired.command) console.log(`Zellij repair: ${repaired.strategy} via ${repaired.command}`)
      else if (!repaired.ok) console.log(`Zellij repair required. Run: ${repaired.command || notice.upgrade_command}`)
      const repairedStatus =
        repaired.strategy === 'headless-fallback' ? 'headless_fallback'
          : !repaired.ok || repaired.strategy === 'manual-required' ? 'repair_required'
            : repaired.strategy === 'brew-upgrade-zellij' ? 'upgraded'
              : repaired.strategy === 'none-current' ? 'noop'
                : 'installed'
      return {
        status: repairedStatus,
        current: repaired.after.version || repaired.before.version,
        latest: repaired.latest_version,
        command: repaired.command,
        error: repaired.blockers[0] || null
      }
    }
    console.log(`Zellij missing, required for sks --mad. Repairable with: sks doctor --fix --yes`)
    return { status: 'missing', current: null, latest: notice.latest_version, command: notice.upgrade_command }
  }
  if (!notice.update_available) {
    return { status: 'current', current: notice.current_version, latest: notice.latest_version, command: null, error: notice.error || null }
  }
  const label = opts.label || 'Zellij launch'
  const autoYes = list.includes('--yes') || list.includes('-y')
  if (mode === 'nonblocking-notice') {
    console.log(`Zellij update available: ${notice.current_version} -> ${notice.latest_version}. Run: ${notice.upgrade_command}`)
    return { status: 'available', current: notice.current_version, latest: notice.latest_version, command: notice.upgrade_command }
  }
  if (!autoYes && !canAskYesNo(env)) {
    console.log(`Zellij update available: ${notice.current_version} -> ${notice.latest_version}. Run: ${notice.upgrade_command}`)
    return { status: 'available', current: notice.current_version, latest: notice.latest_version, command: notice.upgrade_command }
  }
  if (!autoYes) {
    const yes = await askYesNoDefaultYes(`Zellij ${notice.current_version} -> ${notice.latest_version} update before ${label}? [Y/n] `)
    if (!yes) return { status: 'skipped_by_user', current: notice.current_version, latest: notice.latest_version, command: notice.upgrade_command }
  }
  const upgraded = await upgradeZellijToLatest({ env })
  if (upgraded.status === 'upgraded' || upgraded.status === 'installed') {
    console.log(`Zellij ${upgraded.before_version || 'unknown'} -> ${upgraded.after_version || upgraded.latest_version || 'latest'} (${upgraded.command})`)
  } else if (upgraded.status === 'manual_required') {
    console.log(`Zellij upgrade needs a manual step: ${upgraded.command}`)
  } else if (upgraded.status === 'failed') {
    console.log(`Zellij upgrade failed (launch continues): ${upgraded.error || upgraded.command}`)
  }
  return {
    status: upgraded.status,
    current: upgraded.after_version || upgraded.before_version,
    latest: upgraded.latest_version,
    command: upgraded.command,
    error: upgraded.error || null
  }
}

export function zellijUpdateCachePath() {
  return path.join(os.homedir(), '.sneakoscope', 'cache', 'zellij-update-notice.json')
}

async function persistNotice(missionDir: string | null | undefined, notice: ZellijUpdateNotice) {
  if (missionDir) await writeJsonAtomic(path.join(missionDir, 'zellij-update-notice.json'), notice).catch(() => undefined)
  return notice
}

function githubLatestTag(timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: ZELLIJ_RELEASES_API_PATH,
      method: 'GET',
      timeout: timeoutMs,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'sneakoscope-cli'
      }
    }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        try {
          if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) throw new Error(`github_status_${res.statusCode}`)
          const parsed = JSON.parse(body)
          const tag = String(parsed?.tag_name || '').trim()
          if (!tag) throw new Error('github_latest_tag_missing')
          resolve(tag)
        } catch (err) {
          reject(err)
        }
      })
    })
    req.on('timeout', () => {
      req.destroy(new Error('zellij_update_check_timeout'))
    })
    req.on('error', reject)
    req.end()
  })
}

function canAskYesNo(env: NodeJS.ProcessEnv) {
  return resolveZellijUpdatePromptMode({ env, headless: !(process.stdin.isTTY && process.stdout.isTTY) }) === 'interactive-prompt'
}

async function askYesNoDefaultYes(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await new Promise<string>((resolve) => rl.question(question, resolve))
    const trimmed = String(answer || '').trim()
    return trimmed === '' || /^(y|yes|예|네|응)$/i.test(trimmed)
  } finally {
    rl.close()
  }
}

function normalizePositiveInt(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function stripVersionPrefix(value: string) {
  return value.replace(/^v(?=\d)/i, '')
}
