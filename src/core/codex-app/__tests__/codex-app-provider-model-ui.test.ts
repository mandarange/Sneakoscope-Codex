import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { codexProviderModelUiStatus } from '../../codex-app.js'

test('selected codex-lb readiness is not blocked by optional GLM/OpenRouter setup', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-provider-ui-root-'))
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-provider-ui-home-'))
  const codexHome = path.join(home, '.codex')
  await fs.mkdir(codexHome, { recursive: true })
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(home, { recursive: true, force: true })
  })

  await fs.writeFile(path.join(codexHome, 'config.toml'), [
    'model_provider = "codex-lb"',
    '[model_providers.codex-lb]',
    'name = "openai"',
    'base_url = "https://lb.example.test/backend-api/codex"',
    'wire_api = "responses"',
    'env_key = "CODEX_LB_API_KEY"',
    'supports_websockets = true',
    'requires_openai_auth = true',
    ''
  ].join('\n'))
  await fs.writeFile(path.join(codexHome, 'sks-codex-lb.env'), [
    "export CODEX_LB_BASE_URL='https://lb.example.test/backend-api/codex'",
    "export CODEX_LB_API_KEY='fixture-secret'",
    ''
  ].join('\n'))

  const status = await codexProviderModelUiStatus({
    home,
    cwd: root,
    env: { HOME: home },
    codexLbModelCatalog: {
      ok: true,
      models: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
      blockers: []
    }
  })

  assert.equal(status.selected_provider, 'codex-lb')
  assert.equal(status.selected_provider_ok, true)
  assert.deepEqual(status.selected_provider_blockers, [])
  assert.equal(status.ok, true)
  assert.equal(status.status, 'ready')
  assert.deepEqual(status.blockers, [])
  assert.equal(status.optional_provider_status, 'setup_available')
  assert.ok(status.optional_provider_blockers.includes('glm_openrouter_provider_missing'))
  assert.ok(status.optional_provider_blockers.includes('openrouter_key_missing'))
})

test('selected codex-lb readiness prefers persisted model_catalog_json over a failing live /models probe', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-provider-ui-persisted-'))
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-provider-ui-persisted-home-'))
  const codexHome = path.join(home, '.codex')
  await fs.mkdir(codexHome, { recursive: true })
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(home, { recursive: true, force: true })
  })

  const catalogPath = path.join(codexHome, 'sks-codex-lb-tool-catalog.json')
  const catalog = {
    models: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'].map((slug) => ({
      slug,
      display_name: slug,
      supported_reasoning_levels: [{ effort: 'medium', description: 'Balanced' }],
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
      use_responses_lite: false,
      minimal_client_version: '0.144.5'
    }))
  }
  await fs.writeFile(catalogPath, `${JSON.stringify(catalog)}\n`, { mode: 0o600 })
  await fs.writeFile(path.join(codexHome, 'config.toml'), [
    'model_provider = "codex-lb"',
    `model_catalog_json = "${catalogPath}"`,
    '[model_providers.codex-lb]',
    'name = "openai"',
    'base_url = "https://lb.example.test/backend-api/codex"',
    'wire_api = "responses"',
    'env_key = "CODEX_LB_API_KEY"',
    'supports_websockets = true',
    'requires_openai_auth = true',
    ''
  ].join('\n'))
  await fs.writeFile(path.join(codexHome, 'sks-codex-lb.env'), [
    "export CODEX_LB_BASE_URL='https://lb.example.test/backend-api/codex'",
    "export CODEX_LB_API_KEY='fixture-secret'",
    ''
  ].join('\n'))

  const status = await codexProviderModelUiStatus({
    home,
    cwd: root,
    env: { HOME: home },
    // Intentionally omit live catalog injection so readiness must use the Desktop file.
  })

  assert.equal(status.ok, true)
  assert.equal(status.codex_lb.model_catalog_source, 'persisted_model_catalog_json')
  assert.equal(status.codex_lb.model_catalog_json_configured, true)
  assert.equal(status.codex_lb.expected_models_present, true)
  assert.equal(status.codex_lb.tools_transport, 'full_responses')
  assert.deepEqual(status.selected_provider_blockers, [])
})

test('unmarked user model_reasoning_effort does not fail Fast UI readiness under codex-lb', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-provider-ui-fast-'))
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-provider-ui-fast-home-'))
  const codexHome = path.join(home, '.codex')
  await fs.mkdir(codexHome, { recursive: true })
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(home, { recursive: true, force: true })
  })

  await fs.writeFile(path.join(codexHome, 'config.toml'), [
    'model_provider = "codex-lb"',
    'model_reasoning_effort = "high"',
    'service_tier = "fast"',
    '[features]',
    'fast_mode = true',
    '[model_providers.codex-lb]',
    'name = "openai"',
    'base_url = "https://lb.example.test/backend-api/codex"',
    'wire_api = "responses"',
    'env_key = "CODEX_LB_API_KEY"',
    'supports_websockets = true',
    'requires_openai_auth = true',
    ''
  ].join('\n'))
  await fs.writeFile(path.join(codexHome, 'sks-codex-lb.env'), [
    "export CODEX_LB_BASE_URL='https://lb.example.test/backend-api/codex'",
    "export CODEX_LB_API_KEY='fixture-secret'",
    ''
  ].join('\n'))

  const status = await codexProviderModelUiStatus({
    home,
    cwd: root,
    env: { HOME: home },
    codexLbModelCatalog: {
      ok: true,
      models: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
      blockers: []
    }
  })
  const appStatus = await (await import('../../codex-app.js')).codexAppIntegrationStatus({
    home,
    cwd: root,
    env: { HOME: home },
    codex: { bin: null },
    runProcess: async () => ({ code: 1, stdout: '', stderr: 'fixture' }),
    codexLbModelCatalog: {
      ok: true,
      models: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
      blockers: []
    }
  })

  assert.equal(status.ok, true)
  assert.equal(appStatus.features?.fast_mode_config?.ok, true)
  assert.deepEqual(appStatus.features?.fast_mode_config?.blockers || [], [])
})
