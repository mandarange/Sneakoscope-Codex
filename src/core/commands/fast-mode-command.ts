import path from 'node:path'
import { flag } from '../../cli/args.js'
import { printJson } from '../../cli/output.js'
import { projectRoot, readText } from '../fsx.js'
import {
  clearFastModePreference,
  fastModePreferencePath,
  readFastModePreference,
  resolveFastModePolicy,
  writeFastModePreference,
  type FastModePreferenceMode
} from '../agents/fast-mode-policy.js'
import { codexFastModeDesktopStatus, codexLbConfigPath, ensureGlobalCodexFastModeDuringInstall } from '../../cli/install-helpers.js'

export const FAST_MODE_COMMAND_SCHEMA = 'sks.fast-mode-command.v1'

export async function fastModeCommand(args: string[] = []) {
  const action = normalizeFastModeAction(args[0])
  const root = path.resolve(String(readOption(args, '--root', '') || await projectRoot()))
  const statePath = fastModePreferencePath(root)
  const projectOnly = flag(args, '--project')
  let preference = await readFastModePreference(root)
  let removed: boolean | null = null
  let codexFastModeRepair: any = null

  if (action === 'on' || action === 'off') {
    const mode: FastModePreferenceMode = action === 'on' ? 'fast' : 'standard'
    preference = await writeFastModePreference(root, mode, `sks fast-mode ${action}`)
    if (!projectOnly) {
      codexFastModeRepair = await ensureGlobalCodexFastModeDuringInstall({
        forceFastMode: action === 'on',
        forceFastModeOff: action === 'off'
      })
    }
  } else if (action === 'clear') {
    const result = await clearFastModePreference(root)
    removed = result.removed
    preference = null
  }

  const policy = resolveFastModePolicy({ root })
  const globalConfigPath = codexLbConfigPath()
  const globalText = await readText(globalConfigPath, '')
  const globalStatus = codexFastModeDesktopStatus(globalText)
  const globalRequired = (action === 'on' || action === 'off') && !projectOnly
  const globalApplied = !globalRequired
    ? false
    : Boolean(codexFastModeRepair?.ok !== false && globalStatus.ok && (action === 'on' ? globalStatus.on : !globalStatus.on))
  const ok = globalRequired ? globalApplied : true
  if (!ok) process.exitCode = 1
  const result = {
    schema: FAST_MODE_COMMAND_SCHEMA,
    ok,
    action,
    root,
    state_path: statePath,
    preference,
    removed,
    scope: projectOnly ? 'project' : 'global_plus_project',
    global_applied: globalApplied,
    global_config_path: globalConfigPath,
    global: globalStatus,
    project: {
      state_path: statePath,
      preference,
      fast_mode: policy.fast_mode,
      service_tier: policy.service_tier
    },
    fast_mode: policy.fast_mode,
    service_tier: policy.service_tier,
    disabled_by: policy.disabled_by,
    codex_fast_mode_repair: codexFastModeRepair,
    policy,
    dollar_commands: {
      on: '$Fast-On',
      off: '$Fast-Off',
      status: '$Fast-Mode'
    },
    cli_commands: {
      on: 'sks fast-mode on',
      off: 'sks fast-mode off',
      clear: 'sks fast-mode clear',
      status: 'sks fast-mode status'
    }
  }
  if (flag(args, '--json')) return printJson(result)
  console.log('SKS Fast Mode')
  console.log(`Root: ${root}`)
  console.log(`Global (desktop): ${globalStatus.on ? 'on' : 'off'} (default_profile=${globalStatus.default_profile || 'none'}, top-level ${globalStatus.top_level_default_profile ? 'OK' : 'none'})`)
  console.log(`Project (sks workers): ${result.fast_mode ? 'fast' : 'standard'} (service_tier=${result.service_tier})`)
  console.log(`Project state: ${path.relative(root, statePath)}`)
  if (action === 'on') console.log('Saved: fast mode on')
  else if (action === 'off') console.log('Saved: fast mode off')
  else if (action === 'clear') console.log(`Cleared: ${removed ? 'yes' : 'already default'}`)
  else if (!preference) console.log('Preference: implicit standard')
  if (globalRequired && !globalApplied) console.log(`Global apply failed: ${codexFastModeRepair?.status || 'unknown'}`)
  console.log('Dollar: $Fast-On | $Fast-Off | $Fast-Mode')
  return result
}

function normalizeFastModeAction(value: unknown): 'status' | 'on' | 'off' | 'clear' {
  const text = String(value || 'status').toLowerCase()
  if (['on', 'enable', 'enabled', 'fast', 'priority'].includes(text)) return 'on'
  if (['off', 'disable', 'disabled', 'standard', 'slow', 'default'].includes(text)) return 'off'
  if (['clear', 'reset'].includes(text)) return 'clear'
  return 'status'
}

function readOption(args: string[] = [], name: string, fallback: unknown = null) {
  const index = args.indexOf(name)
  if (index >= 0 && args[index + 1] && !String(args[index + 1]).startsWith('--')) return args[index + 1]
  const prefixed = args.find((arg) => String(arg).startsWith(name + '='))
  return prefixed ? prefixed.slice(name.length + 1) : fallback
}
