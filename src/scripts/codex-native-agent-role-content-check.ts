#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { syncCodexAgentRoles } from '../core/codex-app/codex-agent-role-sync.js'

const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sks-agent-role-content-'))
const codexHome = path.join(root, 'codex-home')
const report = await syncCodexAgentRoles({ root, codexHome, apply: true, agentTypeSupported: true })
const checker = await fs.promises.readFile(path.join(codexHome, 'agents', 'sks-checker.toml'), 'utf8')
const implementer = await fs.promises.readFile(path.join(codexHome, 'agents', 'sks-implementer.toml'), 'utf8')
for (const token of ['Bounded ownership', 'Maker/checker separation', 'Allowed sandbox', 'Side-effect restrictions', 'Required proof artifacts', 'Final arbiter constraints']) {
  assertGate(checker.includes(token) && implementer.includes(token), `managed agent role missing:${token}`)
}
assertGate(checker.includes('sandbox_mode = \"read-only\"') && checker.includes('checker is read-only'), 'checker role must be read-only')
assertGate(implementer.includes('cannot self-approve'), 'implementer role must not self-approve')
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
