import path from 'node:path'
import { nowIso, runProcess, writeJsonAtomic } from '../fsx.js'

export const OFFICIAL_GOAL_MODE_SCHEMA = 'sks.codex-official-goal-mode.v1'

export interface OfficialGoalModeDetection {
  schema: typeof OFFICIAL_GOAL_MODE_SCHEMA
  generated_at: string
  ok: boolean
  official_goal_available: boolean
  default_enabled: boolean
  mode: 'official_goal_default' | 'sks_goal_fallback'
  codex_help_checked: boolean
  codex_goal_help_checked: boolean
  codex_exec_goal_support: boolean
  config_goal_defaults_detected: boolean
  blockers: string[]
  warnings: string[]
}

export async function detectOfficialGoalMode(opts: {
  codexHelpText?: string
  codexGoalHelpText?: string
  codexExecHelpText?: string
  configText?: string
  runCommand?: boolean
} = {}): Promise<OfficialGoalModeDetection> {
  const helpText = opts.codexHelpText ?? (opts.runCommand === false ? '' : await safeCodexHelp(['--help']))
  const goalHelpText = opts.codexGoalHelpText ?? (opts.runCommand === false ? '' : await safeCodexHelp(['goal', '--help']))
  const execHelpText = opts.codexExecHelpText ?? ''
  const all = `${helpText}\n${goalHelpText}\n${execHelpText}\n${opts.configText || ''}`
  const official = /(?:^|\s)(?:\/goal|goal)(?:\s|,|$)/i.test(all) || /persist(?:ed|ence).{0,40}goal/i.test(all)
  const execGoal = /(?:--goal|goal mode|\/goal)/i.test(execHelpText || helpText)
  const configDefault = /goal[^=\n]*=\s*(?:true|"enabled"|'enabled')/i.test(opts.configText || '')
  return {
    schema: OFFICIAL_GOAL_MODE_SCHEMA,
    generated_at: nowIso(),
    ok: true,
    official_goal_available: official,
    default_enabled: official,
    mode: official ? 'official_goal_default' : 'sks_goal_fallback',
    codex_help_checked: Boolean(helpText),
    codex_goal_help_checked: Boolean(goalHelpText),
    codex_exec_goal_support: execGoal,
    config_goal_defaults_detected: configDefault,
    blockers: [],
    warnings: official ? [] : ['official_goal_unavailable_using_sks_goal_fallback']
  }
}

export async function writeOfficialGoalModeArtifact(dir: string, detection: OfficialGoalModeDetection): Promise<string> {
  const artifact = path.join(dir, 'goal-mode-applied.json')
  await writeJsonAtomic(artifact, detection)
  return artifact
}

async function safeCodexHelp(args: string[]) {
  try {
    const result = await runProcess('codex', args, { timeoutMs: 2_000, maxOutputBytes: 32 * 1024 })
    return `${result.stdout}\n${result.stderr}`
  } catch {
    return ''
  }
}
