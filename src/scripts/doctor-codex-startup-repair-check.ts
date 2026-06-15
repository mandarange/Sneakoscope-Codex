#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ensureDistFresh, root as repoRoot } from './lib/ensure-dist-fresh.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'
import { writeTextAtomic } from '../core/fsx.js'

const freshness = ensureDistFresh({ rebuild: true })
assertGate(freshness.ok, 'dist must be fresh for doctor startup repair check', freshness)

const mod = await import(pathToFileURL(path.join(repoRoot, 'dist', 'core', 'doctor', 'doctor-codex-startup-repair.js')).href)
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-codex-startup-doctor-'))
const codexHome = path.join(tmp, 'codex-home')
await fs.mkdir(path.join(tmp, '.codex', 'agents'), { recursive: true })
await fs.mkdir(path.join(codexHome, 'agents'), { recursive: true })

const staleConfig = [
  'model = "gpt-5.5"',
  '',
  '[agents.analysis_scout]',
  'description = "Read-only SKS scout."',
  'config_file = "/Users/alfredo/.codex/agents/analysis-scout.toml"',
  'nickname_candidates = ["Scout", "Mapper"]',
  '',
  '[mcp_servers.node_repl]',
  'command = "/definitely/missing/node_repl"',
  'args = []',
  '',
  '[mcp_servers.supabase_sauron]',
  'command = "npx"',
  'args = ["-y", "fixture"]',
  '',
  '[features]',
  'hooks = true',
  ''
].join('\n')
await writeTextAtomic(path.join(tmp, '.codex', 'config.toml'), staleConfig)
await writeTextAtomic(path.join(codexHome, 'config.toml'), staleConfig)
await writeTextAtomic(path.join(codexHome, 'agents', 'sks-checker.toml'), [
  'name = "sks-checker"',
  'description = "SKS managed 3.1.7 directive role: sks-checker"',
  'message_role_prefix = "Role: sks-checker."',
  'developer_instructions = """',
  'Execution role strategy: message-role.',
  '"""',
  ''
].join('\n'))

const planned = await mod.runDoctorCodexStartupRepair({ root: tmp, codexHome, fix: false })
assertGate(planned.configs.every((entry) => entry.warnings.some((warning) => warning.includes('agent_config_file_stale'))), 'dry inspect must detect stale agent config_file paths', planned)

const repaired = await mod.runDoctorCodexStartupRepair({ root: tmp, codexHome, fix: true })
const projectText = await fs.readFile(path.join(tmp, '.codex', 'config.toml'), 'utf8')
const globalText = await fs.readFile(path.join(codexHome, 'config.toml'), 'utf8')
const checkerText = await fs.readFile(path.join(codexHome, 'agents', 'sks-checker.toml'), 'utf8')

for (const [scope, text, expectedDir] of [
  ['project', projectText, path.join(tmp, '.codex', 'agents')],
  ['global', globalText, path.join(codexHome, 'agents')]
]) {
  assertGate(!text.includes('/Users/alfredo/'), `${scope} config must drop stale home path`, text)
  assertGate(text.includes(`config_file = "${path.join(expectedDir, 'analysis-scout.toml').replace(/\\/g, '\\\\')}"`), `${scope} config_file must point at an existing absolute role file`, text)
  assertGate(!text.includes('[mcp_servers.node_repl]'), `${scope} stale node_repl MCP block must be removed`, text)
  assertGate(text.includes('[mcp_servers.supabase_sauron]'), `${scope} optional sauron MCP block must be preserved`, text)
  assertGate(text.includes('[features]') && text.includes('hooks = true'), `${scope} unrelated tables must be preserved`, text)
}

assertGate(!checkerText.includes('message_role_prefix'), 'managed directive agent role must remove unsupported message_role_prefix', checkerText)
assertGate(repaired.ok === true, 'startup repair must pass when only optional sauron remains', repaired)
assertGate(repaired.configs.every((entry) => entry.changed === true && entry.backup_path), 'startup repair must back up changed configs', repaired)
assertGate(repaired.agent_role_files.created.length >= 10, 'startup repair must create missing project/global role configs', repaired)
emitGate('doctor:codex-startup-repair', { configs: repaired.configs.length, actions: repaired.actions.length })
