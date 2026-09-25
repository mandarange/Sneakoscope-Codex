#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parse } from 'smol-toml'
import { syncCodexAgentRoles } from '../core/codex-app/codex-agent-role-sync.js'
import { MANAGED_OFFICIAL_SUBAGENT_ROLES } from '../core/managed-assets/managed-assets-manifest.js'
import { latestModelForTier } from '../core/subagents/model-tiers.js'

// Role models follow tiers: each role file carries the newest model of its tier.
const fast = latestModelForTier('fast')
const balanced = latestModelForTier('balanced')
const context = latestModelForTier('context')
const deep = latestModelForTier('deep')

const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sks-agent-role-content-'))
const codexHome = path.join(root, 'codex-home')
const report = await syncCodexAgentRoles({ root, codexHome, apply: true, agentTypeSupported: true })
const expert = await fs.promises.readFile(path.join(root, '.codex', 'agents', 'expert.toml'), 'utf8')
const worker = await fs.promises.readFile(path.join(root, '.codex', 'agents', 'worker.toml'), 'utf8')
const implementation = await fs.promises.readFile(path.join(root, '.codex', 'agents', 'implementation-specialist.toml'), 'utf8')
const browser = await fs.promises.readFile(path.join(root, '.codex', 'agents', 'browser-use-operator.toml'), 'utf8')
assertGate(expert.includes(`model = "${deep}"`) && expert.includes('model_reasoning_effort = "max"'), 'expert role must use the deep tier at max')
assertGate(worker.includes(`model = "${fast}"`) && worker.includes('model_reasoning_effort = "low"'), 'worker role must use the fast tier at low')
assertGate(implementation.includes(`model = "${balanced}"`) && implementation.includes('model_reasoning_effort = "low"'), 'implementation role must use the balanced tier at low')
assertGate(browser.includes(`model = "${context}"`) && browser.includes('model_reasoning_effort = "medium"'), 'browser role must use the context tier at medium')
assertGate(expert.includes('Do not spawn another subagent.') && worker.includes('Do not redesign the task, expand scope, or spawn another subagent.'), 'official roles must prohibit nested delegation')
assertGate(MANAGED_OFFICIAL_SUBAGENT_ROLES.length === 25, 'official role catalog must contain all 25 roles')
for (const role of MANAGED_OFFICIAL_SUBAGENT_ROLES) {
  const text = await fs.promises.readFile(path.join(root, '.codex', 'agents', role.filename), 'utf8')
  const doc = parse(text) as Record<string, unknown>
  assertGate([fast, balanced, context, deep].includes(String(doc.model)), `official role managed model is not a current tier model:${role.codex_name}`)
  assertGate(doc.name === role.codex_name && doc.model === role.model && doc.model_reasoning_effort === role.model_reasoning_effort, `official role policy mismatch:${role.codex_name}`)
  assertGate(Object.hasOwn(doc, 'sandbox_mode') === (role.sandbox === 'read-only'), `official role sandbox inheritance mismatch:${role.codex_name}`)
  assertGate(doc.sandbox_mode === role.sandbox, `official role sandbox value mismatch:${role.codex_name}`)
}
const distribution = Object.fromEntries(['luna_max_mechanical', 'sol_high_implementation', 'sol_max_judgment', 'terra_max_context_tools']
  .map((policy) => [policy, MANAGED_OFFICIAL_SUBAGENT_ROLES.filter((role) => role.model_policy === policy).length]))
assertGate(JSON.stringify(distribution) === JSON.stringify({
  luna_max_mechanical: 1,
  sol_high_implementation: 3,
  sol_max_judgment: 15,
  terra_max_context_tools: 6
}), 'official role policy distribution mismatch')
assertGate(!fs.existsSync(path.join(codexHome, 'agents')), 'agent role sync must not create global directive roles')
assertGate(report.strategy === 'agent_type' && report.probe_artifact_path && report.clobbered_user_roles === false && report.official_roles.length === MANAGED_OFFICIAL_SUBAGENT_ROLES.length, 'agent role report strategy/probe/catalog/no-clobber fields missing')
emitGate('codex-native:agent-role-content')

function assertGate(condition: unknown, message: string): asserts condition {
  if (condition) return
  console.error(JSON.stringify({ ok: false, message }, null, 2))
  process.exit(1)
}

function emitGate(gate: string): void {
  console.log(JSON.stringify({ schema: 'sks.release-gate.v1', ok: true, gate }, null, 2))
}
