import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import { checkZellijCapability } from './zellij-capability.js'
import { runZellij } from './zellij-command.js'

export const ZELLIJ_PANE_PROOF_SCHEMA = 'sks.zellij-pane-proof.v1'

export async function writeZellijPaneProof(root: string, opts: { missionId?: string; require?: boolean; phase?: string; ledgerRoot?: string } = {}) {
  const capability = await checkZellijCapability({ root, require: opts.require === true, writeReport: true })
  const paneRun = capability.status === 'ok'
    ? await runZellij(['action', 'list-panes', '--json'], { cwd: root, timeoutMs: 5000, optional: opts.require !== true })
    : null
  const paneRows = parsePaneRows(paneRun?.stdout_tail || '')
  const blockers = [
    ...capability.blockers,
    ...(opts.require === true && paneRun && !paneRun.ok ? paneRun.blockers.map((blocker) => `zellij_pane_${blocker}`) : []),
    ...(opts.require === true && capability.status === 'ok' && paneRows.length === 0 ? ['zellij_no_panes_listed'] : [])
  ]
  const report = {
    schema: ZELLIJ_PANE_PROOF_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    mission_id: opts.missionId || null,
    phase: opts.phase || 'check',
    capability_status: capability.status,
    pane_count: paneRows.length,
    panes: paneRows,
    command: ['zellij', 'action', 'list-panes', '--json'],
    command_result: paneRun,
    blockers,
    warnings: [
      ...capability.warnings,
      ...(!paneRun ? ['zellij_pane_probe_skipped'] : []),
      ...(paneRun && !paneRun.ok && opts.require !== true ? ['zellij_pane_probe_failed_optional'] : [])
    ]
  }
  const outRoot = path.resolve(opts.ledgerRoot || (opts.missionId ? path.join(root, '.sneakoscope', 'missions', opts.missionId) : path.join(root, '.sneakoscope', 'reports')))
  await writeJsonAtomic(path.join(outRoot, 'zellij-pane-proof.json'), report)
  return report
}

export async function readZellijPaneProof(root: string) {
  return readJson<any>(path.join(root, 'zellij-pane-proof.json'), null)
}

function parsePaneRows(text: string): any[] {
  if (!text.trim()) return []
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed
    if (Array.isArray(parsed?.panes)) return parsed.panes
    return []
  } catch {
    return []
  }
}
