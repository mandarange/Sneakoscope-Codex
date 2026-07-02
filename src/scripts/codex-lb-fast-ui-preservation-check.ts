#!/usr/bin/env node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  codexLbConfigPath,
  codexLbEnvPath,
  ensureGlobalCodexFastModeDuringInstall,
  releaseCodexLbAuthHold,
  repairCodexLbAuth
} from '../cli/install-helpers.js'

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-codex-lb-fast-ui-'))
const home = path.join(tmp, 'home')
const codexHome = path.join(home, '.codex')
const configPath = codexLbConfigPath(home)
const envPath = codexLbEnvPath(home)
const authPath = path.join(codexHome, 'auth.json')
const oauthBackupPath = path.join(codexHome, 'auth.chatgpt-backup.json')
await fs.mkdir(codexHome, { recursive: true })

const oauthAuth = JSON.stringify({
  auth_mode: 'chatgpt',
  tokens: { id_token: 'oauth-id', access_token: 'oauth-access', refresh_token: 'oauth-refresh' },
  account_id: 'acct-fast-ui-fixture'
}, null, 2)

await fs.writeFile(configPath, [
  'model = "gpt-5.5"',
  'model_reasoning_effort = "low"',
  'model_provider = "codex-lb"',
  'service_tier = "fast"',
  '',
  '[features]',
  'fast_mode = true',
  'fast_mode_ui = true',
  '',
  '[user.fast_mode]',
  'visible = true',
  'enabled = true',
  '',
  '[model_providers.codex-lb]',
  'name = "openai"',
  'base_url = "https://lb.example.test/backend-api/codex"',
  'wire_api = "responses"',
  'env_key = "CODEX_LB_API_KEY"',
  'supports_websockets = true',
  'requires_openai_auth = false',
  ''
].join('\n'))
await fs.writeFile(envPath, 'export CODEX_LB_BASE_URL="https://lb.example.test/backend-api/codex"\nexport CODEX_LB_API_KEY="sk-test-fast-ui"\n')
await fs.writeFile(authPath, `${oauthAuth}\n`)

const install = await ensureGlobalCodexFastModeDuringInstall({ home, configPath, forceFastMode: true })
const firstRepair = await repairCodexLbAuth({ home, configPath, envPath, forceCodexLbApiKeyAuth: true, forceFastMode: true, authMode: 'codex-lb' })
const firstConfig = await fs.readFile(configPath, 'utf8')
const firstAssert = assertConfig(firstConfig, 'first_use_codex_lb')

const release = await releaseCodexLbAuthHold({ home, configPath, authPath, backupPath: oauthBackupPath })
const releasedConfig = await fs.readFile(configPath, 'utf8')
const releaseAssert = {
  label: 'use_oauth',
  ok: !topLevelKey(releasedConfig, 'model_provider') && hasUserFastMode(releasedConfig),
  blockers: [
    ...(topLevelKey(releasedConfig, 'model_provider') ? ['model_provider_still_selected_after_use_oauth'] : []),
    ...(hasUserFastMode(releasedConfig) ? [] : ['user_fast_mode_missing_after_use_oauth'])
  ]
}

const secondRepair = await repairCodexLbAuth({ home, configPath, envPath, forceCodexLbApiKeyAuth: true, forceFastMode: true, authMode: 'codex-lb' })
const secondConfig = await fs.readFile(configPath, 'utf8')
const secondAssert = assertConfig(secondConfig, 'second_use_codex_lb')

const report = {
  schema: 'sks.codex-lb-fast-ui-preservation-check.v1',
  ok: firstAssert.ok && releaseAssert.ok && secondAssert.ok,
  install_status: install.status,
  first_repair_status: firstRepair.status,
  release_status: release.status,
  second_repair_status: secondRepair.status,
  assertions: [firstAssert, releaseAssert, secondAssert],
  config_path: configPath,
  blockers: [...firstAssert.blockers, ...releaseAssert.blockers, ...secondAssert.blockers]
}
console.log(JSON.stringify(report, null, 2))
if (!report.ok) process.exitCode = 1

function assertConfig(text: string, label: string) {
  const blockers = [
    ...(hasUserFastMode(text) ? [] : ['user_fast_mode_visible_enabled_missing']),
    ...(tableKey(text, 'features', 'fast_mode') === 'true' ? [] : ['features_fast_mode_not_true']),
    ...(tableKey(text, 'features', 'fast_mode_ui') === 'true' ? [] : ['features_fast_mode_ui_not_true']),
    ...(hasTable(text, 'model_providers.codex-lb') ? [] : ['codex_lb_provider_table_missing']),
    ...(tableKey(text, 'model_providers.codex-lb', 'requires_openai_auth') === 'true' ? [] : ['requires_openai_auth_not_true']),
    ...(topLevelKey(text, 'model') ? ['top_level_model_forbidden'] : []),
    ...(topLevelKey(text, 'model_reasoning_effort') ? ['top_level_model_reasoning_effort_forbidden'] : [])
  ]
  return { label, ok: blockers.length === 0, blockers }
}

function hasUserFastMode(text: string) {
  return tableKey(text, 'user.fast_mode', 'visible') === 'true'
    && tableKey(text, 'user.fast_mode', 'enabled') === 'true'
}

function hasTable(text: string, table: string) {
  return new RegExp(`(^|\\n)\\[${escapeRegExp(table)}\\](?=\\n|$)`).test(text)
}

function tableKey(text: string, table: string, key: string) {
  const match = text.match(new RegExp(`(^|\\n)\\[${escapeRegExp(table)}\\]([\\s\\S]*?)(?=\\n\\[[^\\]]+\\]|\\s*$)`))
  const block = match?.[2] || ''
  return block.match(new RegExp(`(^|\\n)\\s*${escapeRegExp(key)}\\s*=\\s*([^\\n#]+)`))?.[2]?.trim().replace(/^"|"$/g, '') || ''
}

function topLevelKey(text: string, key: string) {
  const top = text.split(/\n\s*\[/)[0] || ''
  return new RegExp(`(^|\\n)\\s*${escapeRegExp(key)}\\s*=`).test(top)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
