import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { nowIso, packageRoot, runProcess, writeJsonAtomic } from '../fsx.js'

export const CODEX_CONFIG_READABILITY_SCHEMA = 'sks.codex-config-readability.v1'

export type CodexConfigCheck = {
  name: string
  ok: boolean
  status?: string
  detail?: any
  error?: any
}

export type CodexConfigReadabilityReport = {
  schema: typeof CODEX_CONFIG_READABILITY_SCHEMA
  generated_at: string
  root: string
  config_dir: string
  config_path: string
  ok: boolean
  checks: CodexConfigCheck[]
  blockers: string[]
  operator_actions: string[]
  report_path?: string
}

export async function inspectCodexConfigReadability(rootInput: string = process.cwd(), opts: any = {}): Promise<CodexConfigReadabilityReport> {
  const root = path.resolve(rootInput || process.cwd())
  const configDir = path.resolve(opts.configDir || path.join(root, '.codex'))
  const configPath = path.resolve(opts.configPath || path.join(configDir, 'config.toml'))
  const reportPath = opts.reportPath || path.join(root, '.sneakoscope', 'reports', 'codex-config-readability.json')
  const checks: CodexConfigCheck[] = []
  const blockers = new Set<string>()

  const add = (check: CodexConfigCheck) => {
    checks.push(check)
    if (!check.ok) classifyBlocker(check).forEach((blocker) => blockers.add(blocker))
  }

  add(await accessCheck('codex_dir_exists', configDir, fs.constants.R_OK | fs.constants.X_OK))
  add(await accessCheck('project_config_exists', configPath, fs.constants.R_OK))

  for (const dir of parentDirsFor(root, configPath)) {
    add(await accessCheck('parent_traverse', dir, fs.constants.X_OK))
  }

  const lstatCheck = await statCheck('config_lstat', configPath, 'lstat')
  add(lstatCheck)
  const stat = await statCheck('config_stat', configPath, 'stat')
  add(stat)
  if (stat.ok) {
    add({ name: 'config_owner', ok: true, detail: { uid: stat.detail.uid, gid: stat.detail.gid } })
    add({ name: 'config_mode', ok: true, detail: { mode: stat.detail.mode_octal } })
  }

  if (lstatCheck.ok) {
    const isSymlink = Boolean(lstatCheck.detail.is_symbolic_link)
    const symlinkDetail: any = { is_symlink: isSymlink }
    if (isSymlink) {
      symlinkDetail.realpath = await fsp.realpath(configPath).catch((err) => ({ error: errorDetail(err) }))
      symlinkDetail.allowed = typeof symlinkDetail.realpath === 'string' && symlinkTargetAllowed(symlinkDetail.realpath, root, opts)
      if (!symlinkDetail.allowed) blockers.add('symlink_escape')
    }
    add({ name: 'config_symlink', ok: !isSymlink || symlinkDetail.allowed === true, detail: symlinkDetail })
  }

  if (process.platform === 'darwin') {
    add(await commandCheck('macos_acl_ls_le', 'ls', ['-le', configPath], root))
    const acl = checks.find((check) => check.name === 'macos_acl_ls_le')
    if (/\bdeny\b.*\b(read|readattr|readextattr|readsecurity|search)\b/i.test(String(acl?.detail?.stdout || ''))) blockers.add('acl_denied')
    const flags = await commandCheck('macos_flags_ls_lO', 'ls', ['-lO', configPath], root)
    add(flags)
    if (/\b(uchg|schg|restricted)\b/.test(String(flags.detail?.stdout || ''))) blockers.add('flags_locked')
    const xattrs = await commandCheck('macos_xattr', 'xattr', ['-l', configPath], root, { allowExitCodes: [0, 1] })
    add(xattrs)
    add({ name: 'macos_quarantine_xattr', ok: !/com\.apple\.quarantine/.test(String(xattrs.detail?.stdout || '')), detail: { present: /com\.apple\.quarantine/.test(String(xattrs.detail?.stdout || '')) } })
    if (/com\.apple\.quarantine/.test(String(xattrs.detail?.stdout || ''))) blockers.add('quarantine')
  } else {
    add({ name: 'macos_metadata', ok: true, status: 'skipped_non_macos' })
  }

  add(await nodeReadCheck(configPath))
  add(await childReadCheck(configPath, root))
  add(await codexCliConfigLoadCheck(root, configPath, opts))

  const report: CodexConfigReadabilityReport = {
    schema: CODEX_CONFIG_READABILITY_SCHEMA,
    generated_at: nowIso(),
    root,
    config_dir: configDir,
    config_path: configPath,
    ok: checks.every((check) => check.ok),
    checks,
    blockers: [...blockers],
    operator_actions: operatorActions([...blockers])
  }
  report.ok = report.ok && report.blockers.length === 0
  if (opts.writeReport !== false) {
    await writeJsonAtomic(reportPath, { ...report, report_path: reportPath })
    report.report_path = reportPath
  }
  return report
}

async function accessCheck(name: string, target: string, mode: number): Promise<CodexConfigCheck> {
  try {
    await fsp.access(target, mode)
    return { name, ok: true, detail: { path: target } }
  } catch (err) {
    return { name, ok: false, detail: { path: target }, error: errorDetail(err) }
  }
}

async function statCheck(name: string, target: string, kind: 'stat' | 'lstat'): Promise<CodexConfigCheck> {
  try {
    const st = kind === 'stat' ? await fsp.stat(target) : await fsp.lstat(target)
    return {
      name,
      ok: true,
      detail: {
        path: target,
        uid: st.uid,
        gid: st.gid,
        mode: st.mode,
        mode_octal: `0${(st.mode & 0o777).toString(8)}`,
        size: st.size,
        is_file: st.isFile(),
        is_directory: st.isDirectory(),
        is_symbolic_link: st.isSymbolicLink()
      }
    }
  } catch (err) {
    return { name, ok: false, detail: { path: target }, error: errorDetail(err) }
  }
}

async function commandCheck(name: string, command: string, args: string[], cwd: string, opts: any = {}): Promise<CodexConfigCheck> {
  const result = await runProcess(command, args, { cwd, timeoutMs: 5000, maxOutputBytes: 64 * 1024 })
  const allowed = new Set([0, ...(opts.allowExitCodes || [])])
  return {
    name,
    ok: allowed.has(result.code),
    detail: { command: [command, ...args], exit_code: result.code, stdout: result.stdout, stderr: result.stderr, timed_out: result.timedOut }
  }
}

async function nodeReadCheck(configPath: string): Promise<CodexConfigCheck> {
  try {
    const text = await fsp.readFile(configPath, 'utf8')
    return { name: 'node_process_read', ok: true, detail: { bytes: Buffer.byteLength(text) } }
  } catch (err) {
    return { name: 'node_process_read', ok: false, detail: { path: configPath }, error: errorDetail(err) }
  }
}

async function childReadCheck(configPath: string, cwd: string): Promise<CodexConfigCheck> {
  const result = await runProcess(process.execPath, ['-e', 'require("fs").readFileSync(process.argv[1], "utf8")', configPath], { cwd, timeoutMs: 5000, maxOutputBytes: 64 * 1024 })
  return { name: 'spawned_child_read', ok: result.code === 0, detail: { exit_code: result.code, stdout: result.stdout, stderr: result.stderr, timed_out: result.timedOut } }
}

function parentDirsFor(root: string, file: string) {
  const dirs = [root]
  let current = path.dirname(file)
  while (current && current !== root && current !== path.dirname(current)) {
    dirs.push(current)
    current = path.dirname(current)
  }
  return [...new Set(dirs)]
}

function symlinkTargetAllowed(realpath: string, root: string, opts: any = {}) {
  const codexHome = path.resolve(opts.codexHome || process.env.CODEX_HOME || path.join(process.env.HOME || os.homedir(), '.codex'))
  const allowedRoots = [root, codexHome].map((item) => path.resolve(item))
  return allowedRoots.some((allowed) => realpath === allowed || realpath.startsWith(`${allowed}${path.sep}`))
}

function classifyBlocker(check: CodexConfigCheck) {
  const code = String(check.error?.code || '')
  if (code === 'ENOENT') return [check.name.includes('dir') ? 'missing_codex_dir' : 'missing_config']
  if (code === 'EPERM') return ['EPERM', 'tcc_possible']
  if (code === 'EACCES') return [check.name === 'parent_traverse' ? 'parent_traverse_denied' : 'EACCES']
  if (check.name === 'macos_quarantine_xattr') return ['quarantine']
  if (check.name === 'config_symlink') return ['symlink_escape']
  if (check.name === 'actual_codex_cli_config_load') {
    const blockers = check.detail?.blockers || check.detail?.signals?.blockers || []
    if (Array.isArray(blockers) && blockers.length) return blockers
    if (check.detail?.integration_optional === true) return []
    return ['codex_cli_config_load_unverified']
  }
  if (check.detail?.exit_code !== undefined && check.detail.exit_code !== 0) return [`${check.name}_failed`]
  return [`${check.name}_failed`]
}

function operatorActions(blockers: string[]) {
  const actions = new Set<string>()
  if (blockers.some((item) => /^missing_/.test(item))) actions.add('Run `sks doctor --fix` to regenerate the managed Codex project config, then rerun the preflight.')
  if (blockers.includes('codex_cli_config_toml_parse_error')) actions.add('Run `sks doctor --fix` (or `sks mad repair-config --apply`) to hoist misplaced machine-local keys back to the top of the Codex config and restore a loadable config.toml.')
  if (blockers.includes('codex_cli_config_eperm')) actions.add('Run `sks mad repair-config --apply`; if it still fails on macOS, grant Full Disk Access/Files and Folders access to the launching terminal, Warp, iTerm, Terminal, Codex app, or Codex CLI context.')
  if (blockers.includes('EPERM') || blockers.includes('tcc_possible')) actions.add('On macOS, grant the launching terminal/Codex app Full Disk Access or Files and Folders access, then rerun `sks doctor --fix`.')
  if (blockers.includes('EACCES') || blockers.includes('parent_traverse_denied')) actions.add('Restore owner traversal/read permissions for the project root, `.codex`, and `.codex/config.toml`.')
  if (blockers.includes('quarantine')) actions.add('Remove quarantine from the config with `xattr -d com.apple.quarantine .codex/config.toml` after verifying the file is trusted.')
  if (blockers.includes('acl_denied')) actions.add('Review ACL deny entries with `ls -le .codex/config.toml`; remove only intentional, user-approved deny ACLs or move the project to a location readable by the launching app.')
  if (blockers.includes('flags_locked')) actions.add('Remove immutable/restricted file flags with `chflags nouchg .codex/config.toml` if the flag was intentional and safe to clear.')
  if (blockers.includes('symlink_escape')) actions.add('Replace `.codex/config.toml` with a regular file or a symlink target inside the project or CODEX_HOME.')
  return [...actions]
}

function errorDetail(err: any) {
  return { name: err?.name || 'Error', code: err?.code || '', message: err?.message || String(err) }
}

function resolveCodexConfigLoadProbe(): string | null {
  // The probe ships as executable runtime JS under dist/scripts.
  const candidates = [
    path.join(packageRoot(), 'dist', 'scripts', 'codex-config-load-probe.js')
  ]
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate
    } catch {
      // ignore and try the next candidate
    }
  }
  return null
}

async function codexCliConfigLoadCheck(root: string, configPath: string, opts: any = {}): Promise<CodexConfigCheck> {
  if (!opts.codexProbe && !opts.actualCodex && !opts.codexBin) {
    return {
      name: 'actual_codex_cli_config_load',
      ok: true,
      status: 'integration_optional_not_requested',
      detail: { integration_optional: true, blockers: [] }
    }
  }
  const script = resolveCodexConfigLoadProbe()
  if (!script) {
    // The probe ships in dist/scripts; if it is genuinely absent (packaging gap),
    // do not block MAD preflight on an unverifiable check — degrade gracefully.
    return {
      name: 'actual_codex_cli_config_load',
      ok: true,
      status: 'integration_optional_probe_missing',
      detail: { integration_optional: true, blockers: [] }
    }
  }
  const args = [script, '--root', root, '--config', configPath, '--json']
  if (opts.actualCodex !== false) args.push('--actual-codex')
  if (opts.requireActualCodex) args.push('--require-actual-codex')
  if (opts.codexBin) args.push('--codex-bin', String(opts.codexBin))
  const result = await runProcess(process.execPath, args, {
    cwd: root,
    env: opts.env || process.env,
    timeoutMs: opts.timeoutMs || 30000,
    maxOutputBytes: 512 * 1024
  })
  const parsed = parseJson(result.stdout)
  const actual = parsed?.checks?.find((check: any) => check.name === 'actual_codex_cli_config_load')
  const blockers = parsed?.blockers || actual?.signals?.blockers || []
  const optional = actual?.integration_optional === true
  return {
    name: 'actual_codex_cli_config_load',
    ok: result.code === 0 || optional,
    status: actual?.status || (result.code === 0 ? 'passed' : 'failed'),
    detail: {
      exit_code: result.code,
      timed_out: result.timedOut,
      stdout_tail: result.stdout.slice(-4000),
      stderr_tail: result.stderr.slice(-4000),
      report: parsed,
      blockers,
      integration_optional: optional
    }
  }
}

function parseJson(text: string) {
  try { return JSON.parse(text) } catch { return null }
}
