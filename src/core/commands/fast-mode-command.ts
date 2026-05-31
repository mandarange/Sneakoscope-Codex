import path from 'node:path'
import { flag } from '../../cli/args.js'
import { printJson } from '../../cli/output.js'
import { projectRoot } from '../fsx.js'
import {
  clearFastModePreference,
  fastModePreferencePath,
  readFastModePreference,
  resolveFastModePolicy,
  writeFastModePreference,
  type FastModePreferenceMode
} from '../agents/fast-mode-policy.js'

export const FAST_MODE_COMMAND_SCHEMA = 'sks.fast-mode-command.v1'

export async function fastModeCommand(args: string[] = []) {
  const action = normalizeFastModeAction(args[0])
  const root = path.resolve(String(readOption(args, '--root', '') || await projectRoot()))
  const statePath = fastModePreferencePath(root)
  let preference = await readFastModePreference(root)
  let removed: boolean | null = null

  if (action === 'on' || action === 'off') {
    const mode: FastModePreferenceMode = action === 'on' ? 'fast' : 'standard'
    preference = await writeFastModePreference(root, mode, `sks fast-mode ${action}`)
  } else if (action === 'clear') {
    const result = await clearFastModePreference(root)
    removed = result.removed
    preference = null
  }

  const policy = resolveFastModePolicy({ root })
  const result = {
    schema: FAST_MODE_COMMAND_SCHEMA,
    ok: true,
    action,
    root,
    state_path: statePath,
    preference,
    removed,
    fast_mode: policy.fast_mode,
    service_tier: policy.service_tier,
    disabled_by: policy.disabled_by,
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
  console.log(`Status: ${result.fast_mode ? 'on' : 'off'} (service_tier=${result.service_tier})`)
  console.log(`State: ${path.relative(root, statePath)}`)
  if (action === 'on') console.log('Saved: fast mode on')
  else if (action === 'off') console.log('Saved: fast mode off')
  else if (action === 'clear') console.log(`Cleared: ${removed ? 'yes' : 'already default'}`)
  else if (!preference) console.log('Preference: default fast')
  console.log('Dollar: $Fast-On | $Fast-Off | $Fast-Mode')
  return result
}

function normalizeFastModeAction(value: unknown): 'status' | 'on' | 'off' | 'clear' {
  const text = String(value || 'status').toLowerCase()
  if (['on', 'enable', 'enabled', 'fast'].includes(text)) return 'on'
  if (['off', 'disable', 'disabled', 'standard', 'slow'].includes(text)) return 'off'
  if (['clear', 'default', 'reset'].includes(text)) return 'clear'
  return 'status'
}

function readOption(args: string[] = [], name: string, fallback: unknown = null) {
  const index = args.indexOf(name)
  if (index >= 0 && args[index + 1] && !String(args[index + 1]).startsWith('--')) return args[index + 1]
  const prefixed = args.find((arg) => String(arg).startsWith(name + '='))
  return prefixed ? prefixed.slice(name.length + 1) : fallback
}
