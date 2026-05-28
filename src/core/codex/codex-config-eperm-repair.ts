import path from 'node:path'
import { nowIso, runProcess, writeJsonAtomic } from '../fsx.js'
import { inspectCodexConfigReadability } from './codex-config-readability.js'
import { splitCodexProjectConfigPolicy } from './codex-project-config-policy.js'

export const CODEX_CONFIG_EPERM_REPAIR_SCHEMA = 'sks.codex-config-eperm-repair.v1'

export async function repairCodexConfigEperm(rootInput: string = process.cwd(), opts: any = {}) {
  const root = path.resolve(rootInput || process.cwd())
  const reportPath = opts.reportPath || path.join(root, '.sneakoscope', 'reports', 'codex-config-eperm-repair.json')
  const configPath = path.resolve(opts.configPath || path.join(root, '.codex', 'config.toml'))
  const before = await inspectCodexConfigReadability(root, { ...opts, configPath, writeReport: false })
  const policy = await splitCodexProjectConfigPolicy(root, { ...opts, configPath, apply: opts.fix === true, writeReport: false })
  const repairActions = opts.fix === true ? await runScopedRepairs(configPath, before.blockers) : []
  const after = await inspectCodexConfigReadability(root, { ...opts, configPath, writeReport: false })
  const blockers = [...new Set([...(policy.blockers || []), ...after.blockers])]
  const report = {
    schema: CODEX_CONFIG_EPERM_REPAIR_SCHEMA,
    generated_at: nowIso(),
    root,
    config_path: configPath,
    ok: after.ok && blockers.length === 0,
    fix: opts.fix === true,
    before,
    policy,
    repair_actions: repairActions,
    after,
    blockers,
    operator_actions: after.operator_actions || []
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
  return actions
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
