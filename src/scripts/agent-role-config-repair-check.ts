#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const mod = await importDist('core/agents/agent-role-config.js')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-role-repair-'))
fs.mkdirSync(path.join(root, '.sneakoscope', 'reports'), { recursive: true })
const plan = await mod.repairAgentRoleConfigs({ root, apply: false, codexHome: path.join(root, 'codex-home') })
const repair = await mod.repairAgentRoleConfigs({ root, apply: true, codexHome: path.join(root, 'codex-home'), reportPath: path.join(root, '.sneakoscope', 'reports', 'agent-role-config-repair.json') })
const analysisScout = path.join(root, '.codex', 'agents', 'analysis-scout.toml')
const staleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-role-stale-'))
fs.mkdirSync(path.join(staleRoot, '.codex', 'agents'), { recursive: true })
fs.writeFileSync(path.join(staleRoot, '.codex', 'agents', 'analysis-scout.toml'), 'model = "gpt-5-codex"\nsandbox_mode = "read-only"\n')
const stalePlan = await mod.repairAgentRoleConfigs({ root: staleRoot, apply: false, codexHome: path.join(staleRoot, 'codex-home') })
const staleRepair = await mod.repairAgentRoleConfigs({ root: staleRoot, apply: true, codexHome: path.join(staleRoot, 'codex-home') })
const repairedText = fs.readFileSync(path.join(staleRoot, '.codex', 'agents', 'analysis-scout.toml'), 'utf8')
const createdText = fs.readFileSync(analysisScout, 'utf8')
const report = {
  schema: 'sks.agent-role-config-repair-check.v1',
  plan_ok: plan.ok === true && plan.missing.includes('analysis-scout.toml'),
  repair_ok: repair.ok === true,
  analysis_scout_created: fs.existsSync(analysisScout),
  created_matches_model: createdText.includes('model = "gpt-5.5"'),
  created_write_capable: createdText.includes('sandbox_mode = "workspace-write"') && !createdText.includes('Do not edit files.'),
  stale_detected: stalePlan.stale.includes('analysis-scout.toml'),
  stale_repaired: staleRepair.repaired.includes('.codex/agents/analysis-scout.toml') && repairedText.includes('name = "analysis_scout"') && repairedText.includes('model = "gpt-5.5"') && repairedText.includes('sandbox_mode = "workspace-write"'),
  warnings_suppressed: repair.warnings_suppressed === true,
  artifact_written: fs.existsSync(path.join(root, '.sneakoscope', 'reports', 'agent-role-config-repair.json'))
}
const ok = report.plan_ok && report.repair_ok && report.analysis_scout_created && report.created_matches_model && report.created_write_capable && report.stale_detected && report.stale_repaired && report.warnings_suppressed && report.artifact_written
assertGate(ok, 'doctor --fix must repair missing SKS-owned agent role configs', report)
emitGate('agent:role-config-repair', report)
