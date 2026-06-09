import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import { resolveLocalCollaborationPolicy } from '../local-llm/local-collaboration-policy.js'

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
  const zellijStatus = zellij?.status || 'missing'
  const zellijReadyForInteractive = zellij?.ok === true && zellijStatus === 'ok'
  if (!zellijReadyForInteractive) warnings.add(`zellij_${zellijStatus}`)
  if (codexDoctor && codexDoctor.available && codexDoctor.exit_code !== 0 && input.require_codex_doctor === true) blockers.add('codex_doctor_failed')
  if (codexDoctor?.warnings?.length) for (const warning of codexDoctor.warnings) warnings.add(String(warning))
  if (input.codex_app?.ok === false) warnings.add('codex_app_needs_setup_optional_for_cli')
  if (input.codex_app_ui?.fast_selector === 'manual_action_required') warnings.add('codex_app_fast_selector_manual_action_required')
  if (input.codex_app_ui?.requires_confirmation === true) blockers.add('codex_app_fast_ui_repair_requires_confirmation')
  if (input.codex_app_ui?.fast_selector === 'repaired') warnings.add('codex_app_fast_selector_repaired_restart_app_if_needed')
  const codex0138Doctor = input.codex_0138_doctor || null
  if (codex0138Doctor?.ok === false) for (const blocker of normalizeList(codex0138Doctor.blockers)) warnings.add(blocker)
  for (const warning of normalizeList(codex0138Doctor?.warnings)) warnings.add(warning)
  for (const warning of normalizeList(input.codex_plugin_app_template_policy?.doctor_warnings)) warnings.add(warning)
  if (input.codex_lb?.ok === false) warnings.add(`codex_lb_${input.codex_lb?.circuit?.state || 'blocked'}`)
  const localModel = input.local_model || {}
  const localStatus = String(localModel.status || (localModel.enabled ? 'enabled_unverified' : 'disabled'))
  if (localModel.enabled === true && localStatus === 'enabled_unverified') warnings.add('local_llm_enabled_unverified')
  if (localModel.enabled === true && localStatus === 'degraded') warnings.add('local_llm_degraded')
  if (localModel.enabled === true && localStatus === 'blocked') warnings.add('local_llm_blocked_worker_tier_disabled')
  const agentRoleConfig = input.agent_role_config || {}
  if (agentRoleConfig.ok === false) blockers.add('agent_role_config_repair_failed')
  if (Array.isArray(agentRoleConfig.missing) && agentRoleConfig.missing.length && agentRoleConfig.apply !== true) warnings.add('agent_role_config_missing_repair_available')
  const localCollaborationPolicy = resolveLocalCollaborationPolicy({ mode: input.local_collaboration?.mode || null })
  const gptFinalAvailable = input.local_collaboration?.gpt_final_arbiter_available === undefined
    ? codexBinOk
    : input.local_collaboration.gpt_final_arbiter_available === true
  if (localCollaborationPolicy.gpt_final_required && !gptFinalAvailable) blockers.add('gpt_final_arbiter_unavailable')

  const codexConfigNode = nodeRead.ok !== false && codexConfig.ok !== false
  const codexConfigChild = childRead.ok !== false && codexConfig.ok !== false
  const cliReady = codexBinOk && codexConfigNode && codexConfigChild && cliConfigOk
  const madReady = cliReady && zellijReadyForInteractive
  const nextActions = normalizeList(input.operator_actions || codexConfig.operator_actions)
  if (!nextActions.length && blockers.size) nextActions.push('Run `sks doctor --fix`, then run `sks mad repair-config --apply` if config-load still fails.')
  if (input.codex_app_ui?.requires_confirmation === true) nextActions.push(input.codex_app_ui.next_action || 'Run `sks doctor --fix --repair-codex-app-ui` after reviewing the repair plan.')
  if (!zellijReadyForInteractive) nextActions.push('Install Zellij for `sks --mad` and interactive lane UI. On macOS: `brew install zellij`.')

  return {
    schema: DOCTOR_READINESS_MATRIX_SCHEMA,
    generated_at: nowIso(),
    cli_ready: cliReady,
    mad_ready: madReady,
    codex_config_readable_by_node: codexConfigNode,
    codex_config_readable_by_codex_cli: actualOk,
    codex_config_readable_in_zellij_context: zellijReadyForInteractive,
    tmux_removed_runtime: true,
    zellij: zellij ? {
      ...zellij,
      required_for: ['sks --mad', 'interactive lane UI'],
      ready_for_interactive_runtime: zellijReadyForInteractive
    } : {
      status: 'missing',
      required_for: ['sks --mad', 'interactive lane UI'],
      ready_for_interactive_runtime: false
    },
    tmux: {
      status: 'removed_runtime',
      replacement: 'zellij'
    },
    codex_doctor: codexDoctor || null,
    codex_0138_doctor: codex0138Doctor,
    codex_plugin_inventory: input.codex_plugin_inventory || null,
    codex_plugin_app_template_policy: input.codex_plugin_app_template_policy || null,
    fast_mode_ready: input.fast_mode_ready !== false,
    codex_app_ui: input.codex_app_ui || null,
    hooks_ready: input.hooks_ready !== false,
    codex_app_ready: input.codex_app?.ok === true,
    codex_app_required_for_cli: false,
    local_collaboration: {
      mode: localCollaborationPolicy.mode,
      local_backend: input.local_collaboration?.local_backend || localModel.provider || 'ollama',
      local_model: input.local_collaboration?.local_model || localModel.model || null,
      final_arbiter: gptFinalAvailable ? 'GPT available' : 'missing',
      final_apply_allowed: localCollaborationPolicy.gpt_final_required ? gptFinalAvailable : localCollaborationPolicy.mode === 'disabled',
      blockers: localCollaborationPolicy.gpt_final_required && !gptFinalAvailable ? ['gpt_final_arbiter_unavailable'] : localCollaborationPolicy.blockers
    },
    local_llm: {
      enabled: localModel.enabled === true,
      status: localStatus,
      provider: localModel.provider || 'ollama',
      model: localModel.model || null,
      endpoint: localModel.endpoint || localModel.base_url || null,
      last_smoke: localModel.last_smoke || null,
      final_arbiter: 'GPT required',
      worker_tier_enabled: localModel.enabled === true && localStatus === 'verified',
      blockers: normalizeList(localModel.blockers)
    },
    agent_role_config: agentRoleConfig,
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
