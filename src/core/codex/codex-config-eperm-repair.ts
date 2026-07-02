import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { nowIso, readText, runProcess, writeJsonAtomic } from '../fsx.js'
import { inspectCodexConfigReadability } from './codex-config-readability.js'
import { repairCodexConfigStructure, splitCodexProjectConfigPolicy } from './codex-project-config-policy.js'
import { writeCodexConfigGuarded } from './codex-config-guard.js'

export const CODEX_CONFIG_EPERM_REPAIR_SCHEMA = 'sks.codex-config-eperm-repair.v1'

export async function repairCodexConfigEperm(rootInput: string = process.cwd(), opts: any = {}) {
  const root = path.resolve(rootInput || process.cwd())
  const reportPath = opts.reportPath || path.join(root, '.sneakoscope', 'reports', 'codex-config-eperm-repair.json')
  const configPath = path.resolve(opts.configPath || path.join(root, '.codex', 'config.toml'))
  const codexHome = path.resolve(opts.codexHome || process.env.CODEX_HOME || path.join(process.env.HOME || os.homedir(), '.codex'))
  const codexHomeConfigPath = path.join(codexHome, 'config.toml')
  const before = await inspectCodexConfigReadability(root, { ...opts, configPath, writeReport: false })
  // Structural recovery FIRST: hoist machine-local keys that a prior buggy move
  // absorbed into a table back to the root, on both the project config and the
  // global CODEX_HOME config (the file Codex actually loads). Runs before the
  // splitter so recovered keys can then be migrated cleanly.
  const structureRepairs: any[] = []
  if (opts.fix === true) {
    structureRepairs.push({ scope: 'project', ...(await repairCodexConfigStructure(configPath, { apply: true })) })
    if (path.resolve(codexHomeConfigPath) !== path.resolve(configPath)) {
      structureRepairs.push({ scope: 'codex_home', ...(await repairCodexConfigStructure(codexHomeConfigPath, { apply: true })) })
    }
  }
  const policy = await splitCodexProjectConfigPolicy(root, { ...opts, configPath, codexHome, apply: opts.fix === true, writeReport: false })
  const repairActions = opts.fix === true ? await runScopedRepairs(configPath, before.blockers) : []
  const after = await inspectCodexConfigReadability(root, { ...opts, configPath, writeReport: false })
  const blockers = [...new Set([...(policy.blockers || []), ...after.blockers])]
  const tccProbable = process.platform === 'darwin'
    && blockers.some((blocker) => blocker === 'codex_cli_config_eperm' || blocker === 'EPERM')
    && repairActions.some((action) => action.ok === true)
  const report = {
    schema: CODEX_CONFIG_EPERM_REPAIR_SCHEMA,
    generated_at: nowIso(),
    root,
    config_path: configPath,
    ok: after.ok && blockers.length === 0,
    fix: opts.fix === true,
    before,
    policy,
    structure_repairs: structureRepairs,
    repair_actions: repairActions,
    after,
    tcc_risk: tccRisk(root),
    tcc_probable: tccProbable,
    blockers,
    operator_actions: [
      ...(after.operator_actions || []),
      ...structureRepairs
        .filter((repair) => repair.applied && repair.hoisted_keys?.length)
        .map((repair) => `Recovered misplaced machine-local keys (${repair.hoisted_keys.join(', ')}) back to the top of ${repair.scope === 'codex_home' ? 'CODEX_HOME' : 'project'} config; backup at ${repair.backup_path}.`),
      ...(tccProbable ? ['macOS probable TCC block: grant Full Disk Access and Files and Folders permissions to Warp/Terminal/iTerm, Codex app, and the Codex CLI launch context, then rerun `sks mad repair-config --apply`.'] : [])
    ]
  }
  if (opts.writeReport !== false) await writeJsonAtomic(reportPath, { ...report, report_path: reportPath })
  return report
}

async function runScopedRepairs(configPath: string, blockers: string[]) {
  const actions: any[] = []
  const has = (blocker: string) => blockers.includes(blocker)
  if (has('EACCES') || has('EPERM') || has('parent_traverse_denied')) {
    actions.push(await repairCommand('chmod_config_user_readwrite', 'chmod', ['u+rw', configPath]))
    actions.push(await repairCommand('chmod_codex_dir_user_traverse', 'chmod', ['u+rwx', path.dirname(configPath)]))
  }
  if (process.platform === 'darwin' && has('quarantine')) {
    actions.push(await repairCommand('remove_quarantine_xattr', 'xattr', ['-d', 'com.apple.quarantine', configPath], [0, 1]))
  }
  if (process.platform === 'darwin' && has('flags_locked')) {
    actions.push(await repairCommand('remove_user_immutable_flag', 'chflags', ['nouchg', configPath], [0, 1]))
  }
  if (has('symlink_escape')) {
    actions.push(await replaceUnsafeSymlink(configPath))
  }
  return actions
}

async function replaceUnsafeSymlink(configPath: string) {
  const backup = `${configPath}.symlink-bak-${Date.now().toString(36)}`
  try {
    const target = await fsp.readlink(configPath)
    const text = await readText(configPath, 'sandbox_mode = "workspace-write"\n')
    await fsp.rename(configPath, backup)
    await writeCodexConfigGuarded({
      configPath,
      before: text,
      cause: 'codex-config-eperm-symlink-repair',
      mutate: () => text || 'sandbox_mode = "workspace-write"\n'
    })
    return { name: 'replace_unsafe_config_symlink', ok: true, backup_path: backup, symlink_target: target }
  } catch (err: any) {
    return { name: 'replace_unsafe_config_symlink', ok: false, error: err?.message || String(err), backup_path: backup }
  }
}

async function repairCommand(name: string, command: string, args: string[], allowExitCodes: number[] = [0]) {
  const result = await runProcess(command, args, { timeoutMs: 5000, maxOutputBytes: 64 * 1024 })
  return {
    name,
    command: [command, ...args],
    ok: allowExitCodes.includes(Number(result.code)),
    exit_code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    timed_out: result.timedOut
  }
}

function tccRisk(root: string) {
  return /\/(Desktop|Documents|Library\/Mobile Documents|iCloud Drive)\//.test(path.resolve(root))
}
