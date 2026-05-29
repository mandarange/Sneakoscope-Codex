import path from 'node:path'
import { ensureDir, nowIso, packageRoot, writeTextAtomic } from '../fsx.js'

export const ZELLIJ_LAYOUT_SCHEMA = 'sks.zellij-layout.v1'

export interface ZellijLayoutInput {
  missionId: string
  sessionName?: string
  ledgerRoot: string
  cwd?: string
  kind?: 'mad' | 'agent' | 'team'
  slotCount?: number
  title?: string
}

export interface ZellijLayoutBuild {
  schema: typeof ZELLIJ_LAYOUT_SCHEMA
  generated_at: string
  mission_id: string
  session_name: string
  kind: string
  ledger_root: string
  cwd: string
  slot_count: number
  layout_kdl: string
  launch_command: string[]
  attach_command: string
}

export function buildZellijLayoutKdl(input: ZellijLayoutInput): ZellijLayoutBuild {
  const slotCount = Math.max(1, Number(input.slotCount || 1))
  const sessionName = input.sessionName || `sks-${input.missionId}`
  const cwd = path.resolve(input.cwd || process.cwd())
  const ledgerRoot = path.resolve(input.ledgerRoot)
  const title = input.title || `SKS ${input.kind || 'agent'} ${input.missionId}`
  const sksCommand = `${shellQuote(process.execPath)} ${shellQuote(path.join(packageRoot(), 'dist', 'bin', 'sks.js'))}`
  const panes = Array.from({ length: slotCount }, (_, index) => {
    const slot = `slot-${String(index + 1).padStart(3, '0')}`
    const stderrLog = shellQuote(path.join(ledgerRoot, 'zellij-lane-renderer.stderr.log'))
    const command = `${sksCommand} zellij-lane --mission ${shellQuote(input.missionId)} --slot ${shellQuote(slot)} --ledger-root ${shellQuote(ledgerRoot)} --follow 2>> ${stderrLog}`
    return [
      `            pane name=${kdlString(slot)} command="sh" {`,
      `                args "-lc" ${kdlString(command)}`,
      '            }'
    ].join('\n')
  }).join('\n')
  const layout = [
    'layout {',
    '    default_tab_template {',
    '        pane size=1 borderless=true {',
    '            plugin location="zellij:tab-bar"',
    '        }',
    '        children',
    '        pane size=2 borderless=true {',
    '            plugin location="zellij:status-bar"',
    '        }',
    '    }',
    `    tab name=${kdlString(title)} cwd=${kdlString(cwd)} split_direction="vertical" {`,
    '        pane name="orchestrator" command="sh" {',
    `            args "-lc" ${kdlString(`${sksCommand} status --json || true; exec ${process.env.SHELL || '/bin/zsh'}`)}`,
    '        }',
    '        pane split_direction="horizontal" size="38%" {',
    panes,
    '        }',
    '    }',
    '}',
    ''
  ].join('\n')
  return {
    schema: ZELLIJ_LAYOUT_SCHEMA,
    generated_at: nowIso(),
    mission_id: input.missionId,
    session_name: sessionName,
    kind: input.kind || 'agent',
    ledger_root: ledgerRoot,
    cwd,
    slot_count: slotCount,
    layout_kdl: layout,
    launch_command: ['zellij', 'attach', '--create-background', sessionName, 'options', '--default-layout', '<layout-path>'],
    attach_command: `zellij attach ${shellQuote(sessionName)}`
  }
}

export function validateZellijLayoutKdl(text: string) {
  const blockers = [
    ...(!/\blayout\s*\{/.test(text) ? ['zellij_layout_root_missing'] : []),
    ...(!/\bzellij-lane\b/.test(text) ? ['zellij_layout_lane_command_missing'] : []),
    ...(/\btmux\b/i.test(text) ? ['zellij_layout_references_removed_tmux'] : []),
    ...(braceBalance(text) !== 0 ? ['zellij_layout_unbalanced_braces'] : [])
  ]
  return { ok: blockers.length === 0, blockers }
}

export async function writeZellijLayout(root: string, input: ZellijLayoutInput): Promise<ZellijLayoutBuild & { layout_path: string }> {
  const built = buildZellijLayoutKdl(input)
  await ensureDir(path.resolve(input.ledgerRoot))
  const dir = path.join(root, '.sneakoscope', 'layouts')
  await ensureDir(dir)
  const fileName = `${input.kind || 'agent'}-${input.missionId}.kdl`
  const layoutPath = path.join(dir, fileName)
  await writeTextAtomic(layoutPath, built.layout_kdl)
  return { ...built, layout_path: layoutPath }
}

function kdlString(value: unknown): string {
  return JSON.stringify(String(value || ''))
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function braceBalance(text: string): number {
  let balance = 0
  for (const char of text) {
    if (char === '{') balance += 1
    else if (char === '}') balance -= 1
    if (balance < 0) return balance
  }
  return balance
}
