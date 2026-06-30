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
  '[agents.analysis_scout]',
  'description = "SKS scout with bounded write capability."',
  'config_file = "./agents/analysis-scout.toml"',
  'nickname_candidates = ["Scout", "Mapper"]',
  '',
  '[mcp_servers.context7]',
  'url = "https://custom.context7.example/mcp"',
  '',
  '[mcp_servers.context7]',
  'url = "https://mcp.context7.com/mcp"',
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
  '',
  '[mcp_servers.node_repl.env]',
  'NODE_REPL_NODE_PATH = "/Applications/Codex.app/Contents/Resources/node"',
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

const repaired = await mod.runDoctorCodexStartupRepair({ root: tmp, codexHome, fix: true, includeDefaultNodeReplCandidates: false })
const projectText = await fs.readFile(path.join(tmp, '.codex', 'config.toml'), 'utf8')
const globalText = await fs.readFile(path.join(codexHome, 'config.toml'), 'utf8')
const checkerText = await fs.readFile(path.join(codexHome, 'agents', 'sks-checker.toml'), 'utf8')
const projectScoutText = await fs.readFile(path.join(tmp, '.codex', 'agents', 'analysis-scout.toml'), 'utf8')
const globalScoutText = await fs.readFile(path.join(codexHome, 'agents', 'analysis-scout.toml'), 'utf8')

for (const [scope, text, expectedDir] of [
  ['project', projectText, path.join(tmp, '.codex', 'agents')],
  ['global', globalText, path.join(codexHome, 'agents')]
]) {
  assertGate(!text.includes('/Users/alfredo/'), `${scope} config must drop stale home path`, text)
  assertGate(text.includes(`config_file = "${path.join(expectedDir, 'analysis-scout.toml').replace(/\\/g, '\\\\')}"`), `${scope} config_file must point at an existing absolute role file`, text)
  assertGate(text.includes('description = "SKS scout with bounded write capability."'), `${scope} managed agent description must be write-capable`, text)
  assertGate(!text.includes('[mcp_servers.node_repl]'), `${scope} stale node_repl MCP block must be removed`, text)
  assertGate(!text.includes('[mcp_servers.node_repl.env]'), `${scope} stale node_repl child MCP block must be removed`, text)
  assertGate((text.match(/\[mcp_servers\.context7\]/g) || []).length === 1, `${scope} duplicate context7 MCP block must be deduped`, text)
  assertGate(text.includes('url = "https://custom.context7.example/mcp"'), `${scope} original context7 MCP settings must be preserved`, text)
  assertGate(text.includes('[mcp_servers.supabase_sauron]'), `${scope} optional sauron MCP block must be preserved`, text)
  assertGate(text.includes('[features]') && text.includes('hooks = true'), `${scope} unrelated tables must be preserved`, text)
}

for (const [scope, text] of [['project', projectScoutText], ['global', globalScoutText]]) {
  assertGate(text.includes('sandbox_mode = "workspace-write"'), `${scope} agent role file must be workspace-write`, text)
  assertGate(!text.includes('Do not edit files.'), `${scope} agent role file must not preserve stale read-only instruction`, text)
}

assertGate(!checkerText.includes('message_role_prefix'), 'managed directive agent role must remove unsupported message_role_prefix', checkerText)
assertGate(repaired.ok === true, 'startup repair must pass when only optional sauron remains', repaired)
assertGate(repaired.configs.every((entry) => entry.changed === true && entry.backup_path), 'startup repair must back up changed configs', repaired)
assertGate(repaired.agent_role_files.created.length >= 10, 'startup repair must create missing project/global role configs', repaired)
assertGate(repaired.configs.every((entry) => !entry.warnings.some((warning) => warning.includes('agent_config_file_stale'))), 'startup repair must not keep stale agent config warnings after repair', repaired)
assertGate(repaired.configs.every((entry) => entry.duplicate_toml_blocks_removed.includes('agents.analysis_scout') && entry.duplicate_toml_blocks_removed.includes('mcp_servers.context7')), 'startup repair must record duplicate managed/external table dedupe without rewriting preserved MCP values', repaired)

const tmpCandidate = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-codex-startup-node-repl-'))
const codexHomeCandidate = path.join(tmpCandidate, 'codex-home')
const fakeNodeRepl = path.join(tmpCandidate, 'Codex.app', 'Contents', 'Resources', 'cua_node', 'bin', 'node_repl')
await fs.mkdir(path.dirname(fakeNodeRepl), { recursive: true })
await writeTextAtomic(fakeNodeRepl, '#!/bin/sh\n')
await fs.mkdir(path.join(tmpCandidate, '.codex'), { recursive: true })
await fs.mkdir(codexHomeCandidate, { recursive: true })
const missingNodeReplConfig = [
  '[mcp_servers.node_repl]',
  'command = "/definitely/missing/node_repl"',
  'args = []',
  '',
  '[mcp_servers.node_repl.env]',
  'NODE_REPL_NODE_PATH = "/Applications/Codex.app/Contents/Resources/node"',
  ''
].join('\n')
await writeTextAtomic(path.join(tmpCandidate, '.codex', 'config.toml'), missingNodeReplConfig)
await writeTextAtomic(path.join(codexHomeCandidate, 'config.toml'), missingNodeReplConfig)
const candidateRepaired = await mod.runDoctorCodexStartupRepair({
  root: tmpCandidate,
  codexHome: codexHomeCandidate,
  fix: true,
  nodeReplCommandCandidates: [fakeNodeRepl],
  includeDefaultNodeReplCandidates: false
})
const candidateText = await fs.readFile(path.join(tmpCandidate, '.codex', 'config.toml'), 'utf8')
assertGate(candidateText.includes(`command = "${fakeNodeRepl.replace(/\\/g, '\\\\')}"`), 'node_repl must be repaired to an existing Codex App command when available', candidateText)
assertGate(candidateText.includes('[mcp_servers.node_repl.env]'), 'node_repl env must be preserved when command is repaired', candidateText)
assertGate(candidateRepaired.configs.every((entry) => entry.mcp_blocks_repaired.includes('node_repl')), 'node_repl repair action must be recorded', candidateRepaired)
emitGate('doctor:codex-startup-repair', { configs: repaired.configs.length, actions: repaired.actions.length, node_repl_candidate_repaired: true })
