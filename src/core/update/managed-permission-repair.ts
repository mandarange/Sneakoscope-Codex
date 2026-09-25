import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { nowIso, readJson, runProcess, writeJsonAtomic } from '../fsx.js'
import { scanHarnessConflicts } from '../harness-conflicts.js'
import { canonicalSkillNameFromValue, REMOVED_SKS_SKILL_NAME_SET } from '../init/skills/inventory.js'

/**
 * `sks update` removes, moves, and rewrites SKS-managed files across the
 * project and the home directory. A managed path the current user cannot
 * delete (a read-only folder, a `uchg` flag, or a root-owned tree left by an
 * earlier `sudo` run) used to fail those stages one errno at a time, and some
 * stages swallowed the error. This repair runs first: it finds every managed
 * path that would block deletion, fixes what the user owns, and asks for
 * administrator permission only for the rest.
 *
 * Invariants:
 * - Only SKS-managed targets are touched; user skills and the rest of
 *   `~/.codex` are never scanned.
 * - Elevation changes ownership back to the current user, flags, and user
 *   permission bits. It never deletes anything; SKS's own ownership checks
 *   still decide what update removes.
 * - Tests and CI never elevate. Outside an explicit update, a declined
 *   prompt is not repeated for 12 hours.
 */

export const MANAGED_PERMISSION_REPAIR_SCHEMA = 'sks.managed-permission-repair.v1'

const ELEVATION_PROMPT_TIMEOUT_MS = 90_000
const DECLINE_COOLDOWN_MS = 12 * 60 * 60 * 1000
const MAX_REPAIR_ROUNDS = 6
const FIND_OUTPUT_BYTES = 8 * 1024 * 1024
const MAX_REPORTED_PATHS = 20
const USER_FLAGS = 'nouchg,nouappnd'
const ALL_FLAGS = 'nouchg,noschg,nouappnd,nosappnd'

export interface ManagedPermissionTarget {
  path: string
  recursive: boolean
}

export type PermissionIssueKind = 'foreign_owner' | 'mode' | 'flags' | 'unreadable' | 'tcc'

export interface PermissionIssue {
  path: string
  kind: PermissionIssueKind
}

export type ElevationChannel =
  | 'not_needed'
  | 'running_as_root'
  | 'sudo_cached'
  | 'macos_admin_dialog'
  | 'sudo_terminal'
  | 'unavailable'
  | 'disabled'
  | 'cooldown'

export interface ElevationResult {
  ok: boolean
  declined?: boolean
  error?: string | undefined
}

export type ElevatedRunner = (script: string, channel: ElevationChannel) => Promise<ElevationResult>

export interface ManagedPermissionRepairOptions {
  root: string
  home?: string
  globalRoot?: string
  env?: NodeJS.ProcessEnv
  /** True inside `sks update` or a user-run repair; false for the first-command migration gate. */
  explicit?: boolean
  /** Allow a terminal sudo prompt. Only the parent `sks update` process has a terminal. */
  interactive?: boolean
  /** Explicit targets instead of the SKS-managed set (the npm global install folders). */
  targets?: ManagedPermissionTarget[]
  /** Why administrator permission is needed, shown in the prompt. */
  reason?: string
  /** Test seams. */
  uid?: number
  gid?: number
  channel?: ElevationChannel
  runElevated?: ElevatedRunner
  reportPath?: string | null
}

export interface ManagedPermissionRepairReport {
  schema: typeof MANAGED_PERMISSION_REPAIR_SCHEMA
  generated_at: string
  ok: boolean
  root: string
  target_count: number
  issues_found: number
  user_fixed: number
  elevation: {
    needed: boolean
    channel: ElevationChannel
    paths: string[]
    ok: boolean | null
    declined: boolean
    error: string | null
  }
  remaining: PermissionIssue[]
  warnings: string[]
  operator_actions: string[]
}

interface OwnerIdentity {
  uid: number
  gid: number
}

function isSksSkillName(name: string): boolean {
  const canonical = canonicalSkillNameFromValue(name)
  return canonical === 'sks' || canonical.startsWith('sks-') || REMOVED_SKS_SKILL_NAME_SET.has(canonical)
}

async function lstatOrNull(p: string): Promise<fs.Stats | null> {
  try {
    return await fsp.lstat(p)
  } catch {
    return null
  }
}

async function readdirNames(dir: string): Promise<string[]> {
  try {
    return await fsp.readdir(dir)
  } catch {
    return []
  }
}

/**
 * The SKS-managed paths update may delete, move, or rewrite. Recursive
 * targets are trees SKS owns; non-recursive targets are containers whose SKS
 * children update replaces, so only the container itself must stay writable.
 */
export async function resolveManagedPermissionTargets(input: {
  root: string
  home: string
  globalRoot: string
}): Promise<ManagedPermissionTarget[]> {
  const root = path.resolve(input.root)
  const home = path.resolve(input.home)
  const globalRoot = path.resolve(input.globalRoot)
  const wanted = new Map<string, boolean>()
  const add = (p: string, recursive: boolean) => {
    const resolved = path.resolve(p)
    wanted.set(resolved, wanted.get(resolved) === true || recursive)
  }
  const projectIsHome = root === home

  add(path.join(root, '.sneakoscope'), true)
  if (!projectIsHome) {
    add(path.join(root, '.codex'), true)
    add(path.join(root, '.agents'), false)
    add(path.join(root, '.agents', 'skills'), false)
  }
  add(path.join(home, '.sneakoscope'), true)
  add(path.join(home, '.sneakoscope-global'), true)
  add(globalRoot, true)
  add(path.join(home, '.codex', '.sneakoscope'), true)
  add(path.join(home, '.codex', 'agents'), true)
  add(path.join(home, '.codex', 'sks'), true)
  add(path.join(home, '.codex', 'sks-menubar'), true)
  for (const container of [
    path.join(home, '.codex'),
    path.join(home, '.codex', 'skills'),
    path.join(home, '.agents'),
    path.join(home, '.agents', 'skills'),
    path.join(home, '.cursor', 'skills'),
    path.join(home, '.claude', 'skills')
  ]) add(container, false)
  add(path.join(home, '.codex', 'config.toml'), false)
  add(path.join(home, '.codex', 'hooks.json'), false)

  const skillRoots = [
    path.join(home, '.agents', 'skills'),
    path.join(home, '.codex', 'skills'),
    path.join(home, '.cursor', 'skills'),
    path.join(home, '.claude', 'skills'),
    ...(projectIsHome ? [] : [path.join(root, '.agents', 'skills'), path.join(root, '.codex', 'skills')])
  ]
  for (const skillsDir of skillRoots) {
    for (const name of await readdirNames(skillsDir)) {
      if (isSksSkillName(name)) add(path.join(skillsDir, name), true)
    }
  }

  // Other-harness markers the other-harness-cleanup stage moves into quarantine.
  const conflicts = await scanHarnessConflicts(root, { home }).catch(() => null)
  for (const conflict of (conflicts?.hard || []) as Array<{ path?: string }>) {
    if (!conflict?.path) continue
    const stat = await lstatOrNull(conflict.path)
    if (stat && !stat.isSymbolicLink()) add(conflict.path, stat.isDirectory())
  }

  const forbidden = new Set([path.parse(root).root, home, root])
  const targets: ManagedPermissionTarget[] = []
  for (const [p, recursive] of [...wanted].sort(([a], [b]) => a.localeCompare(b))) {
    if (forbidden.has(p) || !path.isAbsolute(p)) continue
    const stat = await lstatOrNull(p)
    if (!stat || stat.isSymbolicLink()) continue
    targets.push({ path: p, recursive: recursive && stat.isDirectory() })
  }
  return targets
}

/**
 * The npm global folders `npm install -g sneakoscope` must replace: the
 * package folder (recursive) and the two containers it writes into (the
 * folder only). `globalNodeModules` is `npm root --global`.
 */
export async function npmGlobalInstallTargets(globalNodeModules: string, packageName = 'sneakoscope'): Promise<ManagedPermissionTarget[]> {
  const nodeModules = path.resolve(globalNodeModules)
  if (path.basename(nodeModules) !== 'node_modules') return []
  const candidates: ManagedPermissionTarget[] = [
    { path: nodeModules, recursive: false },
    { path: path.join(nodeModules, packageName), recursive: true },
    { path: path.resolve(nodeModules, '..', '..', 'bin'), recursive: false }
  ]
  const out: ManagedPermissionTarget[] = []
  for (const candidate of candidates) {
    const stat = await lstatOrNull(candidate.path)
    if (stat && !stat.isSymbolicLink()) out.push({ path: candidate.path, recursive: candidate.recursive && stat.isDirectory() })
  }
  return out
}

function findConditions(owner: OwnerIdentity, prune: boolean): string[] {
  const foreign = ['(', '!', '-type', 'l', '!', '-user', String(owner.uid), '-print0', ...(prune ? ['-prune'] : []), ')']
  // Deleting needs a writable, searchable parent folder, so folders are checked
  // everywhere. Files only need u+rw for SKS's in-place appends; read-only
  // files inside a signed `.app` bundle are left exactly as shipped.
  const dirMode = ['(', '-type', 'd', '!', '-perm', '-0700', '-print0', ')']
  const fileMode = ['(', '-type', 'f', '!', '-perm', '-0600', '!', '-path', '*.app/*', '-print0', ')']
  const flags = process.platform === 'darwin'
    ? ['-o', '(', '-flags', '+uchg,uappnd,schg,sappnd', '-print0', ')']
    : []
  return [...foreign, '-o', ...dirMode, '-o', ...fileMode, ...flags]
}

function parseFindErrors(stderr: string): string[] {
  const out: string[] = []
  for (const line of stderr.split('\n')) {
    const match = /^find: (.+): (?:Permission denied|Operation not permitted)$/.exec(line.trim())
    if (match?.[1]) out.push(match[1])
  }
  return out
}

async function runFind(paths: string[], owner: OwnerIdentity, recursive: boolean): Promise<{ hits: string[]; unreadable: string[]; truncated: boolean }> {
  if (!paths.length) return { hits: [], unreadable: [], truncated: false }
  const args = ['-P', ...paths, ...(recursive ? [] : ['-maxdepth', '0']), ...findConditions(owner, recursive)]
  const result = await runProcess(firstExisting(['/usr/bin/find', '/bin/find']), args, { timeoutMs: 120_000, maxOutputBytes: FIND_OUTPUT_BYTES })
  return {
    hits: result.stdout.split('\0').filter(Boolean),
    unreadable: parseFindErrors(result.stderr),
    truncated: result.truncated === true
  }
}

async function classify(p: string, owner: OwnerIdentity, unreadable: boolean): Promise<PermissionIssue | null> {
  const stat = await lstatOrNull(p)
  if (!stat || stat.isSymbolicLink()) return null
  if (stat.uid !== owner.uid) return { path: p, kind: 'foreign_owner' }
  const needed = stat.isDirectory() ? 0o700 : 0o600
  if ((stat.mode & needed) !== needed) return { path: p, kind: 'mode' }
  // An owned folder with full user bits that still cannot be listed is a macOS
  // privacy (TCC) denial; no permission change can fix it.
  if (unreadable) return { path: p, kind: stat.isDirectory() ? 'tcc' : 'unreadable' }
  return { path: p, kind: 'flags' }
}

export async function scanManagedPermissionIssues(
  targets: ManagedPermissionTarget[],
  owner: OwnerIdentity
): Promise<{ issues: PermissionIssue[]; truncated: boolean }> {
  const recursive = await runFind(targets.filter((t) => t.recursive).map((t) => t.path), owner, true)
  const single = await runFind(targets.filter((t) => !t.recursive).map((t) => t.path), owner, false)
  const unreadable = new Set([...recursive.unreadable, ...single.unreadable])
  const seen = new Map<string, PermissionIssue>()
  for (const p of [...recursive.hits, ...single.hits, ...unreadable]) {
    if (seen.has(p)) continue
    const issue = await classify(p, owner, unreadable.has(p))
    if (issue) seen.set(p, issue)
  }
  return { issues: [...seen.values()], truncated: recursive.truncated || single.truncated }
}

async function fixOwnedIssues(issues: PermissionIssue[]): Promise<number> {
  let fixed = 0
  for (const issue of issues) {
    if (issue.kind !== 'mode') continue
    const stat = await lstatOrNull(issue.path)
    if (!stat) continue
    const needed = stat.isDirectory() ? 0o700 : 0o600
    try {
      await fsp.chmod(issue.path, (stat.mode & 0o7777) | needed)
      fixed++
    } catch {}
  }
  if (process.platform !== 'darwin') return fixed
  const flagged = issues.filter((issue) => issue.kind === 'flags').map((issue) => issue.path)
  for (let i = 0; i < flagged.length; i += 200) {
    const batch = flagged.slice(i, i + 200)
    const result = await runProcess('/usr/bin/chflags', [USER_FLAGS, ...batch], { timeoutMs: 30_000, maxOutputBytes: 64 * 1024 })
    if (result.code === 0) fixed += batch.length
  }
  return fixed
}

function withinTargets(p: string, targets: ManagedPermissionTarget[]): ManagedPermissionTarget | null {
  for (const target of targets) {
    if (p === target.path) return target
    if (target.recursive && p.startsWith(`${target.path}${path.sep}`)) return target
  }
  return null
}

/** Topmost elevation paths: a recursive fix on a folder covers everything below it. */
function elevationPaths(issues: PermissionIssue[], targets: ManagedPermissionTarget[]): Array<{ path: string; recursive: boolean }> {
  const candidates = issues
    .filter((issue) => issue.kind === 'foreign_owner' || issue.kind === 'flags' || issue.kind === 'unreadable')
    .map((issue) => issue.path)
    .filter((p) => path.isAbsolute(p) && !/[\0\n\r]/.test(p) && withinTargets(p, targets))
    .sort()
  const out: Array<{ path: string; recursive: boolean }> = []
  for (const p of candidates) {
    if (out.some((kept) => kept.recursive && p.startsWith(`${kept.path}${path.sep}`))) continue
    const target = withinTargets(p, targets)
    // A non-recursive container (e.g. ~/.codex) is fixed on its own inode only.
    out.push({ path: p, recursive: Boolean(target?.recursive) })
  }
  return out
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function firstExisting(candidates: string[]): string {
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[candidates.length - 1]!
}

export function elevationScript(paths: Array<{ path: string; recursive: boolean }>, owner: OwnerIdentity): string {
  const chown = firstExisting(['/usr/sbin/chown', '/bin/chown', '/usr/bin/chown'])
  const chmod = firstExisting(['/bin/chmod', '/usr/bin/chmod'])
  const chflags = process.platform === 'darwin' ? firstExisting(['/usr/bin/chflags']) : null
  const lines: string[] = []
  for (const recursive of [true, false]) {
    const group = paths.filter((p) => p.recursive === recursive).map((p) => shellQuote(p.path))
    if (!group.length) continue
    const r = recursive ? ' -R' : ''
    if (chflags) lines.push(`${chflags}${r} ${ALL_FLAGS} ${group.join(' ')}`)
    lines.push(`${chown}${r} ${owner.uid}:${owner.gid} ${group.join(' ')}`)
    lines.push(`${chmod}${r} u+rwX ${group.join(' ')}`)
  }
  return lines.join('\n')
}

/** Checks the passed env and the real process env: a test may hand in a trimmed env. */
function testOrCi(env: NodeJS.ProcessEnv): boolean {
  return [env, process.env].some((e) => Boolean(e.NODE_TEST_CONTEXT)
    || e.SKS_TEST_ISOLATION === '1'
    || Boolean(e.SKS_TEST_FORBID_REAL_HOME)
    || e.CI === 'true'
    || e.CI === '1')
}

function sudoCached(): boolean {
  if (process.platform === 'win32') return false
  const result = spawnSync('/usr/bin/sudo', ['-n', 'true'], { stdio: 'ignore', timeout: 5_000 })
  return result.status === 0
}

function macosGuiSession(): boolean {
  if (process.platform !== 'darwin') return false
  const result = spawnSync('/bin/launchctl', ['managername'], { encoding: 'utf8', timeout: 3_000 })
  return result.status === 0 && String(result.stdout || '').trim() === 'Aqua'
}

function declineStatePath(home: string): string {
  return path.join(home, '.sneakoscope', 'state', 'managed-permission-elevation.json')
}

// Keyed by time only: the path set shifts between runs (the state file itself
// lives under a managed folder), and one decline should quiet the gate.
async function recentlyDeclined(home: string): Promise<boolean> {
  const state = await readJson<{ declined_at?: string } | null>(declineStatePath(home), null).catch(() => null)
  if (!state?.declined_at) return false
  return Date.now() - Date.parse(state.declined_at) < DECLINE_COOLDOWN_MS
}

async function recordDecline(home: string): Promise<void> {
  await writeJsonAtomic(declineStatePath(home), {
    schema: 'sks.managed-permission-elevation.v1',
    declined_at: nowIso()
  }).catch(() => undefined)
}

function chooseChannel(opts: ManagedPermissionRepairOptions, env: NodeJS.ProcessEnv): ElevationChannel {
  if (opts.channel) return opts.channel
  if (env.SKS_UPDATE_ELEVATION === 'never' || testOrCi(env)) return 'disabled'
  if (process.getuid?.() === 0) return 'running_as_root'
  if (sudoCached()) return 'sudo_cached'
  if (macosGuiSession()) return 'macos_admin_dialog'
  if (opts.interactive && process.stdin.isTTY && process.stderr.isTTY) return 'sudo_terminal'
  return 'unavailable'
}

function appleScriptString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

const ELEVATION_REASON = 'SKS update needs administrator permission to give you back ownership of SKS-managed files it must clean up.'

async function defaultRunElevated(script: string, channel: ElevationChannel, reason = ELEVATION_REASON): Promise<ElevationResult> {
  if (channel === 'running_as_root') {
    const result = await runProcess('/bin/sh', ['-c', script], { timeoutMs: 120_000, maxOutputBytes: 64 * 1024 })
    return { ok: result.code === 0, error: result.code === 0 ? undefined : result.stderr.trim() || `exit_${result.code}` }
  }
  if (channel === 'sudo_cached') {
    const result = await runProcess('/usr/bin/sudo', ['-n', '/bin/sh', '-c', script], { timeoutMs: 120_000, maxOutputBytes: 64 * 1024 })
    return { ok: result.code === 0, error: result.code === 0 ? undefined : result.stderr.trim() || `exit_${result.code}` }
  }
  if (channel === 'macos_admin_dialog') {
    const apple = `do shell script ${appleScriptString(script)} with prompt ${appleScriptString(reason)} with administrator privileges`
    const result = await runProcess('/usr/bin/osascript', ['-e', apple], { timeoutMs: ELEVATION_PROMPT_TIMEOUT_MS, maxOutputBytes: 64 * 1024 })
    if (result.code === 0) return { ok: true }
    const declined = /-128|User canceled/i.test(result.stderr) || result.timedOut === true
    return { ok: false, declined, error: result.timedOut ? 'admin_dialog_timed_out' : result.stderr.trim() || `exit_${result.code}` }
  }
  if (channel === 'sudo_terminal') {
    process.stderr.write(`\n${reason}\n`)
    const result = spawnSync('/usr/bin/sudo', ['-p', 'Password for SKS permission repair: ', '/bin/sh', '-c', script], {
      stdio: ['inherit', 'ignore', 'inherit'],
      timeout: ELEVATION_PROMPT_TIMEOUT_MS
    })
    return { ok: result.status === 0, declined: result.status !== 0, error: result.status === 0 ? undefined : `sudo_exit_${result.status ?? 'timeout'}` }
  }
  return { ok: false, error: `no_elevation_channel:${channel}` }
}

/**
 * The user who should own managed files. `sudo sks update` runs as root, so
 * files go back to the invoking user. Plain root with no SUDO_UID has no user
 * to hand files to (and can delete anything), so it returns null and the
 * repair does nothing rather than chown a home directory to root.
 */
function ownerFor(opts: ManagedPermissionRepairOptions, env: NodeJS.ProcessEnv): OwnerIdentity | null {
  if (opts.uid !== undefined) return { uid: opts.uid, gid: opts.gid ?? opts.uid }
  const uid = process.getuid?.()
  if (uid === undefined) return null
  if (uid !== 0) return { uid, gid: process.getgid?.() ?? uid }
  const sudoUid = Number.parseInt(env.SUDO_UID || '', 10)
  const sudoGid = Number.parseInt(env.SUDO_GID || '', 10)
  if (!Number.isSafeInteger(sudoUid) || sudoUid === 0) return null
  return { uid: sudoUid, gid: Number.isSafeInteger(sudoGid) ? sudoGid : sudoUid }
}

function emptyReport(root: string, warning: string): ManagedPermissionRepairReport {
  return {
    schema: MANAGED_PERMISSION_REPAIR_SCHEMA,
    generated_at: nowIso(),
    ok: true,
    root,
    target_count: 0,
    issues_found: 0,
    user_fixed: 0,
    elevation: { needed: false, channel: 'not_needed', paths: [], ok: null, declined: false, error: null },
    remaining: [],
    warnings: [`managed_permission_repair_skipped:${warning}`],
    operator_actions: []
  }
}

function listPaths(paths: string[]): string {
  const shown = paths.slice(0, MAX_REPORTED_PATHS)
  return shown.join(', ') + (paths.length > shown.length ? ` (+${paths.length - shown.length} more)` : '')
}

export async function repairManagedPermissions(opts: ManagedPermissionRepairOptions): Promise<ManagedPermissionRepairReport> {
  const env = opts.env || process.env
  const root = path.resolve(opts.root)
  const home = path.resolve(opts.home || env.HOME || os.homedir())
  const globalRoot = path.resolve(opts.globalRoot || env.SKS_GLOBAL_ROOT || path.join(home, '.sneakoscope-global'))
  const owner = ownerFor(opts, env)
  if (!owner || process.platform === 'win32') return emptyReport(root, owner ? 'unsupported_platform' : 'no_target_user')
  const targets = opts.targets || await resolveManagedPermissionTargets({ root, home, globalRoot })
  const warnings: string[] = []

  // Rounds: fixing an unreadable folder exposes its children to the next scan.
  let issuesFound = 0
  let userFixed = 0
  let scan = await scanManagedPermissionIssues(targets, owner)
  issuesFound = scan.issues.length
  for (let round = 0; round < MAX_REPAIR_ROUNDS && scan.issues.some((issue) => issue.kind === 'mode' || issue.kind === 'flags'); round++) {
    const fixed = await fixOwnedIssues(scan.issues)
    userFixed += fixed
    if (!fixed) break
    scan = await scanManagedPermissionIssues(targets, owner)
    issuesFound = Math.max(issuesFound, userFixed + scan.issues.length)
  }
  if (scan.truncated) warnings.push('managed_permission_scan_truncated')

  const elevate = elevationPaths(scan.issues, targets)
  let channel: ElevationChannel = 'not_needed'
  let elevationOk: boolean | null = null
  let declined = false
  let elevationError: string | null = null
  if (elevate.length) {
    channel = chooseChannel(opts, env)
    if (channel !== 'disabled' && channel !== 'unavailable' && opts.explicit !== true && await recentlyDeclined(home)) {
      channel = 'cooldown'
    }
    if (channel !== 'disabled' && channel !== 'unavailable' && channel !== 'cooldown') {
      const script = elevationScript(elevate, owner)
      const result = await (opts.runElevated
        ? opts.runElevated(script, channel)
        : defaultRunElevated(script, channel, opts.reason))
      elevationOk = result.ok
      declined = result.declined === true
      elevationError = result.error || null
      if (declined) await recordDecline(home)
      scan = await scanManagedPermissionIssues(targets, owner)
      if (scan.issues.some((issue) => issue.kind === 'mode' || issue.kind === 'flags')) {
        userFixed += await fixOwnedIssues(scan.issues)
        scan = await scanManagedPermissionIssues(targets, owner)
      }
    }
  }

  const remaining = scan.issues
  const operatorActions: string[] = []
  const blocking = remaining.filter((issue) => issue.kind !== 'tcc')
  const tcc = remaining.filter((issue) => issue.kind === 'tcc')
  if (blocking.length) {
    warnings.push(`managed_permission_unresolved:${blocking.length}`)
    const manual = elevationPaths(blocking, targets)
    if (manual.length) {
      operatorActions.push(`SKS could not repair permissions on ${listPaths(manual.map((p) => p.path))}. Run this once, then rerun \`sks update\`:\nsudo /bin/sh -c ${shellQuote(elevationScript(manual, owner).replace(/\n/g, '; '))}`)
    }
    if (channel === 'unavailable') warnings.push('managed_permission_elevation_unavailable')
    if (channel === 'cooldown') warnings.push('managed_permission_elevation_declined_recently')
    if (declined) warnings.push('managed_permission_elevation_declined')
  }
  if (tcc.length) {
    warnings.push(`managed_permission_privacy_denied:${tcc.length}`)
    operatorActions.push(`macOS privacy settings block ${listPaths(tcc.map((issue) => issue.path))}. Grant Full Disk Access to the app that runs \`sks\` (Terminal, Codex, or SKS Menu Bar), then rerun \`sks update\`.`)
  }

  const report: ManagedPermissionRepairReport = {
    schema: MANAGED_PERMISSION_REPAIR_SCHEMA,
    generated_at: nowIso(),
    ok: remaining.length === 0,
    root,
    target_count: targets.length,
    issues_found: issuesFound,
    user_fixed: userFixed,
    elevation: {
      needed: elevate.length > 0,
      channel,
      paths: elevate.map((p) => p.path).slice(0, MAX_REPORTED_PATHS),
      ok: elevationOk,
      declined,
      error: elevationError
    },
    remaining: remaining.slice(0, MAX_REPORTED_PATHS),
    warnings,
    operator_actions: operatorActions
  }
  const reportPath = opts.reportPath === undefined
    ? path.join(root, '.sneakoscope', 'reports', 'managed-permission-repair.json')
    : opts.reportPath
  if (reportPath && (issuesFound > 0 || fs.existsSync(path.dirname(reportPath)))) {
    await writeJsonAtomic(reportPath, report).catch(() => undefined)
  }
  return report
}
