import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'

export const DOCTOR_READINESS_MATRIX_SCHEMA = 'sks.doctor-readiness-matrix.v1'

export async function writeDoctorReadinessMatrix(root: string, input: any = {}) {
  const matrix = buildDoctorReadinessMatrix(input)
  const reportPath = input.reportPath || path.join(root, '.sneakoscope', 'reports', 'doctor-ready-breakdown.json')
  await writeJsonAtomic(reportPath, { ...matrix, report_path: reportPath })
  return { ...matrix, report_path: reportPath }
}

export function buildDoctorReadinessMatrix(input: any = {}) {
  const codexConfig = input.codex_config || {}
  const checks = Array.isArray(codexConfig.checks) ? codexConfig.checks : []
  const actual = checks.find((check: any) => check.name === 'actual_codex_cli_config_load') || {}
  const nodeRead = checks.find((check: any) => check.name === 'node_process_read' || check.name === 'node_read') || {}
  const childRead = checks.find((check: any) => check.name === 'spawned_child_read' || check.name === 'spawned_node_child_read') || {}
  const zellij = input.zellij || null
  const codexDoctor = input.codex_doctor || null
  const codexCliRequired = input.require_codex_cli_config_load === true
  const actualOk = actual.ok === true && !String(actual.status || '').includes('not_requested')
  const cliConfigOk = codexCliRequired ? actualOk : (actual.ok !== false)
  const codexBinOk = Boolean(input.codex?.bin || input.codex?.available)
  const configBlockers = normalizeList(codexConfig.blockers)
  const blockers = new Set<string>()
  const warnings = new Set<string>()

  if (!codexBinOk) blockers.add('codex_cli_missing')
  if (nodeRead.ok === false) blockers.add('codex_config_node_read_failed')
  if (childRead.ok === false) blockers.add('codex_config_child_read_failed')
  if (!cliConfigOk) {
    for (const blocker of configBlockers) blockers.add(blocker)
    if (!configBlockers.length) blockers.add('codex_cli_config_load_unverified')
  }
  if (zellij && zellij.ok === false && zellij.integration_optional !== true) blockers.add('zellij_required_missing_or_blocked')
  if (codexDoctor && codexDoctor.available && codexDoctor.exit_code !== 0 && input.require_codex_doctor === true) blockers.add('codex_doctor_failed')
  if (codexDoctor?.warnings?.length) for (const warning of codexDoctor.warnings) warnings.add(String(warning))
  if (input.codex_app?.ok === false) warnings.add('codex_app_needs_setup_optional_for_cli')
  if (input.codex_lb?.ok === false) warnings.add(`codex_lb_${input.codex_lb?.circuit?.state || 'blocked'}`)

  const codexConfigNode = nodeRead.ok !== false && codexConfig.ok !== false
  const codexConfigChild = childRead.ok !== false && codexConfig.ok !== false
  const cliReady = codexBinOk && codexConfigNode && codexConfigChild && cliConfigOk
  const madReady = cliReady && (!zellij || zellij.ok !== false || zellij.integration_optional === true)
  const nextActions = normalizeList(input.operator_actions || codexConfig.operator_actions)
  if (!nextActions.length && blockers.size) nextActions.push('Run `sks doctor --fix`, then run `sks mad repair-config --apply --tmux-smoke` if config-load still fails.')

  return {
    schema: DOCTOR_READINESS_MATRIX_SCHEMA,
    generated_at: nowIso(),
    cli_ready: cliReady,
    mad_ready: madReady,
    codex_config_readable_by_node: codexConfigNode,
    codex_config_readable_by_codex_cli: actualOk,
    codex_config_readable_in_zellij_context: zellij ? zellij.ok === true : false,
    tmux_removed_runtime: true,
    zellij: zellij || null,
    codex_doctor: codexDoctor || null,
    fast_mode_ready: input.fast_mode_ready !== false,
    hooks_ready: input.hooks_ready !== false,
    codex_app_ready: input.codex_app?.ok === true,
    codex_app_required_for_cli: false,
    ready: blockers.size === 0 && cliReady,
    primary_blocker: [...blockers][0] || null,
    blockers: [...blockers],
    warnings: [...warnings],
    next_actions: nextActions
  }
}

function normalizeList(value: any) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : []
}
