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
import { CODEX_LB_TOOL_OUTPUT_RECOVERY_MIN_VERSION } from '../core/codex-lb/codex-lb-tool-output-recovery.js'
import { normalizeCodexLbToolCatalog } from '../core/codex-lb/codex-lb-tool-catalog.js'

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-codex-lb-gpt56-fast-'))
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
  apiKey: 'fixture-codex-lb-fast-key',
  writeEnvFile: true,
  useDefaultProvider: true,
  forceFastMode: true,
  forceCodexLbApiKeyAuth: true,
  authMode: 'codex-lb',
  shellProfile: 'skip',
  toolOutputRecoveryFetch
})
const fastOn = await ensureGlobalCodexFastModeDuringInstall({ home, configPath, forceFastMode: true })
const first = assertFastProfile(await fs.readFile(configPath, 'utf8'), 'setup_fast_on')

const release = await releaseCodexLbAuthHold({ home, configPath, authPath, backupPath: oauthBackupPath })
const afterOauth = assertFastProfile(await fs.readFile(configPath, 'utf8'), 'use_oauth_roundtrip')

const repair = await repairCodexLbAuth({ home, configPath, envPath, forceCodexLbApiKeyAuth: true, forceFastMode: true, authMode: 'codex-lb', toolOutputRecoveryFetch })
await fs.writeFile(projectConfig, [
  '# SKS managed fixture',
  'default_profile = "sks-fast-high"',
  'service_tier = "fast"',
  '',
  '[user.fast_mode]',
  'visible = true',
  'enabled = true',
  '',
  '[profiles.sks-fast-high]',
  'model = "future-codex-model"',
  'service_tier = "fast"',
  ''
].join('\n'))
const split = await splitCodexProjectConfigPolicy(root, { apply: true, codexHome, configPath: projectConfig, writeReport: false })
const structure = await repairCodexConfigStructure(configPath, { apply: true })
const final = assertFastProfile(await fs.readFile(configPath, 'utf8'), 'after_rewriters')
const toolCatalog = assertGpt56ToolCatalogContract()

const ok = setup.ok !== false
  && !['failed', 'skipped_unsafe_rewrite', 'unparseable_config_preserved'].includes(String(fastOn.status))
  && release.status !== 'failed'
  && repair.ok !== false
  && split.ok === true
  && structure.ok === true
  && first.ok
  && afterOauth.ok
  && final.ok
  && toolCatalog.ok

const report = {
  schema: 'sks.codex-lb-gpt56-fast-profile-check.v1',
  ok,
  setup_status: setup.status,
  fast_on_status: fastOn.status,
  release_status: release.status,
  repair_status: repair.status,
  split_status: (split as any).status || null,
  structure_status: structure.status,
  assertions: [first, afterOauth, final],
  tool_catalog: toolCatalog,
  blockers: [...[first, afterOauth, final].flatMap((item) => item.blockers), ...toolCatalog.blockers]
}

console.log(JSON.stringify(report, null, 2))
if (!report.ok) process.exitCode = 1

function assertFastProfile(text: string, label: string) {
  const validation = validateCodexConfigRoundTrip(text)
  const parsed = validation.ok ? parseCodexConfigToml(text) : {}
  const provider = parsed.model_providers?.['codex-lb'] || {}
  const desktop = codexFastModeDesktopStatus(text)
  const blockers = [
    ...validation.blockers,
    ...(parsed.default_profile === undefined ? [] : ['default_profile_legacy_key_present']),
    ...(parsed.user?.fast_mode === undefined ? [] : ['user_fast_mode_legacy_table_present']),
    ...(parsed.profiles?.['sks-fast-high'] === undefined ? [] : ['sks_fast_high_legacy_profile_present']),
    ...(parsed.model === undefined ? [] : ['codex_app_model_was_injected']),
    ...(provider.requires_openai_auth === true ? [] : ['codex_lb_requires_openai_auth_not_true']),
    ...(provider.wire_api === 'responses' ? [] : ['codex_lb_wire_api_not_responses']),
    ...(desktop.on ? [] : ['desktop_fast_status_off'])
  ]
  return {
    label,
    ok: blockers.length === 0,
    default_profile: parsed.default_profile || null,
    model: parsed.model || null,
    legacy_keys: validation.legacy_keys,
    service_tier: parsed.service_tier || null,
    provider_wire_api: provider.wire_api || null,
    provider_requires_openai_auth: provider.requires_openai_auth ?? null,
    blockers
  }
}

function assertGpt56ToolCatalogContract() {
  const normalized = normalizeCodexLbToolCatalog({
    models: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'].map(codex0144Model)
  })
  const models = normalized.catalog.models.filter((model: any) => String(model.slug).startsWith('gpt-5.6-'))
  const blockers = [
    ...normalized.blockers,
    ...(normalized.schema === 'sks.codex-lb-tool-catalog.v1' ? [] : ['codex_lb_gpt56_catalog_schema_mismatch']),
    ...(normalized.tools_transport === 'full_responses' ? [] : ['codex_lb_gpt56_native_tool_transport_not_full_responses']),
    ...(normalized.patched_models.join(',') === 'gpt-5.6-luna,gpt-5.6-sol,gpt-5.6-terra' ? [] : ['codex_lb_gpt56_catalog_patch_set_incomplete']),
    ...(models.length === 3 ? [] : ['codex_lb_gpt56_catalog_model_set_incomplete']),
    ...(models.every((model: any) => model.use_responses_lite === false) ? [] : ['codex_lb_gpt56_responses_lite_not_disabled']),
    ...(models.every((model: any) => model.tool_mode === 'code_mode_only') ? [] : ['codex_lb_gpt56_native_tool_mode_not_preserved']),
    ...(models.every((model: any) => model.supports_parallel_tool_calls === true) ? [] : ['codex_lb_gpt56_parallel_tool_calls_not_preserved']),
    ...(models.every((model: any) => model.minimal_client_version === '0.144.1') ? [] : ['codex_lb_gpt56_codex_0144_contract_missing'])
  ]
  return {
    schema: normalized.schema,
    ok: blockers.length === 0,
    codex_cli_contract: '0.144.1',
    models: normalized.gpt56_models,
    patched_models: normalized.patched_models,
    tools_transport: normalized.tools_transport,
    native_tool_mode: 'code_mode_only',
    blockers
  }
}

function codex0144Model(slug: string) {
  return {
    slug,
    display_name: slug.replace('gpt-', 'GPT-').replaceAll('-', ' '),
    supported_reasoning_levels: [{ effort: 'max', description: 'Maximum' }],
    shell_type: 'shell_command',
    visibility: 'list',
    supported_in_api: true,
    priority: 1,
    base_instructions: 'You are Codex.',
    supports_reasoning_summaries: true,
    support_verbosity: true,
    truncation_policy: { mode: 'tokens', limit: 10_000 },
    supports_parallel_tool_calls: true,
    experimental_supported_tools: [],
    tool_mode: 'code_mode_only',
    use_responses_lite: true,
    minimal_client_version: '0.144.1'
  }
}

async function toolOutputRecoveryFetch() {
  return new Response('{}', {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'x-app-version': CODEX_LB_TOOL_OUTPUT_RECOVERY_MIN_VERSION
    }
  })
}
