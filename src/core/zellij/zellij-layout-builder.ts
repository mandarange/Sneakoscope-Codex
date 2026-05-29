import path from 'node:path'
import { ensureDir, nowIso, writeTextAtomic } from '../fsx.js'

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
  const panes = Array.from({ length: slotCount }, (_, index) => {
    const slot = `slot-${String(index + 1).padStart(3, '0')}`
    return [
      `            pane name=${kdlString(slot)} command="sks" {`,
      `                args "zellij-lane" "--mission" ${kdlString(input.missionId)} "--slot" ${kdlString(slot)} "--ledger-root" ${kdlString(ledgerRoot)} "--follow"`,
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
    `            args "-lc" ${kdlString(`sks status --json; exec ${process.env.SHELL || '/bin/zsh'}`)}`,
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
    launch_command: ['zellij', 'attach', '--create-background', sessionName, 'options', '--default-layout'],
    attach_command: `zellij attach ${shellQuote(sessionName)}`
  }
}

export async function writeZellijLayout(root: string, input: ZellijLayoutInput): Promise<ZellijLayoutBuild & { layout_path: string }> {
  const built = buildZellijLayoutKdl(input)
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
