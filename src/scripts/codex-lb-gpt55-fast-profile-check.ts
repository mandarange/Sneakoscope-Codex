#!/usr/bin/env node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  codexFastModeDesktopStatus,
  codexLbConfigPath,
  configureCodexLb,
  ensureGlobalCodexFastModeDuringInstall,
  releaseCodexLbAuthHold,
  repairCodexLbAuth
} from '../cli/install-helpers.js'
import { repairCodexConfigStructure, splitCodexProjectConfigPolicy } from '../core/codex/codex-project-config-policy.js'
import { parseCodexConfigToml, validateCodexConfigRoundTrip } from '../core/codex/codex-config-toml.js'
import { REQUIRED_CODEX_MODEL } from '../core/codex-model-guard.js'

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-codex-lb-gpt55-fast-'))
const home = path.join(tmp, 'home')
const root = path.join(tmp, 'project')
const codexHome = path.join(home, '.codex')
const configPath = codexLbConfigPath(home)
const envPath = path.join(codexHome, 'sks-codex-lb.env')
const authPath = path.join(codexHome, 'auth.json')
const oauthBackupPath = path.join(codexHome, 'auth.chatgpt-backup.json')
const projectConfig = path.join(root, '.codex', 'config.toml')
await fs.mkdir(path.dirname(projectConfig), { recursive: true })
await fs.mkdir(codexHome, { recursive: true })
await fs.writeFile(authPath, `${JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'oauth-access' } }, null, 2)}\n`)

const setup = await configureCodexLb({
  home,
  configPath,
  envPath,
  host: 'https://lb.example.test/backend-api/codex',
  apiKey: 'sk-codex-lb-fast-fixture',
  writeEnvFile: true,
  useDefaultProvider: true,
  forceFastMode: true,
  forceCodexLbApiKeyAuth: true,
  authMode: 'codex-lb',
  shellProfile: 'skip'
})
const fastOn = await ensureGlobalCodexFastModeDuringInstall({ home, configPath, forceFastMode: true })
const first = assertFastProfile(await fs.readFile(configPath, 'utf8'), 'setup_fast_on')

const release = await releaseCodexLbAuthHold({ home, configPath, authPath, backupPath: oauthBackupPath })
const afterOauth = assertFastProfile(await fs.readFile(configPath, 'utf8'), 'use_oauth_roundtrip')

const repair = await repairCodexLbAuth({ home, configPath, envPath, forceCodexLbApiKeyAuth: true, forceFastMode: true, authMode: 'codex-lb' })
await fs.writeFile(projectConfig, [
  'default_profile = "sks-fast-high"',
  'service_tier = "fast"',
  '',
  '[user.fast_mode]',
  'visible = true',
  'enabled = true',
  '',
  '[profiles.sks-fast-high]',
  `model = "${REQUIRED_CODEX_MODEL}"`,
  'service_tier = "fast"',
  ''
].join('\n'))
const split = await splitCodexProjectConfigPolicy(root, { apply: true, codexHome, configPath: projectConfig, writeReport: false })
const structure = await repairCodexConfigStructure(configPath, { apply: true })
const final = assertFastProfile(await fs.readFile(configPath, 'utf8'), 'after_rewriters')

const ok = setup.ok !== false
  && !['failed', 'skipped_unsafe_rewrite', 'unparseable_config_preserved'].includes(String(fastOn.status))
  && release.status !== 'failed'
  && repair.ok !== false
  && split.ok === true
  && structure.ok === true
  && first.ok
  && afterOauth.ok
  && final.ok

const report = {
  schema: 'sks.codex-lb-gpt55-fast-profile-check.v1',
  ok,
  setup_status: setup.status,
  fast_on_status: fastOn.status,
  release_status: release.status,
  repair_status: repair.status,
  split_status: (split as any).status || null,
  structure_status: structure.status,
  assertions: [first, afterOauth, final],
  blockers: [first, afterOauth, final].flatMap((item) => item.blockers)
}

console.log(JSON.stringify(report, null, 2))
if (!report.ok) process.exitCode = 1

function assertFastProfile(text: string, label: string) {
  const validation = validateCodexConfigRoundTrip(text)
  const parsed = validation.ok ? parseCodexConfigToml(text) : {}
  const profile = parsed.profiles?.['sks-fast-high'] || {}
  const provider = parsed.model_providers?.['codex-lb'] || {}
  const desktop = codexFastModeDesktopStatus(text)
  const blockers = [
    ...validation.blockers,
    ...(parsed.default_profile === 'sks-fast-high' ? [] : ['default_profile_not_sks_fast_high']),
    ...(parsed.user?.fast_mode?.default_profile === undefined ? [] : ['default_profile_inside_user_fast_mode']),
    ...(profile.model === REQUIRED_CODEX_MODEL ? [] : ['sks_fast_high_model_not_required_codex_model']),
    ...(profile.service_tier === 'fast' ? [] : ['sks_fast_high_service_tier_not_fast']),
    ...(provider.requires_openai_auth === true ? [] : ['codex_lb_requires_openai_auth_not_true']),
    ...(provider.wire_api === 'responses' ? [] : ['codex_lb_wire_api_not_responses']),
    ...(desktop.on ? [] : ['desktop_fast_status_off'])
  ]
  return {
    label,
    ok: blockers.length === 0,
    default_profile: parsed.default_profile || null,
    profile_model: profile.model || null,
    profile_service_tier: profile.service_tier || null,
    provider_wire_api: provider.wire_api || null,
    provider_requires_openai_auth: provider.requires_openai_auth ?? null,
    blockers
  }
}
