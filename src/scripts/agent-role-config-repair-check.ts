#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse } from 'smol-toml'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const mod = await importDist('core/agents/agent-role-config.js')
const manifest = await importDist('core/managed-assets/managed-assets-manifest.js')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-role-repair-'))
fs.mkdirSync(path.join(root, '.sneakoscope', 'reports'), { recursive: true })
const plan = await mod.repairAgentRoleConfigs({ root, apply: false, codexHome: path.join(root, 'codex-home') })
const repair = await mod.repairAgentRoleConfigs({ root, apply: true, codexHome: path.join(root, 'codex-home'), reportPath: path.join(root, '.sneakoscope', 'reports', 'agent-role-config-repair.json') })
const analysisScout = path.join(root, '.codex', 'agents', 'analysis-scout.toml')
const staleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-role-stale-'))
fs.mkdirSync(path.join(staleRoot, '.codex', 'agents'), { recursive: true })
const staleManagedText = [
  '# SKS-MANAGED-ASSET',
  '# sks_managed_schema = 1',
  '# sks_managed_id = "sks-explorer"',
  '# sks_managed_version = "4.8.1"',
  'name = "analysis_scout"',
  'description = "SKS stale managed role"',
  'sandbox_mode = "workspace-write"',
  'permission_profile = "sks-workspace-write"',
  'legacy_sandbox_projection = "workspace-write"',
  'developer_instructions = """',
  'SKS stale role',
  '"""',
  ''
].join('\n')
fs.writeFileSync(path.join(staleRoot, '.codex', 'agents', 'analysis-scout.toml'), staleManagedText)
const stalePlan = await mod.repairAgentRoleConfigs({ root: staleRoot, apply: false, codexHome: path.join(staleRoot, 'codex-home') })
const staleRepair = await mod.repairAgentRoleConfigs({ root: staleRoot, apply: true, codexHome: path.join(staleRoot, 'codex-home') })
const repairedText = fs.readFileSync(path.join(staleRoot, '.codex', 'agents', 'analysis-scout.toml'), 'utf8')
const createdText = fs.readFileSync(analysisScout, 'utf8')
const createdParsed = parse(createdText)
const globalRole = path.join(root, 'codex-home', 'agents', 'analysis-scout.toml')
fs.mkdirSync(path.dirname(globalRole), { recursive: true })
fs.writeFileSync(globalRole, 'name = "analysis_scout"\ndescription = "SKS stale global role"\nmodel = "gpt-5.6-terra"\nmodel_reasoning_effort = "low"\nsandbox_mode = "workspace-write"\ndeveloper_instructions = """\nSKS role\n"""\n')
const globalRepair = await mod.repairAgentRoleConfigs({ root, apply: true, codexHome: path.join(root, 'codex-home') })
const globalRepairedText = fs.readFileSync(globalRole, 'utf8')
const report = {
  schema: 'sks.agent-role-config-repair-check.v1',
  plan_ok: plan.ok === true && plan.missing.includes('analysis-scout.toml'),
  repair_ok: repair.ok === true,
  analysis_scout_created: fs.existsSync(analysisScout),
  managed_asset_version_current: manifest.MANAGED_ASSET_VERSION === '6.1.0' && createdText.includes('# sks_managed_version = "6.1.0"'),
  generated_toml_parses: createdParsed.name === 'analysis_scout' && createdParsed.sandbox_mode === 'workspace-write',
  generated_toml_uses_supported_keys: !Object.hasOwn(createdParsed, 'permission_profile') && !Object.hasOwn(createdParsed, 'legacy_sandbox_projection'),
  created_inherits_model: !/^(?:model|model_reasoning_effort)\s*=/m.test(createdText),
  created_write_capable: createdText.includes('sandbox_mode = "workspace-write"') && !createdText.includes('Do not edit files.'),
  stale_detected: stalePlan.stale.includes('analysis-scout.toml'),
  stale_repaired: staleRepair.repaired.includes('.codex/agents/analysis-scout.toml') && repairedText === mod.managedAgentRoleConfigForFile('analysis-scout.toml') && !repairedText.includes('permission_profile') && !repairedText.includes('legacy_sandbox_projection'),
  global_stale_repaired_with_valid_project_copy: globalRepair.repaired.some((file) => file.endsWith('codex-home/agents/analysis-scout.toml')) && !/^(?:model|model_reasoning_effort)\s*=/m.test(globalRepairedText),
  warnings_suppressed: repair.warnings_suppressed === true,
  artifact_written: fs.existsSync(path.join(root, '.sneakoscope', 'reports', 'agent-role-config-repair.json'))
}
const ok = report.plan_ok && report.repair_ok && report.analysis_scout_created && report.managed_asset_version_current && report.generated_toml_parses && report.generated_toml_uses_supported_keys && report.created_inherits_model && report.created_write_capable && report.stale_detected && report.stale_repaired && report.global_stale_repaired_with_valid_project_copy && report.warnings_suppressed && report.artifact_written
assertGate(ok, 'doctor --fix must repair missing SKS-owned agent role configs', report)
emitGate('agent:role-config-repair', report)
