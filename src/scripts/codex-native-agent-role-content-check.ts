#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { syncCodexAgentRoles } from '../core/codex-app/codex-agent-role-sync.js'

const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sks-agent-role-content-'))
const codexHome = path.join(root, 'codex-home')
const report = await syncCodexAgentRoles({ root, codexHome, apply: true, agentTypeSupported: true })
const expert = await fs.promises.readFile(path.join(root, '.codex', 'agents', 'expert.toml'), 'utf8')
const worker = await fs.promises.readFile(path.join(root, '.codex', 'agents', 'worker.toml'), 'utf8')
assertGate(expert.includes('model = "gpt-5.6-sol"') && expert.includes('model_reasoning_effort = "max"'), 'expert role must use Sol Max')
assertGate(worker.includes('model = "gpt-5.6-luna"') && worker.includes('model_reasoning_effort = "max"'), 'worker role must use Luna Max')
assertGate(expert.includes('Do not spawn another subagent.') && worker.includes('Do not redesign the task, expand scope, or spawn another subagent.'), 'official roles must prohibit nested delegation')
assertGate(!expert.includes('sandbox_mode') && !worker.includes('sandbox_mode'), 'official roles must inherit the parent permission mode')
assertGate(!fs.existsSync(path.join(codexHome, 'agents')), 'agent role sync must not create global directive roles')
assertGate(report.strategy === 'agent_type' && report.probe_artifact_path && report.clobbered_user_roles === false, 'agent role report strategy/probe/no-clobber fields missing')
emitGate('codex-native:agent-role-content')

function assertGate(condition: unknown, message: string): asserts condition {
  if (condition) return
  console.error(JSON.stringify({ ok: false, message }, null, 2))
  process.exit(1)
}

function emitGate(gate: string): void {
  console.log(JSON.stringify({ schema: 'sks.release-gate.v1', ok: true, gate }, null, 2))
}
